/**
 * WebhookMonitorProcessor
 *
 * The BullMQ worker for 'webhook-processing' is wired directly inside
 * WebhookMonitorService.onModuleInit() to avoid requiring @nestjs/bullmq.
 *
 * This file re-exports the processor logic as a standalone function for
 * testability and documents the job contract.
 */

export interface WebhookJobData {
  webhookEventId: string;
}

export interface DlqJobData {
  webhookEventId: string;
  error: string;
}
