import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ApplicationRef,
  computed,
  DestroyRef,
  inject,
  Injectable,
  NgZone,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';
import { filter, take } from 'rxjs';

const CHECK_INTERVAL = 15 * 60 * 1000;
const FOCUS_CHECK_INTERVAL = 60 * 1000;

@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly updates = inject(SwUpdate, { optional: true });
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly latestHash = signal<string | null>(null);
  private readonly dismissed = signal(false);
  private readonly recovery = signal(false);
  readonly recoveryRequired = this.recovery.asReadonly();
  readonly visible = computed(() => !this.dismissed() && (!!this.latestHash() || this.recovery()));
  private checking = false;
  private lastCheck = -Infinity;

  constructor() {
    const application = inject(ApplicationRef);
    const zone = inject(NgZone);
    if (!isPlatformBrowser(inject(PLATFORM_ID)) || !this.updates?.isEnabled) return;

    this.updates.versionUpdates.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.type === 'VERSION_READY' && event.latestVersion.hash !== this.latestHash()) {
        this.latestHash.set(event.latestVersion.hash);
        this.dismissed.set(false);
      }
    });
    this.updates.unrecoverable.pipe(takeUntilDestroyed()).subscribe(() => {
      this.recovery.set(true);
      this.dismissed.set(false);
    });

    // Starting a recurring timer before stability can delay service-worker registration.
    application.isStable.pipe(filter(Boolean), take(1), takeUntilDestroyed()).subscribe(() => {
      const view = this.document.defaultView;
      if (!view) return;
      zone.runOutsideAngular(() => {
        void this.check();
        const timer = view.setInterval(() => void this.check(), CHECK_INTERVAL);
        const onVisible = () => void this.check();
        const onOnline = () => void this.check(true);
        this.document.addEventListener('visibilitychange', onVisible);
        view.addEventListener('online', onOnline);
        this.destroyRef.onDestroy(() => {
          view.clearInterval(timer);
          this.document.removeEventListener('visibilitychange', onVisible);
          view.removeEventListener('online', onOnline);
        });
      });
    });
  }

  dismiss(): void {
    this.dismissed.set(true);
  }

  reload(): void {
    if (!this.visible()) return;
    // A full reload keeps the shell and lazy chunks on the same version.
    this.document.defaultView?.location.reload();
  }

  private async check(online = false): Promise<void> {
    const view = this.document.defaultView;
    if (
      this.checking ||
      this.destroyRef.destroyed ||
      !view ||
      this.document.visibilityState === 'hidden' ||
      !view.navigator.onLine ||
      (!online && Date.now() - this.lastCheck < FOCUS_CHECK_INTERVAL)
    )
      return;
    this.checking = true;
    this.lastCheck = Date.now();
    try {
      await this.updates!.checkForUpdate();
    } catch {
      // Offline and deployment failures must not interrupt image work. Retry on the next check.
    } finally {
      this.checking = false;
    }
  }
}
