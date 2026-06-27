import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

/**
 * Builds a raw Buffer that mimics a Stripe webhook event payload.
 */
export function makeStripeWebhookPayload(eventType: string, data: unknown): Buffer {
  const event = {
    id: `evt_test_${uuidv4().replace(/-/g, '').slice(0, 20)}`,
    object: 'event',
    type: eventType,
    created: Math.floor(Date.now() / 1000),
    data: { object: data },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
  };
  return Buffer.from(JSON.stringify(event));
}

/**
 * Signs a raw Stripe webhook payload and returns the Stripe-Signature header value.
 * Mirrors the algorithm Stripe uses:
 *   t=<unix_timestamp>,v1=<HMAC-SHA256(t.payload, secret)>
 */
export function signStripePayload(payload: Buffer, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload.toString()}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

/**
 * Builds a raw Buffer that mimics a Shopify webhook payload.
 */
export function makeShopifyWebhookPayload(data: unknown): Buffer {
  return Buffer.from(JSON.stringify(data));
}

/**
 * Signs a Shopify webhook payload and returns the X-Shopify-Hmac-SHA256 header value.
 * Shopify uses Base64(HMAC-SHA256(payload, secret)).
 */
export function signShopifyPayload(payload: Buffer, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64');
}
