import { Component, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Icon } from '@shared/ui/icon/icon.component';
import { EncodeResult, JpegExport } from '@features/bench/models/bench.models';

import { SourceImage } from '@features/bench/models/source-image.model';
import { JpegPreview } from '@features/bench/components/jpeg-preview/jpeg-preview.component';

@Component({
  selector: 'app-export-results',
  imports: [DecimalPipe, Icon, JpegPreview],
  templateUrl: './export-results.component.html',
})
export class ExportResults {
  readonly source = input<SourceImage | null>(null);
  readonly jpegApplied = output<JpegExport>();
  readonly result = input<EncodeResult | null>(null);
}
