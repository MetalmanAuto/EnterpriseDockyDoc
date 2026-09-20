import { Controller, Get, Inject } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE } from '../modules/storage/storage.module';
import type { IStorageService } from '../modules/storage/storage.interface';

const STARTED_AT = new Date();

/**
 * Health check endpoint — used by load balancers and monitoring tools.
 * GET /api/v1/health
 *
 * Returns:
 * {
 *   status: "ok",
 *   info: { database: { status: "up" } }
 * }
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Application health check' })
  check() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma, { timeout: 10000 }),
    ]);
  }

  /**
   * GET /api/v1/health/deep — for the uptime monitor. Checks the database
   * and the file store, and reports how long the process has been up.
   * Returns 503 (via terminus) when any dependency is down.
   */
  @Get('deep')
  @HealthCheck()
  @ApiOperation({ summary: 'Health of every dependency: database, file storage, scheduler process' })
  deep() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma, { timeout: 10000 }),
      async () => {
        const started = Date.now();
        try {
          // A key that never exists: exercises the bucket credentials and network, nothing else.
          await this.storage.existsAsync('health/probe-does-not-exist');
          return { storage: { status: 'up', ms: Date.now() - started } };
        } catch (err) {
          throw new Error(`storage: ${(err as Error).message}`);
        }
      },
      async () => ({
        process: {
          status: 'up',
          uptimeSeconds: Math.round((Date.now() - STARTED_AT.getTime()) / 1000),
          scheduler: process.env.ENABLE_SCHEDULER !== 'false',
          node: process.version,
        },
      }),
    ]);
  }
}
