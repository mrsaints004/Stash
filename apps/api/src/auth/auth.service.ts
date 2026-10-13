import { RedisService } from '../redis/redis.module';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SiweMessage, generateNonce } from 'siwe';
import { User, Wallet } from '../database/entities';

interface StoredNonce {
  nonce: string;
  address: string;
  message: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService {

  constructor(
    private readonly jwtService: JwtService,
    private readonly redis: RedisService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
  ) {}

  async generateChallenge(address: string) {
    const nonce = generateNonce();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const domain = process.env.SIWE_DOMAIN ?? 'localhost:3000';
    const uri = process.env.SIWE_URI ?? 'http://localhost:3000';
    const chainId = Number(process.env.CHAIN_ID ?? 5042002);

    const message = new SiweMessage({
      domain,
      address,
      statement: 'Sign in to Stash',
      uri,
      version: '1',
      chainId,
      nonce,
      expirationTime: expiresAt.toISOString(),
    });

    const preparedMessage = message.prepareMessage();

    await this.redis.client.set(`stash:siwe:${nonce}`, JSON.stringify({ nonce, expiresAt: expiresAt.toISOString(), address: address.toLowerCase(), message: preparedMessage }), 'EX', 600, 'NX');

    return {
      message: preparedMessage,
      nonce,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async verifySignature(message: string, signature: string) {
    try {
      const siweMessage = new SiweMessage(message);
      const result = await siweMessage.verify({ signature, domain: process.env.SIWE_DOMAIN ?? 'localhost:3000' });

      if (!result.success) {
        throw new UnauthorizedException('Invalid signature');
      }

      const { nonce, address } = siweMessage;

      // Check nonce exists and hasn't expired
      const stored = await this.redis.client.get(`stash:siwe:${nonce}`);
      const storedNonce = stored ? JSON.parse(stored) : null;
      if (!storedNonce) {
        throw new UnauthorizedException('Invalid or expired nonce');
      }

      if (Date.now() > Date.parse(storedNonce.expiresAt)) {
        await this.redis.client.del(`stash:siwe:${nonce}`);
        throw new UnauthorizedException('Nonce has expired');
      }

      if (storedNonce.message !== message || storedNonce.address !== address.toLowerCase() ||
        siweMessage.uri !== (process.env.SIWE_URI ?? 'http://localhost:3000') ||
        siweMessage.chainId !== Number(process.env.CHAIN_ID ?? 5042002)) {
        throw new UnauthorizedException('Challenge does not match the requested wallet, chain, and application');
      }

      // Consume the nonce
      const consumed = await this.redis.client.eval("if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", 1, `stash:siwe:${nonce}`, stored!);
      if (Number(consumed) !== 1) throw new UnauthorizedException('Challenge was already used');

      // Find or create user by address
      const user = await this.findOrCreateUserByAddress(address);

      // Issue JWT
      const payload = { sub: user.id, address };
      const accessToken = this.jwtService.sign(payload);

      const decoded = this.jwtService.decode(accessToken) as { exp: number };
      const expiresAt = new Date(decoded.exp * 1000).toISOString();

      return {
        accessToken,
        expiresAt,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Signature verification failed');
    }
  }

  private async findOrCreateUserByAddress(address: string): Promise<User> {
    const wallet = await this.walletRepository.findOne({
      where: { address: address.toLowerCase() },
      relations: ['user'],
    });

    if (wallet) {
      return wallet.user;
    }

    return this.userRepository.manager.transaction(async manager => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`wallet:${address.toLowerCase()}`]);
      const wallets = manager.getRepository(Wallet);
      const existing = await wallets.findOne({ where: { address: address.toLowerCase() }, relations: ['user'] });
      if (existing) return existing.user;
      const users = manager.getRepository(User); const user = await users.save(users.create());
      await wallets.save(wallets.create({ address: address.toLowerCase(), userId: user.id, chainId: Number(process.env.CHAIN_ID ?? 5042002), isPrimary: true }));
      return user;
    });
  }
}
