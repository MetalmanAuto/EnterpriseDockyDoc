import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ApiAwareThrottlerGuard } from './common/guards/api-aware-throttler.guard';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { MailModule } from './modules/mail/mail.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { StorageModule } from './modules/storage/storage.module';
import { SearchModule } from './modules/search/search.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { FoldersModule } from './modules/folders/folders.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { TagsModule } from './modules/tags/tags.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { SharesModule } from './modules/shares/shares.module';
import { AuditModule } from './modules/audit/audit.module';
import { AiModule } from './modules/ai/ai.module';
import { ReportsModule } from './modules/reports/reports.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { McpModule } from './modules/mcp/mcp.module';
import { AdminModule } from './modules/admin/admin.module';
import { BillingModule } from './modules/billing/billing.module';
import { AccountModule } from './modules/account/account.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { RetentionModule } from './modules/retention/retention.module';

/**
 * Root application module.
 * Register new feature modules here as the product grows.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),
    // ------------------------------------------------------------------ //
    // Rate limiting — 100 req / 60 s per IP (global default). API-key requests
    // are limited per account and plan in ClerkAuthGuard instead.
    // Override per-route with @Throttle({ default: { limit, ttl } }).
    // ------------------------------------------------------------------ //
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,  // window in ms
        limit: 100,   // max requests per window per IP
      },
    ]),
    ScheduleModule.forRoot(),
    PrismaModule,
    MailModule,
    HealthModule,
    StorageModule,
    SearchModule,
    AuthModule,
    UsersModule,
    WorkspacesModule,
    FoldersModule,
    DocumentsModule,
    TagsModule,
    RemindersModule,
    SharesModule,
    AuditModule,
    AiModule,
    ReportsModule,
    InvitationsModule,
    ApiKeysModule,
    IntegrationsModule,
    McpModule,
    AdminModule,
    BillingModule,
    AccountModule,
    AlertsModule,
    RetentionModule,
  ],
  providers: [
    // Apply ThrottlerGuard to every route in the application.
    // Uses the client IP from the incoming request as the throttle key.
    { provide: APP_GUARD, useClass: ApiAwareThrottlerGuard },
  ],
})
export class AppModule {}
