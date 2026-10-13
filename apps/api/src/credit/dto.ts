import { Matches, MaxLength, IsString, IsNotEmpty } from 'class-validator';

export class PrepareBorrowDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]+$/)
  @MaxLength(78)
  amount!: string;
}

export class ConfirmBorrowDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[0-9a-fA-F]{64}$/)
  txHash!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]+$/)
  @MaxLength(78)
  amount!: string;
}

export class PrepareRepayDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]+$/)
  @MaxLength(78)
  amount!: string;
}

export class ConfirmRepayDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[0-9a-fA-F]{64}$/)
  txHash!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]+$/)
  @MaxLength(78)
  amount!: string;
}
