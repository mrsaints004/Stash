import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { UserService } from './user.service';
import { AuthGuard, JwtPayload } from '../auth/auth.guard';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('profile')
  @UseGuards(AuthGuard)
  async getProfile(@Req() req: Request) {
    const user = (req as any).user as JwtPayload;
    return this.userService.getProfile(user.sub);
  }
}
