import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@core/prisma/prisma.service';
import { KmsService } from '@core/kms/kms.service';
import { AuditLogService } from '@core/audit-log/audit-log.service';
import { Connection, Provider } from '@prisma/client';

export type ConnectionWithoutCredentials = Omit<Connection, 'encryptedCredentials'>;

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kms: KmsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async createConnection(
    tenantId: string,
    provider: Provider,
    credentials: Record<string, unknown>,
    scopes: string[],
  ): Promise<ConnectionWithoutCredentials> {
    const encryptedCredentials = await this.kms.encrypt(JSON.stringify(credentials));

    const connection = await this.prisma.connection.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      create: {
        tenantId,
        provider,
        encryptedCredentials,
        scopes,
        status: 'ACTIVE',
      },
      update: {
        encryptedCredentials,
        scopes,
        status: 'ACTIVE',
        credentialKeyVersion: { increment: 1 },
      },
    });

    await this.auditLog.log({
      tenantId,
      action: 'CONNECTION_CREATED',
      resourceType: 'Connection',
      resourceId: connection.id,
      metadata: { provider },
    });

    const { encryptedCredentials: _ec, ...rest } = connection;
    return rest;
  }

  async getDecryptedCredentials(
    tenantId: string,
    provider: Provider,
  ): Promise<Record<string, unknown>> {
    const connection = await this.prisma.connection.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });

    if (!connection || connection.status === 'DISCONNECTED') {
      throw new NotFoundException(`No active connection for provider ${provider}`);
    }

    const plaintext = await this.kms.decrypt(connection.encryptedCredentials);
    return JSON.parse(plaintext) as Record<string, unknown>;
  }

  async disconnectConnection(
    tenantId: string,
    provider: Provider,
    actorUserId?: string,
  ): Promise<void> {
    const connection = await this.prisma.connection.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });

    if (!connection) {
      throw new NotFoundException(`No connection found for provider ${provider}`);
    }

    await this.prisma.connection.update({
      where: { tenantId_provider: { tenantId, provider } },
      data: { status: 'DISCONNECTED' },
    });

    await this.auditLog.log({
      tenantId,
      actorUserId,
      action: 'CONNECTION_DISCONNECTED',
      resourceType: 'Connection',
      resourceId: connection.id,
      metadata: { provider },
    });
  }

  async listConnections(tenantId: string): Promise<ConnectionWithoutCredentials[]> {
    const connections = await this.prisma.connection.findMany({
      where: { tenantId },
      orderBy: { connectedAt: 'desc' },
    });

    return connections.map(({ encryptedCredentials: _ec, ...rest }) => rest);
  }
}
