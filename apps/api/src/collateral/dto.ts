import { Matches, MaxLength, IsString, IsNotEmpty } from 'class-validator';

export class PrepareDepositDto {
  @IsString()
  @IsNotEmpty()
  assetAddress!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]+$/)
  @MaxLength(78)
  amount!: string;
}

export class ConfirmDepositDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[0-9a-fA-F]{64}$/)
  txHash!: string;

  @IsString()
  @IsNotEmpty()
  assetAddress!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]+$/)
  @MaxLength(78)
  amount!: string;
}

export class PrepareWithdrawDto {
  @IsString()
  @IsNotEmpty()
  assetAddress!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]+$/)
  @MaxLength(78)
  amount!: string;
}

export class ConfirmWithdrawDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[0-9a-fA-F]{64}$/)
  txHash!: string;

  @IsString()
  @IsNotEmpty()
  assetAddress!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]+$/)
  @MaxLength(78)
  amount!: string;
}
