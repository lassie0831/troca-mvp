import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC, type AuthUser } from '../common/auth.decorators.js';
import { Database } from '../database/database.service.js';

/** Global guard: every route requires a valid Bearer access token unless decorated with @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly db: Database,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();

    let payload: { sub?: unknown };
    try {
      payload = await this.jwt.verifyAsync<{ sub?: unknown }>(token);
    } catch {
      throw new UnauthorizedException();
    }
    if (typeof payload.sub !== 'string') throw new UnauthorizedException();

    // Tokens of deleted accounts must stop working immediately (LGPD: right to erasure).
    const exists = await this.db.one('SELECT 1 FROM users WHERE id = $1', [payload.sub]);
    if (!exists) throw new UnauthorizedException();

    req.user = { id: payload.sub };
    return true;
  }
}
