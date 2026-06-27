import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountingSyncController } from './accounting-sync.controller';
import { AccountingSyncService } from './accounting-sync.service';
import { AccountingSyncScheduler } from './accounting-sync.scheduler';
import { QuickBooksClient } from './quickbooks.client';
import { XeroClient } from './xero.client';

@Module({
  imports: [ConfigModule, ScheduleModule.forRoot()],
  controllers: [AccountingSyncController],
  providers: [AccountingSyncService, AccountingSyncScheduler, QuickBooksClient, XeroClient],
  exports: [AccountingSyncService],
})
export class AccountingSyncModule {}
