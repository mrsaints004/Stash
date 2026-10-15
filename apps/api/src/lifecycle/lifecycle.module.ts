import { Global, Module, Controller, Get, Post, Param, Body, Req, UseGuards } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AuthGuard, JwtPayload } from '../auth/auth.guard';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { TransactionIntent } from '../database/entities/transaction-intent.entity';
import { Transaction } from '../database/entities';
import { LifecycleService } from './lifecycle.service';
class SubmitDto { @IsString() @Matches(/^0x[0-9a-fA-F]{64}$/) txHash!: string; }
@Controller('transactions') @UseGuards(AuthGuard)
class LifecycleController {
  constructor(private readonly service: LifecycleService) {}
  private user(req:any): string { return (req.user as JwtPayload).sub; }
  @Get() list(@Req() req:any) { return this.service.list(this.user(req)); }
  @Get(':id') async get(@Req() req:any,@Param('id') id:string) { return this.service.refresh(await this.service.get(this.user(req),id)); }
  @Post(':id/awaiting-signature') awaiting(@Req() req:any,@Param('id') id:string) { return this.service.awaitingSignature(this.user(req),id); }
  @Post(':id/rejected') rejected(@Req() req:any,@Param('id') id:string) { return this.service.rejected(this.user(req),id); }
  @Post(':id/submit') submit(@Req() req:any,@Param('id') id:string,@Body() body:SubmitDto) { return this.service.submit(this.user(req),id,body.txHash); }
}
@Global()
@Module({imports:[TypeOrmModule.forFeature([TransactionIntent,Transaction]),AuthModule,BlockchainModule],providers:[LifecycleService],controllers:[LifecycleController],exports:[LifecycleService]})
export class LifecycleModule {}
