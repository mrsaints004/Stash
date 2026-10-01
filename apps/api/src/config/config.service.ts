/**
 * Configuration is handled via @nestjs/config's ConfigService.
 *
 * This file re-exports ConfigModule and ConfigService for convenience.
 * All environment variables are loaded from ../../.env via ConfigModule.forRoot()
 * in app.module.ts.
 *
 * Usage in any service:
 *   constructor(private readonly configService: ConfigService) {}
 *   const value = this.configService.get<string>('ENV_VAR_NAME');
 */
export { ConfigModule, ConfigService } from '@nestjs/config';
