import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as entities from './entities';

export default new DataSource({
  type: 'postgres', host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT ?? 5432), database: process.env.DATABASE_NAME,
  username: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD,
  ssl: process.env.DATABASE_SSL === 'true' ? {rejectUnauthorized:true} : false,
  entities: Object.values(entities), migrations: [__dirname + '/migrations/*.js'], synchronize: false,
});
