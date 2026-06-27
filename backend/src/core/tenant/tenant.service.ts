import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@core/prisma/prisma.service';
import { Tenant, Plan } from '@prisma/client';
import { CreateTenantDto } from './dto/create-tenant.dto';

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async createTenant(dto: CreateTenantDto): Promise<Tenant> {
    return this.prisma.tenant.create({
      data: {
        name: dto.name,
        plan: dto.plan ?? 'STARTER',
      },
    });
  }

  async findById(id: string): Promise<Tenant> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${id} not found`);
    }
    return tenant;
  }

  async updatePlan(id: string, plan: Plan): Promise<Tenant> {
    await this.findById(id); // ensures it exists
    return this.prisma.tenant.update({
      where: { id },
      data: { plan },
    });
  }

  async listTenants(): Promise<Tenant[]> {
    return this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}
