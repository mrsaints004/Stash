import { Controller, Post, Body } from '@nestjs/common';
import { IsString, IsNotEmpty, Matches, MaxLength } from 'class-validator';
import { AuthService } from './auth.service';

class ChallengeDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[0-9a-fA-F]{40}$/)
  address!: string;
}

class VerifyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  message!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  signature!: string;

  @IsString()
  address?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('challenge')
  async challenge(@Body() dto: ChallengeDto) {
    const result = await this.authService.generateChallenge(dto.address);
    return { data: result };
  }

  @Post('verify')
  async verify(@Body() dto: VerifyDto) {
    const result = await this.authService.verifySignature(dto.message, dto.signature);
    return { data: result };
  }
}
