import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import Stripe from 'stripe';
import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { WebhookProvider } from '@prisma/client';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { CurrentTenant, TenantContext } from '@core/auth/decorators/current-tenant.decorator';
import { WebhookMonitorService } from './webhook-monitor.service';
import { GetEventsDto } from './dtos/get-events.dto';
import { CreateAlertRuleDto } from './dtos/create-alert-rule.dto';

// Stripe singleton — created once per process
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2024-06-20',
});

@Controller('webhooks')
export class WebhookMonitorController {
  constructor(private readonly webhookMonitorService: WebhookMonitorService) {}

  // ─── Stripe inbound ──────────────────────────────────────────────────────────

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(@Req() req: RawBodyRequest<Request>): Promise<{ received: boolean }> {
    const sig = req.headers['stripe-signature'] as string | undefined;
    const rawBody = req.rawBody;

    if (!sig || !rawBody) {
      throw new BadRequestException('Missing Stripe-Signature header or raw body');
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET ?? '');
    } catch {
      throw new BadRequestException('Invalid Stripe signature');
    }

    // Idempotency check
    const isDuplicate = await this.webhookMonitorService.isEventDuplicate(
      WebhookProvider.STRIPE,
      event.id,
    );
    if (isDuplicate) {
      return { received: true };
    }

    // Resolve tenantId from Stripe customer metadata if available
    const stripeObj = event.data.object as unknown as Record<string, unknown>;
    const tenantId =
      (stripeObj['metadata'] as Record<string, string> | undefined)?.['tenantId'] ?? 'unknown';

    const dbEvent = await this.webhookMonitorService.storeEvent(
      WebhookProvider.STRIPE,
      event.id,
      event.type,
      tenantId,
      event as unknown as Record<string, unknown>,
    );

    await this.webhookMonitorService.enqueueEvent(dbEvent.id);

    return { received: true };
  }

  // ─── Shopify inbound ─────────────────────────────────────────────────────────

  @Post('shopify')
  @HttpCode(HttpStatus.OK)
  async handleShopifyWebhook(
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: boolean }> {
    const hmacHeader = req.headers['x-shopify-hmac-sha256'] as string | undefined;
    const rawBody = req.rawBody;

    if (!hmacHeader || !rawBody) {
      throw new BadRequestException('Missing X-Shopify-Hmac-SHA256 header or raw body');
    }

    const shopifySecret = process.env.SHOPIFY_API_SECRET ?? '';
    const computed = createHmac('sha256', shopifySecret)
      .update(rawBody)
      .digest('base64');

    const isValid = timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(hmacHeader),
    );

    if (!isValid) {
      throw new BadRequestException('Invalid Shopify HMAC signature');
    }

    const topic = (req.headers['x-shopify-topic'] as string) ?? 'unknown';
    const shopDomain = (req.headers['x-shopify-shop-domain'] as string) ?? 'unknown';

    // Generate a stable event ID from shop domain + topic + body hash
    const eventId = createHmac('sha256', shopifySecret)
      .update(`${shopDomain}:${topic}:${rawBody.toString()}`)
      .digest('hex');

    const isDuplicate = await this.webhookMonitorService.isEventDuplicate(
      WebhookProvider.SHOPIFY,
      eventId,
    );
    if (isDuplicate) {
      return { received: true };
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawBody.toString()) as Record<string, unknown>;
    } catch {
      // Non-JSON body — store as-is
    }

    const tenantId =
      (payload['metadata'] as Record<string, string> | undefined)?.['tenantId'] ?? 'unknown';

    const dbEvent = await this.webhookMonitorService.storeEvent(
      WebhookProvider.SHOPIFY,
      eventId,
      topic,
      tenantId,
      payload,
    );

    await this.webhookMonitorService.enqueueEvent(dbEvent.id);

    return { received: true };
  }

  // ─── Authenticated event endpoints ───────────────────────────────────────────

  @Get('events')
  @UseGuards(JwtAuthGuard)
  async getEvents(
    @CurrentTenant() ctx: TenantContext,
    @Query() filters: GetEventsDto,
  ) {
    return this.webhookMonitorService.getEvents(ctx.tenantId, filters);
  }

  @Post('events/:id/replay')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async replayEvent(
    @CurrentTenant() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<{ replayed: boolean }> {
    await this.webhookMonitorService.replayEvent(ctx.tenantId, id);
    return { replayed: true };
  }

  // ─── Alert rules ─────────────────────────────────────────────────────────────

  @Get('alert-rules')
  @UseGuards(JwtAuthGuard)
  async listAlertRules(@CurrentTenant() ctx: TenantContext) {
    return this.webhookMonitorService.listAlertRules(ctx.tenantId);
  }

  @Post('alert-rules')
  @UseGuards(JwtAuthGuard)
  async createAlertRule(
    @CurrentTenant() ctx: TenantContext,
    @Body() dto: CreateAlertRuleDto,
  ) {
    return this.webhookMonitorService.createAlertRule(ctx.tenantId, dto);
  }

  @Delete('alert-rules/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAlertRule(
    @CurrentTenant() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<void> {
    await this.webhookMonitorService.deleteAlertRule(ctx.tenantId, id);
  }

  // ─── Stats ───────────────────────────────────────────────────────────────────

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  async getStats(@CurrentTenant() ctx: TenantContext) {
    return this.webhookMonitorService.getStats(ctx.tenantId);
  }
}
