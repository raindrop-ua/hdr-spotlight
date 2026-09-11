import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Icon } from '../../shared/ui/icon/icon.component';
import { DisplayIndicator } from './components/display-indicator/display-indicator.component';
import { SourceUpload } from './components/source-upload/source-upload.component';
import { LightControls } from './components/light-controls/light-controls.component';
import { ImageComparison } from './components/image-comparison/image-comparison.component';
import { ExportResults } from './components/export-results/export-results.component';
import { BenchStore } from './services/bench-store.service';
import { ImageEncoderService } from './services/image-encoder.service';

@Component({
  selector: 'app-bench',
  imports: [Icon, DisplayIndicator, SourceUpload, LightControls, ImageComparison, ExportResults],
  providers: [BenchStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bench.component.html',
})
export class Bench {
  protected readonly store = inject(BenchStore);
  protected readonly encoder = inject(ImageEncoderService);
}
