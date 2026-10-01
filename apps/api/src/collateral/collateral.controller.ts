import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, JwtPayload } from '../auth/auth.guard';
import { CollateralService } from './collateral.service';
import {
  PrepareDepositDto,
  ConfirmDepositDto,
  PrepareWithdrawDto,
  ConfirmWithdrawDto,
} from './dto';

@Controller('collateral')
@UseGuards(AuthGuard)
export class CollateralController {
  constructor(private readonly collateralService: CollateralService) {}

  @Post('prepare-deposit')
  async prepareDeposit(
    @Body() dto: PrepareDepositDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user as JwtPayload;
    return this.collateralService.prepareDeposit(
      user.sub,
      user.address,
      dto.assetAddress,
      dto.amount,
    );
  }

  @Post('confirm-deposit')
  async confirmDeposit(
    @Body() dto: ConfirmDepositDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user as JwtPayload;
    return this.collateralService.confirmDeposit(
      user.sub,
      user.address,
      dto.txHash,
      dto.assetAddress,
      dto.amount,
    );
  }

  @Post('prepare-withdraw')
  async prepareWithdraw(
    @Body() dto: PrepareWithdrawDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user as JwtPayload;
    return this.collateralService.prepareWithdraw(
      user.sub,
      user.address,
      dto.assetAddress,
      dto.amount,
    );
  }

  @Post('confirm-withdraw')
  async confirmWithdraw(
    @Body() dto: ConfirmWithdrawDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user as JwtPayload;
    return this.collateralService.confirmWithdraw(
      user.sub,
      user.address,
      dto.txHash,
      dto.assetAddress,
      dto.amount,
    );
  }

  @Get('positions')
  async getPositions(@Req() req: Request) {
    const user = (req as any).user as JwtPayload;
    return this.collateralService.getPositions(user.sub);
  }
}
