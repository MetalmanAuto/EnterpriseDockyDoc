import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { DocumentsModule } from '../documents/documents.module';
import { SharesModule } from '../shares/shares.module';
import { TagsModule } from '../tags/tags.module';
import { MailModule } from '../mail/mail.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { ResolverService } from './resolver.service';

@Module({
  imports: [PrismaModule, DocumentsModule, SharesModule, TagsModule, MailModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, ResolverService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
