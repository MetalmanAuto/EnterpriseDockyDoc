import { Global, Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PaymentsService } from './payments.service';
import { RazorpayService } from './razorpay.service';
import { PaddleService } from './paddle.service';
import { MailModule } from '../mail/mail.module';

/** Global so any module can check a limit or charge an AI action without importing it. */
@Global()
@Module({
  imports: [MailModule],
  controllers: [BillingController],
  providers: [BillingService, PaymentsService, RazorpayService, PaddleService],
  exports: [BillingService, PaymentsService],
})
export class BillingModule {}
