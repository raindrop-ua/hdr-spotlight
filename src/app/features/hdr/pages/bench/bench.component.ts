import { RouterLink } from '@angular/router';
import { Component, inject } from '@angular/core';
import { ThemeSwitcher } from '@core/theme/components/theme-switcher/theme-switcher.component';
import { Icon } from '@shared/ui/icon/icon.component';
import { DisplayIndicator } from '@features/hdr/components/display-indicator/display-indicator.component';
import { SourceUpload } from '@shared/ui/source-upload/source-upload.component';
import { LightControls } from '@features/hdr/components/light-controls/light-controls.component';
import { ImageComparison } from '@features/hdr/components/image-comparison/image-comparison.component';
import { ExportResults } from '@features/hdr/components/export-results/export-results.component';
import { BenchStore } from '@features/hdr/state/bench-store.service';
import { ImageEncoderService } from '@features/hdr/services/image-encoder.service';

import { BenchIntro } from '@features/hdr/components/bench-intro/bench-intro.component';
import { EncodingGuide } from '@features/hdr/components/encoding-guide/encoding-guide.component';
import { EncodingFaq } from '@features/hdr/components/encoding-faq/encoding-faq.component';

@Component({
  selector: 'app-bench',
  imports: [
    RouterLink,
    BenchIntro,
    EncodingGuide,
    EncodingFaq,
    ThemeSwitcher,
    Icon,
    DisplayIndicator,
    SourceUpload,
    LightControls,
    ImageComparison,
    ExportResults,
  ],
  providers: [BenchStore],
  templateUrl: './bench.component.html',
})
export class Bench {
  protected readonly store = inject(BenchStore);
  protected readonly encoder = inject(ImageEncoderService);
}
