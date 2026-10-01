import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPublicClient,
  http,
  PublicClient,
  defineChain,
  type Address,
} from 'viem';

const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 6,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.testnet.arc.io'],
    },
  },
  testnet: true,
});

@Injectable()
export class BlockchainService implements OnModuleInit {
  private client!: PublicClient;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const rpcUrl = this.configService.get<string>(
      'ARC_RPC_URL',
      'https://rpc.testnet.arc.io',
    );

    this.client = createPublicClient({
      chain: arcTestnet,
      transport: http(rpcUrl),
    }) as PublicClient;
  }

  getClient(): PublicClient {
    return this.client;
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
