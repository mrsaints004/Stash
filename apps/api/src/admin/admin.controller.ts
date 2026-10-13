import {Body,Controller,Get,Post,UseGuards} from '@nestjs/common';
import {AuthGuard} from '../auth/auth.guard';
import {AdminGuard} from './admin.guard';
import {AdminService} from './admin.service';
import {ProposalDto} from './proposal.dto';
@Controller('admin') @UseGuards(AuthGuard,AdminGuard)
export class AdminController {
 constructor(private readonly service:AdminService){}
 @Get('overview') overview(){return this.service.overview();}
 @Post('proposal') proposal(@Body() body:ProposalDto){return this.service.proposal(body);}
}
