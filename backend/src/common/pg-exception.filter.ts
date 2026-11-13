import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import pg from 'pg';

/**
 * Safety net for database errors that escaped explicit handling in services.
 * Maps constraint violations to 4xx instead of leaking a 500 with SQL details.
 */
@Catch(pg.DatabaseError)
export class PgExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PgExceptionFilter.name);

  catch(err: pg.DatabaseError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const map: Record<string, [number, string]> = {
      '23505': [HttpStatus.CONFLICT, 'Resource already exists'],
      '23503': [HttpStatus.BAD_REQUEST, 'Referenced resource does not exist'],
      '23514': [HttpStatus.BAD_REQUEST, 'Value violates a constraint'],
      '22P02': [HttpStatus.BAD_REQUEST, 'Invalid input syntax'],
    };
    const mapped = err.code ? map[err.code] : undefined;
    if (!mapped) this.logger.error(`Unhandled database error ${err.code}: ${err.message}`, err.stack);
    const [status, message] = mapped ?? [HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error'];
    res.status(status).json({ statusCode: status, message });
  }
}
