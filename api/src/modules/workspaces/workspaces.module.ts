import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';
import { DevAuthGuard } from '../../common/guards/dev-auth.guard';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { EncryptionService } from '../../common/services/encryption.service';

/**
 * WorkspacesModule — multi-tenant workspace management.
 *
 * A Workspace is the top-level tenant unit in DockyDoc.
 * Users belong to one or more workspaces with a specific role.
 */
@Module({
  imports: [ConfigModule, PrismaModule, AuditModule, MailModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, DevAuthGuard, EncryptionService],
  exports: [WorkspacesService, EncryptionService],
})
export class WorkspacesModule {}
