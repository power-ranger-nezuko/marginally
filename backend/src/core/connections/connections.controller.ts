import {
  Controller,
  Get,
  Delete,
  Param,
  UseGuards,
  Req,
  Res,
  Query,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import Stripe from 'stripe';
import { JwtService } from '@nestjs/jwt';
import { ConnectionsService } from './connections.service';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { Provider } from '@prisma/client';
import { JwtPayload } from '@core/auth/strategies/jwt.strategy';

@Controller('connections')
export class ConnectionsController {
  private readonly logger = new Logger(ConnectionsController.name);

  constructor(
    private readonly connectionsService: ConnectionsService,
    private readonly jwtService: JwtService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@Req() req: Request & { user: JwtPayload }) {
    return this.connectionsService.listConnections(req.user.tid);
  }

  @Delete(':provider')
  @UseGuards(JwtAuthGuard)
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

  // ── Stripe Connect OAuth ────────────────────────────────────────────────────

  @Get('stripe/oauth')
  @UseGuards(JwtAuthGuard)
  stripeOauthInit(
    @Req() req: Request & { user: JwtPayload },
    @Res() res: Response,
  ) {
    const clientId = process.env.STRIPE_CLIENT_ID ?? '';
    const appUrl = process.env.APP_URL ?? 'https://usemarginly.com';

    if (!clientId) {
      this.logger.error('STRIPE_CLIENT_ID is not configured');
      return res.redirect(`${appUrl}/settings?error=stripe_not_configured`);
    }

    // Sign a short-lived state token so we can verify it in the callback
    const state = this.jwtService.sign(
      { tid: req.user.tid, sub: req.user.sub, purpose: 'stripe_oauth' },
      { secret: process.env.WIDGET_SECRET, algorithm: 'HS256', expiresIn: '10m' },
    );

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: 'read_write',
      redirect_uri: `${appUrl}/api/v1/connections/stripe/oauth/callback`,
      state,
    });

    res.redirect(`https://connect.stripe.com/oauth/authorize?${params}`);
  }

  @Get('stripe/oauth/callback')
  async stripeOauthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const appUrl = process.env.APP_URL ?? 'https://usemarginly.com';

    if (error) {
      this.logger.warn(`Stripe OAuth denied: ${error}`);
      return res.redirect(`${appUrl}/settings?error=${encodeURIComponent(error)}`);
    }

    try {
      const payload = this.jwtService.verify<{
        tid: string;
        sub: string;
        purpose: string;
      }>(state, { secret: process.env.WIDGET_SECRET, algorithms: ['HS256'] });

      if (payload.purpose !== 'stripe_oauth') {
        throw new Error('Invalid state purpose');
      }

      const stripe = new Stripe(process.env.STRIPE_PLATFORM_KEY ?? '');
      const token = await stripe.oauth.token({
        grant_type: 'authorization_code',
        code,
      });

      await this.connectionsService.createConnection(
        payload.tid,
        Provider.STRIPE,
        {
          accessToken: token.access_token,
          stripeUserId: token.stripe_user_id,
          scope: token.scope,
        },
        [token.scope ?? 'read_write'],
      );

      res.redirect(`${appUrl}/settings?connected=stripe`);
    } catch (err) {
      this.logger.error(`Stripe OAuth callback failed: ${(err as Error).message}`);
      res.redirect(`${appUrl}/settings?error=oauth_failed`);
    }
  }
}
