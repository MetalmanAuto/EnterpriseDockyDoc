import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { EncryptionService } from '../../common/services/encryption.service';
import { DocumentIntelligenceModule } from '../document-intelligence/document-intelligence.module';
import { ReportsModule } from '../reports/reports.module';
import { StorageModule } from '../storage/storage.module';
import { RemindersModule } from '../reminders/reminders.module';

@Module({
  imports: [ConfigModule, PrismaModule, DocumentIntelligenceModule, ReportsModule, StorageModule, RemindersModule],
  controllers: [AiController],
  providers: [AiService, EncryptionService],
  exports: [AiService],
})
export class AiModule {}
