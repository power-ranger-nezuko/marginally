import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { KmsModule } from './kms/kms.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuthModule } from './auth/auth.module';
import { TenantModule } from './tenant/tenant.module';
import { ConnectionsModule } from './connections/connections.module';
import { TenantContextMiddleware } from './auth/middleware/tenant-context.middleware';

@Module({
  imports: [
    PrismaModule,
    KmsModule,
    AuditLogModule,
    AuthModule,
    TenantModule,
    ConnectionsModule,
  ],
  exports: [
    PrismaModule,
    KmsModule,
    AuditLogModule,
    AuthModule,
    TenantModule,
    ConnectionsModule,
  ],
})
export class CoreModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantContextMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
