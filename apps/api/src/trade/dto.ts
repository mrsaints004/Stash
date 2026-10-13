import { Matches, MaxLength, IsString, IsNotEmpty, IsOptional, IsInt, Min, Max, IsUUID } from 'class-validator';

export class GetQuoteDto {
  @IsString()
  @IsNotEmpty()
  tokenIn!: string;

  @IsString()
  @IsNotEmpty()
  tokenOut!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]+$/)
  @MaxLength(78)
  amountIn!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  slippageBps?: number;
}

export class PrepareTradeDto {
  @IsUUID() quoteId!: string;
}

export class ConfirmTradeDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[0-9a-fA-F]{64}$/)
  txHash!: string;

  @IsString()
  @IsNotEmpty()
  tokenIn!: string;

  @IsString()
  @IsNotEmpty()
  tokenOut!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]+$/)
  @MaxLength(78)
  amountIn!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]+$/)
  @MaxLength(78)
  amountOut!: string;
}
