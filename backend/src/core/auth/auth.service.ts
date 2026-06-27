import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as https from 'https';
import { PrismaService } from '@core/prisma/prisma.service';
import { AuditLogService } from '@core/audit-log/audit-log.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MINUTES = 15;
const REFRESH_TOKEN_DAYS = 30;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditLog: AuditLogService,
  ) {}

  // ── HIBP k-anonymity check ──────────────────────────────────────────────────

  private async checkHibp(password: string): Promise<void> {
    const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const body = await new Promise<string>((resolve, reject) => {
      https
        .get(`https://api.pwnedpasswords.com/range/${prefix}`, (res) => {
          let data = '';
          res.on('data', (chunk: string) => (data += chunk));
          res.on('end', () => resolve(data));
        })
        .on('error', reject);
    });

    const found = body
      .split('\n')
      .some((line) => line.split(':')[0].trim() === suffix);

    if (found) {
      throw new BadRequestException(
        'Password has been found in a data breach. Please choose a different password.',
      );
    }
  }

  // ── Token helpers ───────────────────────────────────────────────────────────

  private signAccessToken(sub: string, tid: string, role: string): string {
    return this.jwtService.sign({ sub, tid, role }, { expiresIn: '15m' });
  }

  private async createRefreshToken(
    tenantId: string,
    userId: string,
  ): Promise<string> {
    const rawToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, BCRYPT_ROUNDS);
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.prisma.refreshToken.create({
      data: { tenantId, userId, tokenHash, expiresAt },
    });

    return rawToken;
  }

  // ── Signup ──────────────────────────────────────────────────────────────────

  async signup(
    dto: SignupDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    await this.checkHibp(dto.password);

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // Wrap in a transaction to ensure Tenant + User are created atomically
    const { tenant, user } = await this.prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findFirst({ where: { email: dto.email } });
      if (existingUser) {
        throw new ConflictException('Email already in use');
      }

      const tenant = await tx.tenant.create({
        data: { name: dto.tenantName },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          passwordHash,
          role: 'OWNER',
        },
      });

      return { tenant, user };
    });

    await this.auditLog.log({
      tenantId: tenant.id,
      actorUserId: user.id,
      action: 'SIGNUP',
      resourceType: 'User',
      resourceId: user.id,
      ipAddress,
      userAgent,
    });

    const accessToken = this.signAccessToken(user.id, tenant.id, user.role);
    const refreshToken = await this.createRefreshToken(tenant.id, user.id);

    return { accessToken, refreshToken };
  }

  // ── Login ───────────────────────────────────────────────────────────────────

  async login(
    dto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        `Account locked. Try again after ${user.lockedUntil.toISOString()}`,
      );
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordValid) {
      const newFailedLogins = user.failedLogins + 1;
      const lockedUntil =
        newFailedLogins >= MAX_FAILED_LOGINS
          ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
          : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: newFailedLogins, lockedUntil },
      });

      await this.auditLog.log({
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: 'LOGIN_FAILED',
        ipAddress,
        userAgent,
        metadata: { failedLogins: newFailedLogins },
      });

      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset failed logins on success
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null },
    });

    await this.auditLog.log({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: 'LOGIN',
      ipAddress,
      userAgent,
    });

    const accessToken = this.signAccessToken(user.id, user.tenantId, user.role);
    const refreshToken = await this.createRefreshToken(user.tenantId, user.id);

    return { accessToken, refreshToken };
  }

  // ── Refresh ─────────────────────────────────────────────────────────────────

  async me(jwtPayload: { sub: string; tid: string; role: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: jwtPayload.sub } });
    if (!user) throw new UnauthorizedException('User not found');
    return {
      id: user.id,
      email: user.email,
      name: user.email.split('@')[0],
      role: user.role,
      tenantId: user.tenantId,
    };
  }

  async refresh(dto: RefreshDto): Promise<{ accessToken: string }> {
    const tokens = await this.prisma.refreshToken.findMany({
      where: {
        userId: dto.userId,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    for (const token of tokens) {
      const match = await bcrypt.compare(dto.refreshToken, token.tokenHash);
      if (match) {
        const { user } = token;
        const accessToken = this.signAccessToken(user.id, user.tenantId, user.role);
        return { accessToken };
      }
    }

    throw new UnauthorizedException('Invalid or expired refresh token');
  }

  // ── Logout ──────────────────────────────────────────────────────────────────

  async logout(
    dto: RefreshDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    const tokens = await this.prisma.refreshToken.findMany({
      where: { userId: dto.userId },
      include: { user: true },
    });

    let deletedTokenId: string | null = null;
    let tenantId: string | null = null;

    for (const token of tokens) {
      const match = await bcrypt.compare(dto.refreshToken, token.tokenHash);
      if (match) {
        deletedTokenId = token.id;
        tenantId = token.tenantId;
        break;
      }
    }

    if (!deletedTokenId || !tenantId) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshToken.delete({ where: { id: deletedTokenId } });

    await this.auditLog.log({
      tenantId,
      actorUserId: dto.userId,
      action: 'LOGOUT',
      ipAddress,
      userAgent,
    });
  }
}
