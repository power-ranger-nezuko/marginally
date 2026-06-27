import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
}

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: { sub: string; tid: string; role: string } }>();
    const user = request.user;
    return {
      tenantId: user?.tid ?? '',
      userId: user?.sub ?? '',
      role: user?.role ?? '',
    };
  },
);
