import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ThemeSwitcher } from '@shared/ui/theme-switcher/theme-switcher.component';
import { Icon } from '@shared/ui/icon/icon.component';
import { DisplayIndicator } from '@features/bench/components/display-indicator/display-indicator.component';
import { SourceUpload } from '@features/bench/components/source-upload/source-upload.component';
import { LightControls } from '@features/bench/components/light-controls/light-controls.component';
import { ImageComparison } from '@features/bench/components/image-comparison/image-comparison.component';
import { ExportResults } from '@features/bench/components/export-results/export-results.component';
import { BenchStore } from '@features/bench/services/bench-store.service';
import { ImageEncoderService } from '@features/bench/services/image-encoder.service';

@Component({
  selector: 'app-bench',
  imports: [
    ThemeSwitcher,
    Icon,
    DisplayIndicator,
    SourceUpload,
    LightControls,
    ImageComparison,
    ExportResults,
  ],
  providers: [BenchStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bench.component.html',
})
export class Bench {
  protected readonly store = inject(BenchStore);
  protected readonly encoder = inject(ImageEncoderService);
}
