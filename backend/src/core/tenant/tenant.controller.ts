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

@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenantService.createTenant(dto);
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
