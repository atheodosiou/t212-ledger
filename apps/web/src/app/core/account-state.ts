import { httpResource } from '@angular/common/http';
import { computed, signal } from '@angular/core';
import type { AccountDto } from '@t212/shared';
import { isSyncing } from './format';
import { whileActive } from './poll';
import { toastOnError } from './toasts';

/**
 * The account plus its sync state, kept current while a sync runs. Pages use
 * `syncing` to show skeletons and `syncedAt` to refetch once a sync finishes.
 * Must be created in an injection context.
 */
export function accountState(id: () => string) {
  const account = httpResource<AccountDto>(() => `/api/accounts/${id()}`);
  const value = computed(() => (account.hasValue() ? account.value() : null));
  const syncing = computed(() => isSyncing(value()?.syncStatus));
  /** Changes only when a sync finishes. */
  const syncedAt = computed(() => value()?.lastSyncedAt ?? null);
  /** Ticks every second while a rate-limit countdown is shown. */
  const now = signal(Date.now());
  /**
   * Trading 212's CSV export is fetched after each sync, in the background, and takes
   * a few minutes. True while it runs, or while one is due (a recent sync not yet checked).
   */
  const exporting = computed(() => {
    const a = value();
    if (!a || a.environment === 'DEMO' || syncing()) return false;
    if (a.exportState?.running) return true;
    if (a.exportState?.blocked || !a.lastSyncedAt) return false;
    const synced = Date.parse(a.lastSyncedAt);
    const checked = a.exportCheck ? Date.parse(a.exportCheck.checkedAt) : 0;
    return checked < synced && Date.now() - synced < 5 * 60_000;
  });
  /** Changes when a newer export check lands: reports with exact dividend tax can be refetched. */
  const exportedAt = computed(() => value()?.exportCheck?.checkedAt ?? null);

  toastOnError(account, 'Ο λογαριασμός δεν φόρτωσε');

  whileActive(syncing, 2000, () => account.reload());
  whileActive(exporting, 10_000, () => account.reload());
  whileActive(
    () => !!value()?.syncProgress?.waitingUntil,
    1000,
    () => now.set(Date.now()),
  );

  return { account, value, syncing, syncedAt, exporting, exportedAt, now };
}

export type AccountState = ReturnType<typeof accountState>;
