import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { CancellationSaveflowController } from './cancellation-saveflow.controller';
import { WidgetController } from './widget.controller';
import { CancellationSaveflowService } from './cancellation-saveflow.service';

@Module({
  imports: [
    ConfigModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
  ],
  controllers: [CancellationSaveflowController, WidgetController],
  providers: [CancellationSaveflowService],
  exports: [CancellationSaveflowService],
})
export class CancellationSaveflowModule {}
