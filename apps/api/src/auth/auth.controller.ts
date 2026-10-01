import { Controller, Post, Body } from '@nestjs/common';
import { IsString, IsNotEmpty } from 'class-validator';
import { AuthService } from './auth.service';

class ChallengeDto {
  @IsString()
  @IsNotEmpty()
  address!: string;
}

class VerifyDto {
  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsString()
  @IsNotEmpty()
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
