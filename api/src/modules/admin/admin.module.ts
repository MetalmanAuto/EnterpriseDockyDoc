import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PlatformAdminGuard } from './platform-admin.guard';
import { RetentionModule } from '../retention/retention.module';
import { OperationsModule } from '../operations/operations.module';

@Module({
  imports: [RetentionModule, OperationsModule],
  controllers: [AdminController],
  providers: [AdminService, PlatformAdminGuard],
})
export class AdminModule {}
