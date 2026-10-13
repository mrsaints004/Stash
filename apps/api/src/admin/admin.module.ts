import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module';
import {CreditModule} from '../credit/credit.module';
import {BlockchainModule} from '../blockchain/blockchain.module';
import {AdminController} from './admin.controller';
import {AdminGuard} from './admin.guard';
import {AdminService} from './admin.service';
@Module({imports:[AuthModule,CreditModule,BlockchainModule],controllers:[AdminController],providers:[AdminGuard,AdminService]})
export class AdminModule{}
