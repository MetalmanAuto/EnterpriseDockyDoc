import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { SearchModule } from '../search/search.module';
import { AiModule } from '../ai/ai.module';
import { RemindersModule } from '../reminders/reminders.module';
import { DevAuthGuard } from '../../common/guards/dev-auth.guard';

@Module({
  imports: [SearchModule, AiModule, RemindersModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DevAuthGuard],
  exports: [DocumentsService],
})
export class DocumentsModule {}
