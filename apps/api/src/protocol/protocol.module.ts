import { Global, Module, Controller, Get } from '@nestjs/common';
import { ProtocolService } from './protocol.service';
import { BlockchainModule } from '../blockchain/blockchain.module';
@Controller('protocol')
class ProtocolController {
  constructor(private readonly service: ProtocolService) {}
  @Get('config') configuration() { return this.service.configuration(); }
}
@Global()
@Module({ imports: [BlockchainModule], providers: [ProtocolService], controllers: [ProtocolController], exports: [ProtocolService] })
export class ProtocolModule {}
