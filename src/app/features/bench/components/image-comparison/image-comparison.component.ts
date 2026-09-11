import { SourceImage } from '@features/bench/models/source-image.model';
import { Component, input, signal } from '@angular/core';
import { Icon } from '@shared/ui/icon/icon.component';
import { EncodeResult } from '@features/bench/models/bench.models';

@Component({
  selector: 'app-image-comparison',
  imports: [Icon],
  templateUrl: './image-comparison.component.html',
})
export class ImageComparison {
  readonly source = input<SourceImage | null>(null);
  readonly result = input<EncodeResult | null>(null);
  readonly busy = input(false);
  protected readonly light = signal(false);
}
