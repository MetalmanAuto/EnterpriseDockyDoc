import { Module } from '@nestjs/common';
import { SharesService } from './shares.service';
import { DocumentSharesController, ShareManagementController } from './shares.controller';
import { PublicSharesController } from './public-shares.controller';
import { DevAuthGuard } from '../../common/guards/dev-auth.guard';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [
    DocumentSharesController,
    ShareManagementController,
    PublicSharesController,
  ],
  providers: [SharesService, DevAuthGuard],
  exports: [SharesService],
})
export class SharesModule {}
