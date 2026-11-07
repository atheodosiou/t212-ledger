import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { whileActive } from './poll';

@Component({ selector: 'app-poll-host', template: '' })
class PollHost {
  readonly active = signal(true);
  readonly ticks = signal(0);
  constructor() {
    whileActive(this.active, 1000, () => this.ticks.update((n) => n + 1));
  }
}

describe('whileActive', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('keeps ticking while active, even though the condition never changes', () => {
    const fixture = TestBed.createComponent(PollHost);
    TestBed.tick();
    vi.advanceTimersByTime(3500);
    expect(fixture.componentInstance.ticks()).toBe(3);
  });

  it('stops when the condition turns false', () => {
    const fixture = TestBed.createComponent(PollHost);
    TestBed.tick();
    vi.advanceTimersByTime(1000);
    fixture.componentInstance.active.set(false);
    TestBed.tick();
    vi.advanceTimersByTime(5000);
    expect(fixture.componentInstance.ticks()).toBe(1);
  });
});
