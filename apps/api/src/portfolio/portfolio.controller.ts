import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { PortfolioService } from './portfolio.service';
import { AuthGuard, JwtPayload } from '../auth/auth.guard';

@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get('summary')
  @UseGuards(AuthGuard)
  async getSummary(@Req() req: Request) {
    const user = (req as any).user as JwtPayload;
    return this.portfolioService.getSummary(user.sub);
  }
}
