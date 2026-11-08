/** The signed-in user, as every route sees it (`@CurrentUser()`). */
export interface AppUser {
  id: string;
  email: string;
  name: string | null;
}

declare module '@nestjs/authentication' {
  interface AuthenticationTypes {
    user: AppUser;
    /** What `DrizzleAuthStore.getSession()` reads with the session: its user, or `null` when deleted. */
    sessionExtra: { user: AppUser | null };
  }
}
