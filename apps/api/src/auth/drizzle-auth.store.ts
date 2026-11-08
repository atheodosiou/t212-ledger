import { Injectable } from '@nestjs/common';
import {
  AuthenticationStorage,
  type OidcStateStore,
  type OidcTransaction,
  type SessionRecord,
  type SessionStore,
} from '@nestjs/authentication';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, inArray, lt, lte, sql } from 'drizzle-orm';
import type { Db } from '../db/db.js';
import { oidcLogins, sessions, users } from '../db/schema.js';
import type { AppUser } from './auth.types.js';

/** Anyone can start a sign-in, so pending ones are capped. */
export const MAX_PENDING_LOGINS = 10_000;

type SessionRow = typeof sessions.$inferSelect;
type LoginRow = typeof oidcLogins.$inferSelect;

/** Sessions and sign-ins in progress, in Postgres (see SessionStore / OidcStateStore for each rule). */
@Injectable()
export class DrizzleAuthStore implements SessionStore, OidcStateStore {
  /** Overridden in tests. */
  protected maxPending = MAX_PENDING_LOGINS;

  constructor(
    @InjectDrizzle() private readonly db: Db,
    storage: AuthenticationStorage,
  ) {
    storage.registerSource({ sessions: this, oidcStates: this });
  }

  async getSession(id: string): Promise<SessionRecord | undefined> {
    // The user comes with the session, so a signed-in request costs one read.
    const [row] = await this.db
      .select({
        session: sessions,
        user: { id: users.id, email: users.email, name: users.name },
      })
      .from(sessions)
      // Left join: a session whose user is gone is still returned, and validate() ends it.
      .leftJoin(users, eq(sql`${users.id}::text`, sessions.userId))
      .where(eq(sessions.id, id));
    if (!row) return undefined;
    return {
      ...toSession(row.session),
      extra: { user: row.user?.id ? (row.user as AppUser) : null },
    };
  }

  async createSession(record: SessionRecord): Promise<void> {
    await this.db
      .delete(sessions)
      .where(lte(sessions.expiresAt, record.createdAt));
    await this.db.insert(sessions).values({
      id: record.id,
      userId: record.userId,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      lastActiveAt: record.lastActiveAt,
      mfa: record.mfa ?? null,
      metadata: record.metadata ?? null,
    });
  }

  async touchSession(id: string, lastActiveAt: Date): Promise<void> {
    await this.db
      .update(sessions)
      .set({ lastActiveAt })
      .where(and(eq(sessions.id, id), lt(sessions.lastActiveAt, lastActiveAt)));
  }

  async deleteSession(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(sessions)
      .where(eq(sessions.id, id))
      .returning({ id: sessions.id });
    return deleted.length > 0;
  }

  async listUserSessions(userId: string): Promise<SessionRecord[]> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId));
    return rows.map(toSession);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.userId, userId));
  }

  async saveOidcState(tx: OidcTransaction): Promise<void> {
    await this.db.insert(oidcLogins).values({
      state: tx.state,
      provider: tx.provider,
      codeVerifier: tx.codeVerifier,
      nonce: tx.nonce ?? null,
      redirectTo: tx.redirectTo ?? null,
      linkUserId: tx.link?.userId ?? null,
      linkSessionId: tx.link?.sessionId ?? null,
      createdAt: tx.createdAt,
      expiresAt: tx.expiresAt,
    });
    await this.db
      .delete(oidcLogins)
      .where(lte(oidcLogins.expiresAt, tx.createdAt));
    // Past the cap, drop the logins that expire first.
    const over = this.db
      .select({ state: oidcLogins.state })
      .from(oidcLogins)
      .orderBy(sql`${oidcLogins.expiresAt} desc`, oidcLogins.state)
      .offset(this.maxPending);
    await this.db.delete(oidcLogins).where(inArray(oidcLogins.state, over));
  }

  async consumeOidcState(state: string): Promise<OidcTransaction | undefined> {
    const [row] = await this.db
      .delete(oidcLogins)
      .where(eq(oidcLogins.state, state))
      .returning();
    return row ? toLogin(row) : undefined;
  }
}

function toSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    lastActiveAt: row.lastActiveAt,
    ...(row.mfa ? { mfa: row.mfa } : {}),
    ...(row.metadata ? { metadata: row.metadata } : {}),
  };
}

function toLogin(row: LoginRow): OidcTransaction {
  return {
    state: row.state,
    provider: row.provider,
    codeVerifier: row.codeVerifier,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    ...(row.nonce ? { nonce: row.nonce } : {}),
    ...(row.redirectTo ? { redirectTo: row.redirectTo } : {}),
    ...(row.linkUserId && row.linkSessionId
      ? { link: { userId: row.linkUserId, sessionId: row.linkSessionId } }
      : {}),
  };
}
