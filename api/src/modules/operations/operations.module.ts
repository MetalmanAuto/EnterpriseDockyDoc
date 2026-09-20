import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { OperationsService } from './operations.service';

@Module({
  imports: [MailModule],
  providers: [OperationsService],
  exports: [OperationsService],
})
export class OperationsModule {}
