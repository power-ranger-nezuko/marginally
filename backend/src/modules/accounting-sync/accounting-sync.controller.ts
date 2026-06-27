import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { CurrentTenant } from '@core/auth/decorators/current-tenant.decorator';
import { AccountingProvider } from '@prisma/client';
import { AccountingSyncService } from './accounting-sync.service';
import { ConnectQuickBooksDto } from './dtos/connect-quickbooks.dto';
import { ConnectXeroDto } from './dtos/connect-xero.dto';
import { SyncStatusQueryDto } from './dtos/sync-status.dto';

interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
}

@UseGuards(JwtAuthGuard)
@Controller('accounting')
export class AccountingSyncController {
  constructor(private readonly service: AccountingSyncService) {}

  @Get('connections')
  listConnections(@CurrentTenant() ctx: TenantContext) {
    return this.service.listConnections(ctx.tenantId);
  }

  @Post('connections/quickbooks')
  connectQuickBooks(@CurrentTenant() ctx: TenantContext, @Body() dto: ConnectQuickBooksDto) {
    return this.service.connectQuickBooks(ctx.tenantId, dto.authCode, dto.realmId);
  }

  @Post('connections/xero')
  connectXero(@CurrentTenant() ctx: TenantContext, @Body() dto: ConnectXeroDto) {
    return this.service.connectXero(ctx.tenantId, dto.authCode);
  }

  @Delete('connections/:provider')
  @HttpCode(HttpStatus.NO_CONTENT)
  disconnect(
    @CurrentTenant() ctx: TenantContext,
    @Param('provider') provider: string,
  ) {
    const p = provider.toUpperCase() as AccountingProvider;
    return this.service.disconnectProvider(ctx.tenantId, p);
  }

  @Get('sync-status')
  getSyncStatus(@CurrentTenant() ctx: TenantContext, @Query() query: SyncStatusQueryDto) {
    return this.service.getSyncStatus(ctx.tenantId, query);
  }

  @Post('sync/trigger')
  triggerSync(@CurrentTenant() ctx: TenantContext) {
    return this.service.syncTransactions(ctx.tenantId);
  }

  @Get('reconciliation-report')
  getReconciliationReport(@CurrentTenant() ctx: TenantContext) {
    return this.service.getReconciliationReport(ctx.tenantId);
  }
}
