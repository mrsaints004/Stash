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
import { TradeService } from './trade.service';
import { GetQuoteDto, PrepareTradeDto, ConfirmTradeDto } from './dto';

@Controller('trade')
@UseGuards(AuthGuard)
export class TradeController {
  constructor(private readonly tradeService: TradeService) {}

  @Post('quote')
  async getQuote(@Body() dto: GetQuoteDto) {
    return this.tradeService.getQuote(
      dto.tokenIn,
      dto.tokenOut,
      dto.amountIn,
      dto.slippageBps,
    );
  }

  @Post('prepare')
  async prepareTrade(
    @Body() dto: PrepareTradeDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user as JwtPayload;
    return this.tradeService.prepareTrade(
      user.sub,
      user.address,
      dto.tokenIn,
      dto.tokenOut,
      dto.amountIn,
      dto.slippageBps,
    );
  }

  @Post('confirm')
  async confirmTrade(
    @Body() dto: ConfirmTradeDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user as JwtPayload;
    return this.tradeService.confirmTrade(
      user.sub,
      user.address,
      dto.txHash,
      dto.tokenIn,
      dto.tokenOut,
      dto.amountIn,
      dto.amountOut,
    );
  }

  @Get('history')
  async getTradeHistory(@Req() req: Request) {
    const user = (req as any).user as JwtPayload;
    return this.tradeService.getTradeHistory(user.sub);
  }

  @Get('positions')
  async getActivePositions(@Req() req: Request) {
    const user = (req as any).user as JwtPayload;
    return this.tradeService.getActivePositions(user.sub);
  }
}
