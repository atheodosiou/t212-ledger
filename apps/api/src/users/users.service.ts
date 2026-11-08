import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import type { OidcProfile } from '@nestjs/authentication';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq } from 'drizzle-orm';
import type { AppUser } from '../auth/auth.types.js';
import type { Db } from '../db/db.js';
import { userIdentities, users } from '../db/schema.js';

/** Why a sign-in was refused; the web app shows a message for each. */
export type SignInRefusal = 'unverified-email';

export class SignInRefusedError extends ForbiddenException {
  constructor(readonly reason: SignInRefusal) {
    super(reason);
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const userColumns = { id: users.id, email: users.email, name: users.name };

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(@InjectDrizzle() private readonly db: Db) {}

  /**
   * Maps a provider identity to a user, for sign-in:
   * 1. a known identity (provider, subject) signs in its user;
   * 2. otherwise, with an address the provider verified, an existing user with that
   *    address gets the identity linked (users only ever come from verified sign-ins);
   * 3. otherwise a new user is created.
   * An address the provider did not verify is refused.
   */
  async resolveIdentity(profile: OidcProfile): Promise<AppUser> {
    return this.db.transaction(async (tx) => {
      const [known] = await tx
        .select(userColumns)
        .from(userIdentities)
        .innerJoin(users, eq(users.id, userIdentities.userId))
        .where(
          and(
            eq(userIdentities.provider, profile.provider),
            eq(userIdentities.subject, profile.subject),
          ),
        );
      if (known) return this.signedIn(tx, known, profile);

      if (!profile.email || !profile.emailVerified) {
        throw new SignInRefusedError('unverified-email');
      }
      const email = normalizeEmail(profile.email);

      let [user] = await tx
        .select(userColumns)
        .from(users)
        .where(eq(users.email, email));
      if (!user) {
        [user] = await tx
          .insert(users)
          .values({ email, name: profile.name ?? null })
          .returning(userColumns);
        this.logger.log(`New user: ${maskEmail(email)}`);
      }
      await tx.insert(userIdentities).values({
        provider: profile.provider,
        subject: profile.subject,
        userId: user.id,
      });
      return this.signedIn(tx, user, profile);
    });
  }

  /** Development sign-in (DEV_USER_EMAIL): the user is created on first use. */
  async devUser(email: string): Promise<AppUser> {
    const normalized = normalizeEmail(email);
    const [user] = await this.db
      .insert(users)
      .values({ email: normalized, lastSignInAt: new Date() })
      .onConflictDoUpdate({
        target: users.email,
        set: { lastSignInAt: new Date() },
      })
      .returning(userColumns);
    return user;
  }

  private async signedIn(
    tx: Pick<Db, 'update'>,
    user: AppUser,
    profile: OidcProfile,
  ): Promise<AppUser> {
    const name = user.name ?? profile.name ?? null;
    await tx
      .update(users)
      .set({ lastSignInAt: new Date(), name })
      .where(eq(users.id, user.id));
    return { ...user, name };
  }
}

/** For logs: a.theodosiou@gmail.com -> a***@gmail.com. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}***@${domain ?? ''}`;
}
