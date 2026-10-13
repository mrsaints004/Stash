import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
async function bootstrap(){const app=await NestFactory.createApplicationContext(AppModule);app.enableShutdownHooks();}
bootstrap().catch(error=>{console.error(error instanceof Error?error.message:'Worker startup failed');process.exitCode=1;});
