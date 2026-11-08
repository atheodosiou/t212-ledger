import { HttpClient } from '@angular/common/http';
import { computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import type { PageDto } from '@t212/shared';
import type { Subscription } from 'rxjs';
import { apiErrorMessage } from './format';

export interface PagedListOptions {
  pageSize?: number;
}

/**
 * Infinite list over a paged endpoint. Whenever `request()` changes (filters, sort,
 * a finished sync) the list starts over from the first page and any request still
 * in flight is cancelled, so pages from an old filter never mix with new ones.
 */
export class PagedList<T, R extends PageDto<T> = PageDto<T>> {
  private readonly http = inject(HttpClient);
  private readonly pageSize: number;
  private inFlight: Subscription | null = null;
  private generation = 0;

  readonly items = signal<T[]>([]);
  readonly total = signal<number | null>(null);
  /** The latest page response, for extras such as totals. */
  readonly last = signal<R | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private readonly nextOffset = signal<number | null>(0);

  readonly hasMore = computed(() => this.nextOffset() !== null);
  /** No page has arrived yet for the current request. */
  readonly initialLoading = computed(() => this.loading() && this.total() === null);

  constructor(
    private readonly request: () => {
      url: string;
      params: Record<string, string | number | undefined>;
    } | null,
    options: PagedListOptions = {},
  ) {
    this.pageSize = options.pageSize ?? 50;
    effect(() => {
      const req = this.request();
      untracked(() => this.reset(req));
    });
    inject(DestroyRef).onDestroy(() => this.inFlight?.unsubscribe());
  }

  /** Loads the next page, unless one is already loading or there is none. */
  loadMore(): void {
    const offset = this.nextOffset();
    if (offset === null || this.loading() || this.error()) return;
    const req = this.request();
    if (req) this.fetch(req, offset);
  }

  retry(): void {
    this.error.set(null);
    this.loadMore();
  }

  private reset(req: ReturnType<typeof this.request>): void {
    this.inFlight?.unsubscribe();
    this.generation++;
    this.items.set([]);
    this.total.set(null);
    this.last.set(null);
    this.error.set(null);
    this.loading.set(false);
    this.nextOffset.set(0);
    if (req) this.fetch(req, 0);
  }

  private fetch(req: NonNullable<ReturnType<typeof this.request>>, offset: number): void {
    const generation = this.generation;
    const params: Record<string, string> = { limit: String(this.pageSize), offset: String(offset) };
    for (const [key, value] of Object.entries(req.params)) {
      if (value !== undefined && value !== '') params[key] = String(value);
    }
    this.loading.set(true);
    this.inFlight = this.http.get<R>(req.url, { params }).subscribe({
      next: (page) => {
        if (generation !== this.generation) return;
        this.items.update((items) => [...items, ...page.items]);
        this.total.set(page.total);
        this.last.set(page);
        this.nextOffset.set(page.nextOffset);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        if (generation !== this.generation) return;
        this.error.set(apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }
}
