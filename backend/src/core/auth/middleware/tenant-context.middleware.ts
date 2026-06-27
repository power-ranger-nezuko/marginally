import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@core/prisma/prisma.service';

interface JwtPayloadLike {
  tid?: string;
}

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const publicKey = process.env.JWT_PUBLIC_KEY
          ? Buffer.from(process.env.JWT_PUBLIC_KEY, 'base64').toString('utf-8')
          : '';
        const payload = this.jwtService.verify<JwtPayloadLike>(token, {
          secret: publicKey,
          algorithms: ['RS256'],
        });
        const tenantId = payload?.tid;
        if (tenantId) {
          // SET (not SET LOCAL) — session-level so all subsequent queries on this
          // connection see the variable, even those not wrapped in an explicit tx.
          // PgBouncer transaction-mode pooling users: switch to SET LOCAL inside
          // an explicit Prisma.$transaction wrapper in each service method instead.
          await this.prisma.$executeRawUnsafe(
            `SET app.current_tenant_id = '${tenantId.replace(/[^a-f0-9-]/gi, '')}'`,
          );
          // Store on request so service layer can use it without re-reading JWT
          (req as unknown as Record<string, unknown>)['tenantId'] = tenantId;
        }
      } catch {
        // Not a valid token — let the guard handle it
      }
    }
    next();
  }
}
