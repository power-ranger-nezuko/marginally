import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { CurrentTenant, TenantContext } from '@core/auth/decorators/current-tenant.decorator';
import { DunningService } from './dunning.service';
import { ListFailedPaymentsDto } from './dtos/list-failed-payments.dto';
import { CreateRecoverySequenceDto } from './dtos/create-recovery-sequence.dto';

@Controller('dunning')
@UseGuards(JwtAuthGuard)
export class DunningController {
  constructor(private readonly dunningService: DunningService) {}

  // ─── Failed payments ──────────────────────────────────────────────────────

  @Get('failed-payments')
  async listFailedPayments(
    @CurrentTenant() ctx: TenantContext,
    @Query() filters: ListFailedPaymentsDto,
  ) {
    return this.dunningService.listFailedPayments(ctx.tenantId, filters);
  }

  @Get('failed-payments/:id')
  async getFailedPayment(
    @CurrentTenant() ctx: TenantContext,
    @Param('id') id: string,
  ) {
    return this.dunningService.getFailedPayment(ctx.tenantId, id);
  }

  // ─── Recovery sequences ───────────────────────────────────────────────────

  @Get('recovery-sequences')
  async listSequences(@CurrentTenant() ctx: TenantContext) {
    return this.dunningService.listSequences(ctx.tenantId);
  }

  @Post('recovery-sequences')
  async createSequence(
    @CurrentTenant() ctx: TenantContext,
    @Body() dto: CreateRecoverySequenceDto,
  ) {
    return this.dunningService.createSequence(ctx.tenantId, dto);
  }

  @Put('recovery-sequences/:id')
  async updateSequence(
    @CurrentTenant() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: Partial<CreateRecoverySequenceDto>,
  ) {
    return this.dunningService.updateSequence(ctx.tenantId, id, dto);
  }

  // ─── Stats & reporting ────────────────────────────────────────────────────

  @Get('stats')
  async getStats(@CurrentTenant() ctx: TenantContext) {
    return this.dunningService.getStats(ctx.tenantId);
  }

  @Get('report')
  async getReport(
    @CurrentTenant() ctx: TenantContext,
    @Query('days') days?: string,
  ) {
    return this.dunningService.getReport(ctx.tenantId, days ? parseInt(days, 10) : 30);
  }
}
