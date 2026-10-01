import {
  Controller,
  Get,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, JwtPayload } from '../auth/auth.guard';
import { RiskService } from './risk.service';

@Controller('risk')
@UseGuards(AuthGuard)
export class RiskController {
  constructor(private readonly riskService: RiskService) {}

  @Get('status')
  async getRiskStatus(@Req() req: Request) {
    const user = (req as any).user as JwtPayload;
    return this.riskService.checkRisk(user.sub);
  }

  @Get('history')
  async getRiskHistory(
    @Req() req: Request,
    @Query('limit') limit?: string,
  ) {
    const user = (req as any).user as JwtPayload;
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    return this.riskService.getRiskHistory(user.sub, parsedLimit);
  }

  @Get('alerts')
  async getAlerts() {
    return this.riskService.checkAllPositions();
  }
}
