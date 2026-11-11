import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { introEmbedUrl } from '../core/intro-video';

/**
 * A card with the presentation video's poster. A click opens it large, in a modal dialog
 * that grows out of the card, and plays it; it closes at any moment with the ✕, Esc or
 * a click outside. The YouTube player is only created while the dialog is open (no
 * request to YouTube before), and removed on close, which stops playback.
 */
@Component({
  selector: 'app-intro-video',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <button
      #card
      type="button"
      (click)="open()"
      class="group relative block w-full overflow-hidden rounded-xl border border-line bg-surface text-left transition hover:border-brand/40 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-brand"
      aria-haspopup="dialog"
    >
      <span class="relative block aspect-video overflow-hidden bg-brand-strong">
        <img
          src="intro-poster.jpg"
          alt=""
          width="1280"
          height="720"
          loading="lazy"
          decoding="async"
          class="size-full object-cover transition duration-300 group-hover:scale-[1.02]"
        />
        <span
          class="absolute inset-0 grid place-items-center bg-black/10 transition group-hover:bg-black/20"
        >
          <span
            class="grid size-16 place-items-center rounded-full bg-white/95 text-brand shadow-lg transition group-hover:scale-105"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" class="ml-1 size-7" fill="currentColor">
              <path
                d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5Z"
              />
            </svg>
          </span>
        </span>
        <span
          class="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white"
        >
          0:25
        </span>
      </span>
      <span class="block p-4">
        <span class="block font-medium">Δες πώς δουλεύει</span>
        <span class="mt-0.5 block text-sm text-muted">
          Όλες οι οθόνες σε 25 δευτερόλεπτα, με έναν λογαριασμό Practice.
        </span>
      </span>
    </button>

    <dialog
      #dialog
      closedby="any"
      aria-labelledby="intro-video-title"
      class="intro-dialog"
      [style.--from-x]="from().x + 'px'"
      [style.--from-y]="from().y + 'px'"
      [style.--from-scale]="from().scale"
      (close)="playing.set(false)"
      (cancel)="cancel($event)"
      (click)="backdropClick($event)"
    >
      <div class="flex items-center justify-between gap-3 px-4 py-2.5 text-white">
        <h2 id="intro-video-title" class="text-sm font-medium">t212 ledger · Πώς δουλεύει</h2>
        <button
          type="button"
          (click)="close()"
          class="grid size-10 place-items-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
          aria-label="Κλείσιμο βίντεο"
        >
          <svg viewBox="0 0 20 20" class="size-5" fill="none" aria-hidden="true">
            <path
              d="M5 5l10 10M15 5L5 15"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>
      <div class="aspect-video w-full bg-black">
        @if (playing()) {
          <iframe
            [src]="embedUrl()"
            title="t212 ledger: παρουσίαση της εφαρμογής"
            class="size-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowfullscreen
            referrerpolicy="strict-origin-when-cross-origin"
          ></iframe>
        }
      </div>
    </dialog>
  `,
  styles: `
    .intro-dialog {
      /* As wide as fits, but never so tall that the 16:9 video is cut (header ≈ 60px). */
      width: min(1100px, calc(100vw - 2rem), calc((100dvh - 2rem - 60px) * 16 / 9));
      max-width: none;
      max-height: calc(100dvh - 2rem);
      margin: auto;
      padding: 0;
      border: 0;
      border-radius: 1rem;
      background: #0b0f14;
      color: #fff;
      box-shadow: 0 40px 120px rgb(0 0 0 / 0.5);
      overflow: hidden;
      overscroll-behavior: contain;

      /* Closed (and exit) state. */
      opacity: 0;
      transition-property: opacity, transform, display, overlay;
      transition-duration: 0.32s;
      transition-timing-function: cubic-bezier(0.2, 0.8, 0.2, 1);
      transition-behavior: allow-discrete;
    }
    @media (prefers-reduced-motion: no-preference) {
      .intro-dialog {
        transform: translate(var(--from-x, 0), var(--from-y, 0)) scale(var(--from-scale, 0.9));
      }
    }
    /* Open: grows out of the card. The data-closing hook runs the exit where the
       browser cannot transition display/overlay (Firefox, Safari). */
    .intro-dialog:is([open]):where(:not([data-closing])) {
      opacity: 1;
      @starting-style {
        opacity: 0;
      }
      @media (prefers-reduced-motion: no-preference) {
        transform: none;
        @starting-style {
          transform: translate(var(--from-x, 0), var(--from-y, 0)) scale(var(--from-scale, 0.9));
        }
      }
      &::backdrop {
        background-color: rgb(3 20 19 / 0.78);
        @starting-style {
          background-color: transparent;
        }
      }
    }
    .intro-dialog::backdrop {
      background-color: transparent;
      backdrop-filter: blur(3px);
      overflow: hidden;
      overscroll-behavior: contain;
      transition-property: background-color, display, overlay;
      transition-duration: 0.32s;
      transition-behavior: allow-discrete;
    }
    @media (prefers-reduced-motion: reduce) {
      .intro-dialog,
      .intro-dialog::backdrop {
        transition-duration: 0.1s;
      }
    }
  `,
})
export class IntroVideo {
  readonly videoId = input.required<string>();

  private readonly sanitizer = inject(DomSanitizer);
  private readonly card = viewChild.required<ElementRef<HTMLButtonElement>>('card');
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  /** The player exists only while this is true. */
  protected readonly playing = signal(false);
  /** Where the dialog grows from: the card's offset from the viewport centre, and its scale. */
  protected readonly from = signal({ x: 0, y: 0, scale: 0.9 });

  // A fixed youtube-nocookie.com URL built from a constant ID.
  protected readonly embedUrl = computed(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(introEmbedUrl(this.videoId())),
  );

  protected open(): void {
    const card = this.card().nativeElement.getBoundingClientRect();
    const width = Math.min(1100, window.innerWidth - 32, ((window.innerHeight - 92) * 16) / 9);
    this.from.set({
      x: Math.round(card.left + card.width / 2 - window.innerWidth / 2),
      y: Math.round(card.top + card.height / 2 - window.innerHeight / 2),
      scale: Math.max(0.2, Math.min(1, card.width / width)),
    });
    this.playing.set(true);
    this.dialog().nativeElement.showModal();
  }

  /** Closes with the exit animation, also where the browser cannot animate it natively. */
  protected async close(): Promise<void> {
    const dialog = this.dialog().nativeElement;
    if (!supportsTopLayerExit()) {
      dialog.setAttribute('data-closing', '');
      const animations = dialog.getAnimations({ subtree: true });
      if (animations.length)
        await Promise.race([
          Promise.allSettled(animations.map((a) => a.finished)),
          new Promise((r) => setTimeout(r, 600)),
        ]);
      dialog.removeAttribute('data-closing');
    }
    dialog.close();
  }

  /** Esc (and light dismiss): route through close() so they animate too. */
  protected cancel(event: Event): void {
    event.preventDefault();
    void this.close();
  }

  /** Light dismiss where `closedby` is not supported (Safari): a click on the backdrop. */
  protected backdropClick(event: MouseEvent): void {
    if ('closedBy' in HTMLDialogElement.prototype) return;
    const dialog = this.dialog().nativeElement;
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    const inside =
      r.top <= event.clientY &&
      event.clientY <= r.bottom &&
      r.left <= event.clientX &&
      event.clientX <= r.right;
    if (!inside) void this.close();
  }
}

let displayTransition: boolean | undefined;
/** Whether the browser can keep a dialog visible while it transitions out of the top layer. */
function supportsTopLayerExit(): boolean {
  if (!window.CSS?.supports?.('overlay', 'auto')) return false;
  if (displayTransition === undefined) {
    const probe = document.createElement('div');
    probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
    document.body.appendChild(probe);
    void getComputedStyle(probe).display;
    probe.style.display = 'none';
    displayTransition = getComputedStyle(probe).display === 'block';
    probe.remove();
  }
  return displayTransition;
}
