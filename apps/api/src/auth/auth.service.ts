import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SiweMessage, generateNonce } from 'siwe';
import { User, Wallet } from '../database/entities';

interface StoredNonce {
  nonce: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  private nonceStore = new Map<string, StoredNonce>();

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
  ) {}

  async generateChallenge(address: string) {
    const nonce = generateNonce();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const message = new SiweMessage({
      domain: 'localhost:3000',
      address,
      statement: 'Sign in to Stash',
      uri: 'http://localhost:3000',
      version: '1',
      chainId: 5042002,
      nonce,
      expirationTime: expiresAt.toISOString(),
    });

    const preparedMessage = message.prepareMessage();

    this.nonceStore.set(nonce, { nonce, expiresAt });

    return {
      message: preparedMessage,
      nonce,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async verifySignature(message: string, signature: string) {
    try {
      const siweMessage = new SiweMessage(message);
      const result = await siweMessage.verify({ signature });

      if (!result.success) {
        throw new UnauthorizedException('Invalid signature');
      }

      const { nonce, address } = siweMessage;

      // Check nonce exists and hasn't expired
      const storedNonce = this.nonceStore.get(nonce);
      if (!storedNonce) {
        throw new UnauthorizedException('Invalid or expired nonce');
      }

      if (new Date() > storedNonce.expiresAt) {
        this.nonceStore.delete(nonce);
        throw new UnauthorizedException('Nonce has expired');
      }

      // Consume the nonce
      this.nonceStore.delete(nonce);

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

    // Create new user and wallet
    const user = this.userRepository.create();
    const savedUser = await this.userRepository.save(user);

    const newWallet = this.walletRepository.create({
      address: address.toLowerCase(),
      chainId: 5042002,
      isPrimary: true,
      userId: savedUser.id,
    });
    await this.walletRepository.save(newWallet);

    return savedUser;
  }
}
