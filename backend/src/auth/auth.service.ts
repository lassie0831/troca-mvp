import { ConflictException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { ENV, type Env } from '../config/env.js';
import { Database, type Queryable } from '../database/database.service.js';
import { toUserView, USER_COLUMNS, type UserRow, type UserView } from '../users/users.types.js';
import type { LoginDto, RegisterDto } from './auth.dto.js';
import { DUMMY_HASH_PROMISE, hashPassword, verifyPassword } from './password.js';

export interface AuthTokens {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: UserView;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly db: Database,
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const passwordHash = await hashPassword(dto.password);
    const user = await this.db.one<UserRow>(
      `INSERT INTO users (name, email, password_hash, neighborhood)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING
       RETURNING ${USER_COLUMNS}`,
      [dto.name, dto.email, passwordHash, dto.neighborhood],
    );
    if (!user) throw new ConflictException('E-mail já cadastrado');
    return { user: toUserView(user), ...(await this.issueTokens(this.db, user.id)) };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const row = await this.db.one<UserRow & { password_hash: string }>(
      `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = $1`,
      [dto.email],
    );
    // Always run one scrypt verification so response time does not reveal whether the e-mail exists.
    const ok = await verifyPassword(dto.password, row?.password_hash ?? (await DUMMY_HASH_PROMISE));
    if (!row || !ok) throw new UnauthorizedException('E-mail ou senha inválidos');
    return { user: toUserView(row), ...(await this.issueTokens(this.db, row.id)) };
  }

  /**
   * Refresh-token rotation: each refresh token is single-use. Presenting an already-rotated token
   * means it was stolen (or replayed), so every session of that user is revoked.
   */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    return this.db.tx(async (q) => {
      const row = await q.one<{ id: string; user_id: string; expires_at: Date; revoked_at: Date | null }>(
        `SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
        [sha256(refreshToken)],
      );
      if (!row) throw new UnauthorizedException('Sessão inválida');
      if (row.revoked_at) {
        this.logger.warn(`Refresh token reuse detected for user ${row.user_id}; revoking all sessions`);
        await q.exec(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [row.user_id]);
        throw new UnauthorizedException('Sessão inválida');
      }
      if (row.expires_at.getTime() <= Date.now()) throw new UnauthorizedException('Sessão expirada');
      await q.exec(`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`, [row.id]);
      return this.issueTokens(q, row.user_id);
    });
  }

  async logout(refreshToken: string): Promise<void> {
    await this.db.exec(`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, [
      sha256(refreshToken),
    ]);
  }

  private async issueTokens(q: Queryable, userId: string): Promise<AuthTokens> {
    const refreshToken = randomBytes(32).toString('base64url');
    await q.exec(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + make_interval(days => $3))`,
      [userId, sha256(refreshToken), this.env.REFRESH_TOKEN_TTL_DAYS],
    );
    const accessToken = await this.jwt.signAsync({ sub: userId });
    return { accessToken, accessTokenExpiresIn: this.env.JWT_ACCESS_TTL_SECONDS, refreshToken };
  }
}
