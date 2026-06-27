import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CancellationSaveflowService } from './cancellation-saveflow.service';
import { WidgetOfferDto, WidgetOutcomeDto } from './dtos/widget.dto';

@UseGuards(ThrottlerGuard)
@Controller('widget')
export class WidgetController {
  constructor(private readonly service: CancellationSaveflowService) {}

  @Post('offer')
  @HttpCode(HttpStatus.OK)
  async getOffer(@Body() dto: WidgetOfferDto) {
    this.service.validateTenantToken(dto.tenantToken, dto.tenantId, dto.customerId);
    const offer = await this.service.getActiveOffer(dto.tenantId);
    if (!offer) {
      return { offer: null };
    }
    return { offer };
  }

  @Post('outcome')
  @HttpCode(HttpStatus.OK)
  async recordOutcome(@Body() dto: WidgetOutcomeDto) {
    this.service.validateTenantToken(dto.tenantToken, dto.tenantId, dto.customerId);
    const attempt = await this.service.recordOutcome(
      dto.tenantId,
      dto.customerId,
      dto.saveOfferId,
      dto.outcome,
    );
    return { success: true, attemptId: attempt.id };
  }
}
