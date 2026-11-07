import { effect } from '@angular/core';

/**
 * Runs `tick` every `ms` for as long as `active()` is true. Must be called in an
 * injection context (e.g. a constructor or field initializer).
 *
 * The interval lives for the whole active period, so polling keeps going even when
 * each reload returns the same status (an effect that only re-ran when `active`
 * changed would stop after the first reload).
 */
export function whileActive(active: () => boolean, ms: number, tick: () => void): void {
  effect((onCleanup) => {
    if (!active()) return;
    const id = setInterval(tick, ms);
    onCleanup(() => clearInterval(id));
  });
}
