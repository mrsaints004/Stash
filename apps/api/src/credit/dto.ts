import { IsString, IsNotEmpty } from 'class-validator';

export class PrepareBorrowDto {
  @IsString()
  @IsNotEmpty()
  amount!: string;
}

export class ConfirmBorrowDto {
  @IsString()
  @IsNotEmpty()
  txHash!: string;

  @IsString()
  @IsNotEmpty()
  amount!: string;
}

export class PrepareRepayDto {
  @IsString()
  @IsNotEmpty()
  amount!: string;
}

export class ConfirmRepayDto {
  @IsString()
  @IsNotEmpty()
  txHash!: string;

  @IsString()
  @IsNotEmpty()
  amount!: string;
}
