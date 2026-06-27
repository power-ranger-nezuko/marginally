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
import { CancellationSaveflowService } from './cancellation-saveflow.service';
import { CreateOfferDto } from './dtos/create-offer.dto';
import { ListAttemptsDto } from './dtos/list-attempts.dto';

interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
}

@UseGuards(JwtAuthGuard)
@Controller('save-flow')
export class CancellationSaveflowController {
  constructor(private readonly service: CancellationSaveflowService) {}

  @Get('offers')
  listOffers(@CurrentTenant() ctx: TenantContext) {
    return this.service.listOffers(ctx.tenantId);
  }

  @Post('offers')
  createOffer(@CurrentTenant() ctx: TenantContext, @Body() dto: CreateOfferDto) {
    return this.service.createOffer(ctx.tenantId, dto);
  }

  @Put('offers/:id')
  updateOffer(
    @CurrentTenant() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: Partial<CreateOfferDto>,
  ) {
    return this.service.updateOffer(ctx.tenantId, id, dto);
  }

  @Delete('offers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteOffer(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.service.deleteOffer(ctx.tenantId, id);
  }

  @Get('stats')
  getStats(@CurrentTenant() ctx: TenantContext) {
    return this.service.getStats(ctx.tenantId);
  }

  @Get('attempts')
  listAttempts(@CurrentTenant() ctx: TenantContext, @Query() query: ListAttemptsDto) {
    return this.service.listAttempts(ctx.tenantId, query);
  }

  @Get('report')
  getReport(@CurrentTenant() ctx: TenantContext) {
    return this.service.getReport(ctx.tenantId);
  }
}
