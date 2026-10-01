import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, Wallet } from '../database/entities';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
  ) {}

  async getProfile(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['wallets'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findOrCreateByAddress(address: string): Promise<User> {
    const normalizedAddress = address.toLowerCase();

    const wallet = await this.walletRepository.findOne({
      where: { address: normalizedAddress },
      relations: ['user'],
    });

    if (wallet) {
      return wallet.user;
    }

    // Create new user
    const user = this.userRepository.create();
    const savedUser = await this.userRepository.save(user);

    // Create wallet linked to user
    const newWallet = this.walletRepository.create({
      address: normalizedAddress,
      chainId: 5042002,
      isPrimary: true,
      userId: savedUser.id,
    });
    await this.walletRepository.save(newWallet);

    // Return user with wallets relation loaded
    return this.userRepository.findOneOrFail({
      where: { id: savedUser.id },
      relations: ['wallets'],
    });
  }
}
