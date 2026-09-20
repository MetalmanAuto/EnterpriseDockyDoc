import { Global, Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { AlertsService } from './alerts.service';

@Global()
@Module({
  imports: [MailModule],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
