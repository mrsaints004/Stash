import {
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  NotFoundException,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, JwtPayload } from '../auth/auth.guard';
import { DataSource } from 'typeorm';
import { RiskAlert } from '../database/entities';
import { RiskService } from './risk.service';

@Controller('risk')
@UseGuards(AuthGuard)
export class RiskController {
  constructor(private readonly riskService: RiskService, private readonly db: DataSource) {}

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
  async getAlerts(@Req() req: Request) {
    const user = (req as any).user as JwtPayload;
    return this.db.getRepository(RiskAlert).find({ where: { userId: user.sub }, order: { createdAt: 'DESC' }, take: 100 });
  }
  @Post('alerts/:id/read')
  async readAlert(@Req() req: Request, @Param('id', new ParseUUIDPipe()) id: string) {
    const user = (req as any).user as JwtPayload;
    const result = await this.db.getRepository(RiskAlert).update({ id, userId: user.sub }, { readAt: new Date() });
    if (!result.affected) throw new NotFoundException('Alert not found');
    return { read: true };
  }

}
