import { MigrationInterface,QueryRunner } from 'typeorm';
export class IsolatedProtocol1791936000000 implements MigrationInterface{
  async up(q:QueryRunner):Promise<void>{
    await q.query(`CREATE TABLE trade_quotes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid NOT NULL REFERENCES users(id), "walletAddress" varchar NOT NULL, "chainId" integer NOT NULL, payload jsonb NOT NULL, "expiresAt" timestamp NOT NULL, "createdAt" timestamp NOT NULL DEFAULT now())`);
    await q.query(`CREATE INDEX trade_quotes_user_expiry ON trade_quotes ("userId","expiresAt")`);
    await q.query(`CREATE TABLE transaction_intents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid NOT NULL REFERENCES users(id), "walletAddress" varchar NOT NULL, "chainId" integer NOT NULL, type varchar NOT NULL, "to" varchar NOT NULL, data text NOT NULL, value varchar NOT NULL DEFAULT '0', status varchar NOT NULL DEFAULT 'CREATED', "txHash" varchar, "expiresAt" timestamp NOT NULL, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now())`);
    await q.query(`CREATE INDEX transaction_intents_user_status ON transaction_intents ("userId",status)`);
    await q.query(`CREATE UNIQUE INDEX transaction_intents_chain_hash ON transaction_intents ("chainId",lower("txHash")) WHERE "txHash" IS NOT NULL`);
    await q.query(`CREATE TABLE indexer_state (key varchar PRIMARY KEY, "blockNumber" bigint NOT NULL, "blockHash" varchar NOT NULL, checkpoints jsonb NOT NULL DEFAULT '[]', "updatedAt" timestamp NOT NULL DEFAULT now())`);
    await q.query(`CREATE TABLE risk_alerts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid NOT NULL REFERENCES users(id), level varchar NOT NULL, message text NOT NULL, state jsonb NOT NULL, "readAt" timestamp, "createdAt" timestamp NOT NULL DEFAULT now())`);
    await q.query(`CREATE INDEX risk_alerts_user_created ON risk_alerts ("userId","createdAt")`);
    await q.query(`CREATE TABLE liquidation_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid NOT NULL REFERENCES users(id), "walletAddress" varchar NOT NULL, "assetAddress" varchar NOT NULL, status varchar NOT NULL DEFAULT 'QUEUED', transaction jsonb, "txHash" varchar, error text, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now())`);
    await q.query(`CREATE INDEX liquidation_jobs_user_status ON liquidation_jobs ("userId",status)`);
    await q.query(`ALTER TABLE transactions ADD COLUMN "blockNumber" bigint`);
  }
  async down():Promise<void>{throw new Error('Restore a verified backup to reverse the financial schema');}
}
