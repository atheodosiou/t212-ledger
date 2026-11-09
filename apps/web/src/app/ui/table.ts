import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';
import type { SortDir } from '@t212/shared';

/**
 * Sortable column header: `<th [sortKey]="'date'" [sort]="sort()" [dir]="dir()" (sorted)="…">`.
 * Clicking the active column flips the direction; another column starts descending for
 * numbers and dates (largest/newest first) and ascending for text.
 */
@Component({
  selector: 'th[sortKey]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.aria-sort]': "active() ? (dir() === 'asc' ? 'ascending' : 'descending') : 'none'",
    '[class.text-right]': "align() === 'right'",
  },
  template: `
    <button
      type="button"
      (click)="toggle()"
      class="inline-flex min-h-6 items-center gap-1 font-medium hover:text-ink"
      [class.text-ink]="active()"
      [class.flex-row-reverse]="align() === 'right'"
    >
      <ng-content />
      <span class="w-3 text-xs" aria-hidden="true">
        {{ active() ? (dir() === 'asc' ? '▲' : '▼') : '↕' }}
      </span>
    </button>
  `,
})
export class SortHeader {
  readonly sortKey = input.required<string>();
  readonly sort = input.required<string>();
  readonly dir = input.required<SortDir>();
  readonly align = input<'left' | 'right'>('left');
  /** Direction used the first time this column is picked. */
  readonly firstDir = input<SortDir>('desc');
  readonly sorted = output<{ sort: string; dir: SortDir }>();

  protected readonly active = computed(() => this.sort() === this.sortKey());

  protected toggle(): void {
    const dir: SortDir = this.active() ? (this.dir() === 'asc' ? 'desc' : 'asc') : this.firstDir();
    this.sorted.emit({ sort: this.sortKey(), dir });
  }
}

/** Placeholder rows: `<tbody skeletonRows [rows]="8" [cols]="7">`. */
@Component({
  selector: 'tbody[skeletonRows]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', class: 'divide-y divide-line' },
  template: `
    @for (r of rowList(); track r) {
      <tr>
        @for (c of colList(); track c) {
          <td class="px-4 py-3">
            <div
              class="h-3 animate-pulse rounded bg-line"
              [class.ml-auto]="c > 1"
              [style.width.%]="widths[(r + c) % widths.length]"
            ></div>
          </td>
        }
      </tr>
    }
  `,
})
export class SkeletonRows {
  readonly rows = input(6);
  readonly cols = input(5);
  protected readonly rowList = computed(() => Array.from({ length: this.rows() }, (_, i) => i));
  protected readonly colList = computed(() => Array.from({ length: this.cols() }, (_, i) => i));
  protected readonly widths = [70, 45, 60, 80, 50, 65];
}

/** Emits when the element scrolls near the viewport, to load the next page. */
@Directive({ selector: '[nearEnd]' })
export class NearEnd {
  readonly nearEnd = output<void>();

  constructor() {
    const element = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) this.nearEnd.emit();
        },
        { rootMargin: '600px 0px' },
      );
      observer.observe(element);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}

const APP_HEADER_PX = 56;

/**
 * Marks the block at the top of a page that stays in view while scrolling, from tablet
 * width up: on a phone it would take half the screen, so there it scrolls away. Publishes
 * where the sticky part of the page ends as --sticky-bottom, so table headers stick
 * right below it.
 */
@Directive({ selector: '[stickyTop]', host: { class: 'md:sticky z-20', '[style.top.px]': 'top' } })
export class StickyTop {
  protected readonly top = APP_HEADER_PX;

  constructor() {
    const element = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    const root = document.documentElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const publish = () => {
        const sticky = getComputedStyle(element).position === 'sticky';
        root.style.setProperty(
          '--sticky-bottom',
          `${APP_HEADER_PX + (sticky ? element.offsetHeight : 0)}px`,
        );
      };
      publish();
      const observer = new ResizeObserver(publish);
      observer.observe(element);
      // Crossing the tablet width turns stickiness on or off.
      const wide = matchMedia('(width >= 48rem)');
      wide.addEventListener('change', publish);
      destroyRef.onDestroy(() => {
        observer.disconnect();
        wide.removeEventListener('change', publish);
        root.style.setProperty('--sticky-bottom', `${APP_HEADER_PX}px`);
      });
    });
  }
}

export const TABLE = [SortHeader, SkeletonRows, NearEnd, StickyTop] as const;
