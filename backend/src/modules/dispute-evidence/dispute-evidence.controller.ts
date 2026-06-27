import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { CurrentTenant } from '@core/auth/decorators/current-tenant.decorator';
import { DisputeEvidenceService } from './dispute-evidence.service';
import { SubmitEvidenceDto } from './dtos/submit-evidence.dto';
import { ListDisputesDto } from './dtos/list-disputes.dto';

interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
}

@UseGuards(JwtAuthGuard)
@Controller('disputes')
export class DisputeEvidenceController {
  constructor(private readonly service: DisputeEvidenceService) {}

  @Get()
  listDisputes(@CurrentTenant() ctx: TenantContext, @Query() query: ListDisputesDto) {
    return this.service.listDisputes(ctx.tenantId, query);
  }

  @Get('stats')
  getStats(@CurrentTenant() ctx: TenantContext) {
    return this.service.getStats(ctx.tenantId);
  }

  @Get(':id')
  getDispute(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.service.getDispute(ctx.tenantId, id);
  }

  @Post(':id/evidence')
  submitEvidence(
    @CurrentTenant() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: SubmitEvidenceDto,
  ) {
    return this.service.submitEvidence(ctx.tenantId, id, dto);
  }
}
