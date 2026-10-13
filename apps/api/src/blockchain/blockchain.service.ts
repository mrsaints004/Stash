import { protocolChain, contractAddress, VAULT_V2_ABI } from '../config/protocol.config';
import { Injectable, OnModuleInit, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPublicClient,
  keccak256,
  toHex,
  http,
  PublicClient,
  defineChain,
  type Address,
  type Hash,
  parseEventLogs,
  type Abi,
} from 'viem';

@Injectable()
export class BlockchainService implements OnModuleInit {
  private client!: PublicClient;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const chain = protocolChain(this.configService);
    this.client = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0], { timeout: 10000, retryCount: 2 }) }) as PublicClient;
    if (await this.client.getChainId() !== chain.id) throw new Error('RPC chain does not match configured chain');
    for (const key of ['STASH_VAULT_ADDRESS', 'STASH_CREDIT_ADDRESS', 'STASH_ROUTER_ADDRESS']) {
      const address = contractAddress(this.configService, key);
      const version = await this.client.readContract({ address, abi: VAULT_V2_ABI, functionName: 'version' });
      if (version !== 2n) throw new Error(`${key} must point to the isolated-account V2 deployment`);
    }
    const vault = contractAddress(this.configService, 'STASH_VAULT_ADDRESS');
    const adapter = await this.client.readContract({ address: vault, abi: VAULT_V2_ABI, functionName: 'lendingAdapter' });
    if (adapter !== keccak256(toHex('AAVE_V4_SPOKE'))) throw new Error('Arc requires the Aave V4 Spoke adapter');
    const configuredCredit = await this.client.readContract({ address: vault, abi: VAULT_V2_ABI, functionName: 'stashCredit' });
    if (configuredCredit.toLowerCase() !== contractAddress(this.configService, 'STASH_CREDIT_ADDRESS').toLowerCase()) throw new Error('Vault credit configuration mismatch');
  }

  getClient(): PublicClient {
    return this.client;
  }

  async verifyEvent(txHash: string, wallet: string, contract: Address, abi: Abi,
    eventName: string, expected: Record<string, string>) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new BadRequestException('Invalid transaction hash');
    if (!/^0x[0-9a-fA-F]{40}$/.test(contract) || /^0x0{40}$/.test(contract)) {
      throw new ServiceUnavailableException('Protocol contract is not configured');
    }
    let receipt;
    try {
      receipt = await this.client.getTransactionReceipt({ hash: txHash as Hash });
    } catch {
      throw new ServiceUnavailableException('Transaction is pending or RPC is unavailable; retry confirmation');
    }
    if (receipt.status !== 'success') throw new BadRequestException('Transaction reverted');
    if (receipt.from.toLowerCase() !== wallet.toLowerCase() || receipt.to?.toLowerCase() !== contract.toLowerCase()) {
      throw new BadRequestException('Transaction does not belong to this wallet and protocol contract');
    }
    const confirmations = Number(this.configService.get<string>('TX_CONFIRMATIONS', '2'));
    if (!Number.isInteger(confirmations) || confirmations < 1) throw new ServiceUnavailableException('Invalid confirmation configuration');
    const head = await this.client.getBlockNumber();
    if (head < receipt.blockNumber + BigInt(confirmations - 1)) {
      throw new ServiceUnavailableException('Transaction is awaiting confirmations');
    }
    const canonical = await this.client.getBlock({ blockNumber: receipt.blockNumber });
    if (canonical.hash !== receipt.blockHash) throw new ServiceUnavailableException('Transaction block was reorganized; await canonical confirmation');
    const logs = parseEventLogs({ abi, eventName,
      logs: receipt.logs.filter(log => log.address.toLowerCase() === contract.toLowerCase()), strict: true });
    for (const log of logs) {
      const args = (log as unknown as { args: Record<string, unknown> }).args;
      if (Object.entries(expected).every(([key, value]) => String(args[key]).toLowerCase() === value.toLowerCase())) {
        return args;
      }
    }
    throw new BadRequestException('Confirmed protocol event does not match the requested action');
  }

  async getBlockNumber(): Promise<bigint> {
    return this.client.getBlockNumber();
  }

  async getBalance(address: string): Promise<bigint> {
    return this.client.getBalance({
      address: address as Address,
    });
  }
}
