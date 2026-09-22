import { ImageSource } from '@shared/images/models/image-source.model';
import { Component, input, signal } from '@angular/core';
import { Icon } from '@shared/ui/icon/icon.component';
import { EncodeResult } from '@features/hdr/models/bench.models';

@Component({
  selector: 'app-image-comparison',
  imports: [Icon],
  templateUrl: './image-comparison.component.html',
})
export class ImageComparison {
  readonly source = input<ImageSource | null>(null);
  readonly result = input<EncodeResult | null>(null);
  readonly busy = input(false);
  protected readonly light = signal(false);
}
