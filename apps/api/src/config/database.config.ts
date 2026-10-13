import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export function databaseConfigFactory(
  configService: ConfigService,
): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: configService.get<string>('DATABASE_HOST', 'localhost'),
    port: configService.get<number>('DATABASE_PORT', 5432),
    database: configService.get<string>('DATABASE_NAME', 'stash'),
    username: configService.get<string>('DATABASE_USER', 'stash'),
    password: configService.get<string>('DATABASE_PASSWORD', 'stash'),
    ssl: configService.get<string>('DATABASE_SSL', 'false') === 'true' ? { rejectUnauthorized: true } : false,
    extra: { connectionTimeoutMillis: 5000, statement_timeout: 10000, max: 20 },
    autoLoadEntities: true,
    migrations: [__dirname + '/../database/migrations/*.js'],
    synchronize: configService.get<string>('NODE_ENV') !== 'production',
    migrationsRun: false,
  };
}
