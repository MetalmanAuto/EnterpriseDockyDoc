import { Module } from '@nestjs/common';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';
import { ReminderPlannerService } from './reminder-planner.service';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { MailModule } from '../mail/mail.module';
import { DevAuthGuard } from '../../common/guards/dev-auth.guard';

@Module({
  imports: [MailModule],
  controllers: [RemindersController],
  providers: [RemindersService, ReminderPlannerService, ReminderSchedulerService, DevAuthGuard],
  exports: [ReminderPlannerService],
})
export class RemindersModule {}
