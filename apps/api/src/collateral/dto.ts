import { IsString, IsNotEmpty } from 'class-validator';

export class PrepareDepositDto {
  @IsString()
  @IsNotEmpty()
  assetAddress!: string;

  @IsString()
  @IsNotEmpty()
  amount!: string;
}

export class ConfirmDepositDto {
  @IsString()
  @IsNotEmpty()
  txHash!: string;

  @IsString()
  @IsNotEmpty()
  assetAddress!: string;

  @IsString()
  @IsNotEmpty()
  amount!: string;
}

export class PrepareWithdrawDto {
  @IsString()
  @IsNotEmpty()
  assetAddress!: string;

  @IsString()
  @IsNotEmpty()
  amount!: string;
}

export class ConfirmWithdrawDto {
  @IsString()
  @IsNotEmpty()
  txHash!: string;

  @IsString()
  @IsNotEmpty()
  assetAddress!: string;

  @IsString()
  @IsNotEmpty()
  amount!: string;
}
