import { httpResource } from '@angular/common/http';
import { computed, signal } from '@angular/core';
import type { AccountDto } from '@t212/shared';
import { isSyncing } from './format';
import { whileActive } from './poll';

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

  whileActive(syncing, 2000, () => account.reload());
  whileActive(
    () => !!value()?.syncProgress?.waitingUntil,
    1000,
    () => now.set(Date.now()),
  );

  return { account, value, syncing, syncedAt, now };
}

export type AccountState = ReturnType<typeof accountState>;
