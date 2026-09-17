import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { McpController } from './mcp.controller';

@Module({
  imports: [IntegrationsModule],
  controllers: [McpController],
})
export class McpModule {}
