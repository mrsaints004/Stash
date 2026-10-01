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
    autoLoadEntities: true,
    synchronize: true, // dev only — disable in production
  };
}
