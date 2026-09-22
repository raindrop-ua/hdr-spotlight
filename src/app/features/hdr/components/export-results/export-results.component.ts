import { Component, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Icon } from '@shared/ui/icon/icon.component';
import { EncodeResult, JpegExport } from '@features/hdr/models/bench.models';

import { ImageSource } from '@shared/images/models/image-source.model';
import { JpegPreview } from '@features/hdr/components/jpeg-preview/jpeg-preview.component';

@Component({
  selector: 'app-export-results',
  imports: [DecimalPipe, Icon, JpegPreview],
  templateUrl: './export-results.component.html',
})
export class ExportResults {
  readonly source = input<ImageSource | null>(null);
  readonly jpegApplied = output<JpegExport>();
  readonly result = input<EncodeResult | null>(null);
}
