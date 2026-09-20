import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { AuditModule } from '../audit/audit.module';
import { RetentionService } from './retention.service';

@Module({
  imports: [StorageModule, AuditModule],
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
