import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DisputeEvidenceController } from './dispute-evidence.controller';
import { DisputeEvidenceService } from './dispute-evidence.service';

@Module({
  imports: [ConfigModule],
  controllers: [DisputeEvidenceController],
  providers: [DisputeEvidenceService],
  exports: [DisputeEvidenceService],
})
export class DisputeEvidenceModule {}
