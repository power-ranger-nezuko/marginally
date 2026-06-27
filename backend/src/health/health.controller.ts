import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '@core/prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{ status: string; db: string; uptime: number }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', db: 'ok', uptime: Math.floor(process.uptime()) };
  }
}
