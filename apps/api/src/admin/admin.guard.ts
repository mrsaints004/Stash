import {CanActivate,ExecutionContext,ForbiddenException,Injectable} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
@Injectable()
export class AdminGuard implements CanActivate {
 constructor(private readonly config:ConfigService){}
 canActivate(context:ExecutionContext){
  const wallet=context.switchToHttp().getRequest().user?.address?.toLowerCase();
  const allowed=this.config.get<string>('ADMIN_WALLETS','').split(',').map(value=>value.trim().toLowerCase()).filter(value=>/^0x[0-9a-f]{40}$/.test(value));
  if(!wallet||!allowed.includes(wallet))throw new ForbiddenException('Administrator access required');
  return true;
 }
}
