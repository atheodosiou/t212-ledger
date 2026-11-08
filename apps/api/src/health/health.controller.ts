import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import { InjectDrizzle } from '@nestjs/drizzle';
import { SkipThrottle } from '@nestjs/throttler';
import { sql } from 'drizzle-orm';
import type { Response } from 'express';
import type { Db } from '../db/db.js';
import { SyncQueueService } from '../sync/sync-queue.service.js';

type CheckStatus = 'up' | 'down';

interface HealthReport {
  status: 'ok' | 'error';
  checks: Record<
    'database' | 'queue',
    { status: CheckStatus; ms: number; error?: string }
  >;
  uptimeSeconds: number;
}

const TIMEOUT_MS = 3_000;

/**
 * Liveness and readiness in one: 200 when the database and the job queue answer,
 * 503 otherwise. No account data, no sign-in, not rate limited, so a monitor can poll it.
 */
@Controller('health')
@Public()
@SkipThrottle()
export class HealthController {
  constructor(
    @InjectDrizzle() private readonly db: Db,
    private readonly queue: SyncQueueService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthReport> {
    const [database, queue] = await Promise.all([
      this.probe(async () => {
        await this.db.execute(sql`select 1`);
      }),
      this.probe(async () => {
        if (!(await this.queue.healthy()))
          throw new Error('job queue not running');
      }),
    ]);
    const ok = database.status === 'up' && queue.status === 'up';
    if (!ok) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: ok ? 'ok' : 'error',
      checks: { database, queue },
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  private async probe(
    fn: () => Promise<void>,
  ): Promise<{ status: CheckStatus; ms: number; error?: string }> {
    const started = performance.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        fn(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`timed out after ${TIMEOUT_MS} ms`)),
            TIMEOUT_MS,
          );
        }),
      ]).finally(() => clearTimeout(timer));
      return { status: 'up', ms: Math.round(performance.now() - started) };
    } catch (error) {
      return {
        status: 'down',
        ms: Math.round(performance.now() - started),
        // Only the message: driver errors can carry connection details.
        error:
          (error instanceof Error &&
            error.message.split('\n')[0].slice(0, 120)) ||
          'unavailable',
      };
    }
  }
}
