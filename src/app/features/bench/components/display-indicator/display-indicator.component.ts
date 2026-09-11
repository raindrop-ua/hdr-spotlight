import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { Icon } from '@shared/ui/icon/icon.component';

@Component({
  selector: 'app-display-indicator',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  templateUrl: './display-indicator.component.html',
})
export class DisplayIndicator {
  protected readonly display = signal<'unknown' | 'hdr' | 'sdr'>('unknown');
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      if (typeof window.matchMedia === 'function') {
        const query = window.matchMedia('(dynamic-range: high)');
        const update = () => this.display.set(query.matches ? 'hdr' : 'sdr');
        update();
        query.addEventListener('change', update);
        this.destroyRef.onDestroy(() => query.removeEventListener('change', update));
      }
    });
  }
}
