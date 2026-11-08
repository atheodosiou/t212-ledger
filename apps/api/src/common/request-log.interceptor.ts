import {
  HttpException,
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { tap, type Observable } from 'rxjs';

/**
 * One line per request: method, path, status, duration. Deliberately leaves out the
 * body (account creation carries API keys), headers (cookies, auth) and the query
 * string (searches), so logs can be shared without leaking anything.
 */
@Injectable()
export class RequestLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const started = performance.now();
    const line = (status: number) =>
      `${req.method} ${pathOnly(req.originalUrl)} ${status} ${Math.round(performance.now() - started)}ms`;

    return next.handle().pipe(
      tap({
        next: () => this.logger.log(line(res.statusCode)),
        error: (error: unknown) => {
          const status =
            error instanceof HttpException ? error.getStatus() : 500;
          if (status >= 500) this.logger.error(line(status));
          else this.logger.warn(line(status));
        },
      }),
    );
  }
}

export function pathOnly(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}
