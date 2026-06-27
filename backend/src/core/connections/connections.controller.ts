import {
  Controller,
  Get,
  Delete,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ConnectionsService } from './connections.service';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { Provider } from '@prisma/client';
import { JwtPayload } from '@core/auth/strategies/jwt.strategy';

@Controller('connections')
@UseGuards(JwtAuthGuard)
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Get()
  list(@Req() req: Request & { user: JwtPayload }) {
    return this.connectionsService.listConnections(req.user.tid);
  }

  @Delete(':provider')
  disconnect(
    @Param('provider') provider: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.connectionsService.disconnectConnection(
      req.user.tid,
      provider as Provider,
      req.user.sub,
    );
  }
}
