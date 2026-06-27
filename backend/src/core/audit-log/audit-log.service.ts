import { Injectable } from '@nestjs/common';
import { PrismaService } from '@core/prisma/prisma.service';
import { AuditLog, Prisma } from '@prisma/client';

export interface AuditLogParams {
  tenantId: string;
  actorUserId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: AuditLogParams): Promise<AuditLog> {
    return this.prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorUserId: params.actorUserId,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        metadata: (params.metadata ?? {}) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async findByTenant(tenantId: string, limit = 50): Promise<AuditLog[]> {
    return this.prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
