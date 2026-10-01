import { Controller, Get } from '@nestjs/common';
import { OracleService } from './oracle.service';

@Controller('oracle')
export class OracleController {
  constructor(private readonly oracleService: OracleService) {}

  @Get('prices')
  async getPrices() {
    return this.oracleService.getAllPrices();
  }
}
