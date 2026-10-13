import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService, HealthStatus } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  live(){return {status:'ok'};}

  @Get()
  async check(): Promise<HealthStatus> {
    const status=await this.healthService.check();
    if(status.status!=='ok')throw new ServiceUnavailableException(status);
    return status;
  }
}
