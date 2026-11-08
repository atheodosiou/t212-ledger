import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PagedList } from './paged-list';

@Component({ selector: 'app-paged-host', template: '' })
class PagedHost {
  readonly q = signal('');
  readonly list = new PagedList<number>(() => ({ url: '/api/x', params: { q: this.q() } }), {
    pageSize: 2,
  });
}

describe('PagedList', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  const page = (items: number[], total: number, offset: number) => ({
    items,
    total,
    offset,
    limit: 2,
    nextOffset: offset + items.length < total ? offset + items.length : null,
  });

  it('loads pages one after another until the end', () => {
    const host = TestBed.createComponent(PagedHost).componentInstance;
    TestBed.tick();
    http.expectOne((r) => r.params.get('offset') === '0').flush(page([1, 2], 3, 0));
    expect(host.list.items()).toEqual([1, 2]);
    expect(host.list.hasMore()).toBe(true);

    host.list.loadMore();
    http.expectOne((r) => r.params.get('offset') === '2').flush(page([3], 3, 2));
    expect(host.list.items()).toEqual([1, 2, 3]);
    expect(host.list.hasMore()).toBe(false);

    host.list.loadMore();
    http.expectNone('/api/x');
  });

  it('starts over when the request changes and ignores the old answer', () => {
    const host = TestBed.createComponent(PagedHost).componentInstance;
    TestBed.tick();
    const stale = http.expectOne((r) => r.params.get('q') === null);

    host.q.set('nvda');
    TestBed.tick();
    expect(stale.cancelled).toBe(true);
    http.expectOne((r) => r.params.get('q') === 'nvda').flush(page([9], 1, 0));
    expect(host.list.items()).toEqual([9]);
    expect(host.list.total()).toBe(1);
  });

  it('reports errors and can retry', () => {
    const host = TestBed.createComponent(PagedHost).componentInstance;
    TestBed.tick();
    http
      .expectOne('/api/x?limit=2&offset=0')
      .flush({ message: 'boom' }, { status: 500, statusText: 'x' });
    expect(host.list.error()).toBe('boom');

    host.list.retry();
    http.expectOne('/api/x?limit=2&offset=0').flush(page([1], 1, 0));
    expect(host.list.error()).toBeNull();
    expect(host.list.items()).toEqual([1]);
  });
});
