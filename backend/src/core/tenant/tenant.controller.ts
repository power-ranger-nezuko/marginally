import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { TenantService } from './tenant.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantPlanDto } from './dto/update-tenant.dto';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { CurrentTenant, TenantContext } from '@core/auth/decorators/current-tenant.decorator';

@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenantService.createTenant(dto);
  }

  @Get('me')
  getMe(@CurrentTenant() tenant: TenantContext) {
    return this.tenantService.findById(tenant.tenantId);
  }

  @Patch('me/plan')
  updateMyPlan(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpdateTenantPlanDto,
  ) {
    return this.tenantService.updatePlan(tenant.tenantId, dto.plan);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantService.findById(id);
  }

  @Patch(':id/plan')
  updatePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantPlanDto,
  ) {
    return this.tenantService.updatePlan(id, dto.plan);
  }
}
