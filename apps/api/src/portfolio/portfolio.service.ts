import { Injectable } from '@nestjs/common';
import { CreditService } from '../credit/credit.service';
import { TradeService } from '../trade/trade.service';
@Injectable()
export class PortfolioService {
  constructor(private readonly credit:CreditService,private readonly trade:TradeService){}
  async getSummary(userId:string){
    const state=await this.credit.calculateStashPower(userId);
    const health=Number(state.healthFactor)/1e18;
    const riskLevel=state.debtAmount===0?'safe':health<=1?'liquidation':health<=1.1?'danger':health<=1.25?'warning':'safe';
    return {...state,totalCollateralUsd:state.totalCollateralUsd.toFixed(2),totalDebtUsd:state.debtUsd.toFixed(6),
      stashPower:state.stashPower.toFixed(6),availableCredit:state.availableCredit.toFixed(6),usedCredit:state.usedCredit.toFixed(6),
      ltv:state.ltv,riskLevel,tradePositions:await this.trade.getActivePositions(userId)};
  }
}
