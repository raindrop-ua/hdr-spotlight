import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { Icon } from '../../shared/ui/icon/icon.component';
import { SourceUpload } from './components/source-upload/source-upload.component';
import { LightControls } from './components/light-controls/light-controls.component';
import { ImageComparison } from './components/image-comparison/image-comparison.component';
import { ExportResults } from './components/export-results/export-results.component';
import { BenchStore } from './services/bench-store.service';
import { ImageEncoderService } from './services/image-encoder.service';

@Component({
  selector: 'app-bench',
  imports: [Icon, SourceUpload, LightControls, ImageComparison, ExportResults],
  providers: [BenchStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bench.component.html',
})
export class Bench {
  protected readonly store = inject(BenchStore);
  protected readonly encoder = inject(ImageEncoderService);
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
      const paste = (event: ClipboardEvent) => {
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
        )
          return;
        const file = event.clipboardData?.files[0];
        if (file) {
          event.preventDefault();
          void this.store.load(file);
        }
      };
      window.addEventListener('paste', paste);
      this.destroyRef.onDestroy(() => window.removeEventListener('paste', paste));
    });
  }
}
