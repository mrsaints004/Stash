import { MigrationInterface, QueryRunner } from 'typeorm';

/** Existing deployments must reconcile duplicate receipts/positions before applying indexes. */
export class InitialSchema1791849600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("CREATE TABLE IF NOT EXISTS \"users\" (\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid(), \"createdAt\" timestamp NOT NULL DEFAULT now(), \"updatedAt\" timestamp NOT NULL DEFAULT now())");
    await queryRunner.query("CREATE TABLE IF NOT EXISTS \"trade_positions\" (\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid(), \"userId\" uuid NOT NULL REFERENCES users(id), \"tokenIn\" varchar NOT NULL, \"tokenOut\" varchar NOT NULL, \"amountIn\" varchar NOT NULL, \"amountOut\" varchar NOT NULL, \"status\" varchar NOT NULL DEFAULT 'pending', \"createdAt\" timestamp NOT NULL DEFAULT now())");
    await queryRunner.query("CREATE TABLE IF NOT EXISTS \"assets\" (\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid(), \"symbol\" varchar NOT NULL, \"name\" varchar NOT NULL, \"address\" varchar NOT NULL, \"decimals\" int NOT NULL, \"isCollateral\" boolean NOT NULL, \"isActive\" boolean NOT NULL DEFAULT true)");
    await queryRunner.query("CREATE TABLE IF NOT EXISTS \"transactions\" (\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid(), \"userId\" uuid NOT NULL REFERENCES users(id), \"type\" varchar NOT NULL, \"txHash\" varchar NOT NULL, \"status\" varchar NOT NULL, \"chainId\" int NOT NULL, \"createdAt\" timestamp NOT NULL DEFAULT now(), \"confirmedAt\" timestamp)");
    await queryRunner.query("CREATE TABLE IF NOT EXISTS \"credit_positions\" (\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid(), \"userId\" uuid NOT NULL REFERENCES users(id), \"stashPower\" numeric(24,6) NOT NULL, \"usedCredit\" numeric(24,6) NOT NULL, \"debtAmount\" numeric(24,6) NOT NULL, \"ltv\" numeric(8,6) NOT NULL, \"updatedAt\" timestamp NOT NULL DEFAULT now())");
    await queryRunner.query("CREATE TABLE IF NOT EXISTS \"collateral_positions\" (\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid(), \"userId\" uuid NOT NULL REFERENCES users(id), \"walletAddress\" varchar NOT NULL, \"assetSymbol\" varchar NOT NULL, \"assetAddress\" varchar NOT NULL, \"amount\" varchar NOT NULL, \"usdValue\" numeric(18,2) NOT NULL, \"createdAt\" timestamp NOT NULL DEFAULT now(), \"updatedAt\" timestamp NOT NULL DEFAULT now())");
    await queryRunner.query("CREATE TABLE IF NOT EXISTS \"risk_snapshots\" (\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid(), \"userId\" uuid NOT NULL REFERENCES users(id), \"totalCollateralUsd\" numeric(18,2) NOT NULL, \"totalDebtUsd\" numeric(18,2) NOT NULL, \"ltv\" numeric(8,6) NOT NULL, \"riskLevel\" varchar NOT NULL, \"createdAt\" timestamp NOT NULL DEFAULT now())");
    await queryRunner.query("CREATE TABLE IF NOT EXISTS \"protocol_parameters\" (\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid(), \"key\" varchar NOT NULL UNIQUE, \"value\" varchar NOT NULL, \"updatedAt\" timestamp NOT NULL DEFAULT now())");
    await queryRunner.query("CREATE TABLE IF NOT EXISTS \"oracle_prices\" (\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid(), \"assetSymbol\" varchar NOT NULL, \"assetAddress\" varchar NOT NULL, \"priceUsd\" numeric(18,8) NOT NULL, \"source\" varchar NOT NULL, \"createdAt\" timestamp NOT NULL DEFAULT now())");
    await queryRunner.query("CREATE TABLE IF NOT EXISTS \"withdrawals\" (\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid(), \"userId\" uuid NOT NULL REFERENCES users(id), \"assetAddress\" varchar NOT NULL, \"amount\" varchar NOT NULL, \"txHash\" varchar, \"status\" varchar NOT NULL, \"createdAt\" timestamp NOT NULL DEFAULT now())");
    await queryRunner.query("CREATE TABLE IF NOT EXISTS \"chains\" (\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid(), \"chainId\" int NOT NULL UNIQUE, \"name\" varchar NOT NULL, \"rpcUrl\" varchar NOT NULL, \"isActive\" boolean NOT NULL DEFAULT true)");
    await queryRunner.query("CREATE TABLE IF NOT EXISTS \"trade_executions\" (\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid(), \"tradePositionId\" uuid NOT NULL REFERENCES trade_positions(id), \"txHash\" varchar, \"status\" varchar NOT NULL, \"gasUsed\" varchar, \"createdAt\" timestamp NOT NULL DEFAULT now(), \"confirmedAt\" timestamp)");
    await queryRunner.query("CREATE TABLE IF NOT EXISTS \"wallets\" (\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid(), \"address\" varchar NOT NULL UNIQUE, \"chainId\" int NOT NULL, \"isPrimary\" boolean NOT NULL DEFAULT true, \"userId\" uuid NOT NULL REFERENCES users(id))");
    await queryRunner.query("CREATE TABLE IF NOT EXISTS \"repayments\" (\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid(), \"userId\" uuid NOT NULL REFERENCES users(id), \"amount\" varchar NOT NULL, \"txHash\" varchar NOT NULL, \"status\" varchar NOT NULL, \"createdAt\" timestamp NOT NULL DEFAULT now())");
    await queryRunner.query("ALTER TABLE credit_positions ALTER COLUMN \"stashPower\" TYPE numeric(24,6)");
    await queryRunner.query("ALTER TABLE credit_positions ALTER COLUMN \"usedCredit\" TYPE numeric(24,6)");
    await queryRunner.query("ALTER TABLE credit_positions ALTER COLUMN \"debtAmount\" TYPE numeric(24,6)");
    await queryRunner.query("CREATE UNIQUE INDEX IF NOT EXISTS transactions_chain_hash_unique ON transactions (\"chainId\", lower(\"txHash\"))");
    await queryRunner.query("CREATE UNIQUE INDEX IF NOT EXISTS credit_user_unique ON credit_positions (\"userId\")");
    await queryRunner.query("CREATE UNIQUE INDEX IF NOT EXISTS collateral_user_asset_unique ON collateral_positions (\"userId\", \"assetAddress\")");
  }
  async down(): Promise<void> {
    throw new Error('Restore a verified database backup to reverse the financial schema migration');
  }
}
