import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, JwtPayload } from '../auth/auth.guard';
import { CreditService } from './credit.service';
import {
  PrepareBorrowDto,
  ConfirmBorrowDto,
  PrepareRepayDto,
  ConfirmRepayDto,
} from './dto';

@Controller('credit')
@UseGuards(AuthGuard)
export class CreditController {
  constructor(private readonly creditService: CreditService) {}

  @Get('stash-power')
  async getStashPower(@Req() req: Request) {
    const user = (req as any).user as JwtPayload;
    return this.creditService.calculateStashPower(user.sub);
  }

  @Post('prepare-borrow')
  async prepareBorrow(
    @Body() dto: PrepareBorrowDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user as JwtPayload;
    return this.creditService.prepareBorrow(
      user.sub,
      user.address,
      dto.amount,
    );
  }

  @Post('confirm-borrow')
  async confirmBorrow(
    @Body() dto: ConfirmBorrowDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user as JwtPayload;
    return this.creditService.confirmBorrow(
      user.sub,
      user.address,
      dto.txHash,
      dto.amount,
    );
  }

  @Post('prepare-repay')
  async prepareRepay(
    @Body() dto: PrepareRepayDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user as JwtPayload;
    return this.creditService.prepareRepay(
      user.sub,
      user.address,
      dto.amount,
    );
  }

  @Post('confirm-repay')
  async confirmRepay(
    @Body() dto: ConfirmRepayDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user as JwtPayload;
    return this.creditService.confirmRepay(
      user.sub,
      user.address,
      dto.txHash,
      dto.amount,
    );
  }

  @Get('debt')
  async getDebt(@Req() req: Request) {
    const user = (req as any).user as JwtPayload;
    return this.creditService.getDebt(user.sub);
  }
}
