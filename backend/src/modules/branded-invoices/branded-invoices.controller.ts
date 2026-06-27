import {
  Controller,
  Get,
  Post,
  Put,
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
import { BrandedInvoicesService } from './branded-invoices.service';
import { CreateTemplateDto } from './dtos/create-template.dto';
import { ListGeneratedDto } from './dtos/list-generated.dto';

interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
}

@UseGuards(JwtAuthGuard)
@Controller('invoices')
export class BrandedInvoicesController {
  constructor(private readonly service: BrandedInvoicesService) {}

  @Get('templates')
  listTemplates(@CurrentTenant() ctx: TenantContext) {
    return this.service.listTemplates(ctx.tenantId);
  }

  @Post('templates')
  createTemplate(@CurrentTenant() ctx: TenantContext, @Body() dto: CreateTemplateDto) {
    return this.service.createTemplate(ctx.tenantId, dto);
  }

  @Put('templates/:id')
  updateTemplate(
    @CurrentTenant() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: Partial<CreateTemplateDto>,
  ) {
    return this.service.updateTemplate(ctx.tenantId, id, dto);
  }

  @Delete('templates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTemplate(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.service.deleteTemplate(ctx.tenantId, id);
  }

  @Get('generated')
  listGenerated(@CurrentTenant() ctx: TenantContext, @Query() query: ListGeneratedDto) {
    return this.service.listGeneratedInvoices(ctx.tenantId, query);
  }

  @Get('generated/:id/download')
  getDownloadUrl(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.service.getSignedDownloadUrl(ctx.tenantId, id);
  }

  @Post('generate/:stripeInvoiceId')
  generateInvoice(
    @CurrentTenant() ctx: TenantContext,
    @Param('stripeInvoiceId') stripeInvoiceId: string,
  ) {
    return this.service.generateInvoice(ctx.tenantId, stripeInvoiceId);
  }
}
