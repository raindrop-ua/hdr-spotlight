import { DOCUMENT } from '@angular/common';
import { afterNextRender, computed, DestroyRef, inject, Injectable, signal } from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'spotlight.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly selected = signal<ThemePreference>('system');
  private readonly systemDark = signal(false);
  readonly preference = this.selected.asReadonly();
  readonly theme = computed(() =>
    this.selected() === 'system' ? (this.systemDark() ? 'dark' : 'light') : this.selected(),
  );

  constructor() {
    afterNextRender(() => {
      const view = this.document.defaultView;
      if (!view) return;

      const media = view.matchMedia?.('(prefers-color-scheme: dark)');
      this.systemDark.set(media?.matches ?? false);
      let storage: Storage | undefined;
      try {
        storage = view.localStorage;
        this.selected.set(this.parse(storage.getItem(STORAGE_KEY)));
      } catch {
        // Storage can be unavailable; the theme still works for this visit.
      }
      this.apply();

      const onSystemChange = () => {
        this.systemDark.set(media?.matches ?? false);
        this.apply();
      };
      const onStorage = (event: StorageEvent) => {
        if (!storage || event.storageArea !== storage) return;
        if (event.key === STORAGE_KEY || event.key === null) {
          this.selected.set(this.parse(event.newValue));
          this.apply();
        }
      };
      media?.addEventListener('change', onSystemChange);
      view.addEventListener('storage', onStorage);
      this.destroyRef.onDestroy(() => {
        media?.removeEventListener('change', onSystemChange);
        view.removeEventListener('storage', onStorage);
      });
    });
  }

  setPreference(preference: ThemePreference): void {
    this.selected.set(preference);
    this.apply();
    try {
      const storage = this.document.defaultView?.localStorage;
      if (preference === 'system') storage?.removeItem(STORAGE_KEY);
      else storage?.setItem(STORAGE_KEY, preference);
    } catch {
      // Keep the in-memory choice even when persistence is blocked.
    }
  }

  private parse(value: string | null): ThemePreference {
    return value === 'light' || value === 'dark' ? value : 'system';
  }

  private apply(): void {
    this.document.documentElement.dataset['theme'] = this.selected();
    this.document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', this.theme() === 'dark' ? '#191b18' : '#f5f5ef');
  }
}
