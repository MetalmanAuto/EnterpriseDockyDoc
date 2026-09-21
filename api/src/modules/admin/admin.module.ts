import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PlatformAdminGuard } from './platform-admin.guard';
import { RetentionModule } from '../retention/retention.module';
import { OperationsModule } from '../operations/operations.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [RetentionModule, OperationsModule, BillingModule],
  controllers: [AdminController],
  providers: [AdminService, PlatformAdminGuard],
})
export class AdminModule {}
