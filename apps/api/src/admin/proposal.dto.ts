import {IsIn,IsOptional,IsEthereumAddress,Matches,IsInt,Min,Max,IsBoolean} from 'class-validator';
export class ProposalDto {
 @IsIn(['maximum-credit','route','output','pause','unpause','asset-risk']) action!:string;
 @IsOptional() @Matches(/^[0-9]{1,78}$/) amount?:string;
 @IsOptional() @IsEthereumAddress() target?:`0x${string}`;
 @IsOptional() @IsEthereumAddress() spender?:`0x${string}`;
 @IsOptional() @IsEthereumAddress() asset?:`0x${string}`;
 @IsOptional() @IsEthereumAddress() feed?:`0x${string}`;
 @IsOptional() @IsBoolean() enabled?:boolean;
 @IsOptional() @IsInt() @Min(1) @Max(7500) factorBps?:number;
 @IsOptional() @IsInt() @Min(1) @Max(4294967295) maxAgeSeconds?:number;
}
