import { Component, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { EncodeSettings, GlowMode } from '@features/bench/models/bench.models';

@Component({
  selector: 'app-glow-mask-controls',
  imports: [DecimalPipe],
  host: { class: 'block space-y-6' },
  templateUrl: './glow-mask-controls.component.html',
})
export class GlowMaskControls {
  readonly mode = input.required<GlowMode>();
  readonly threshold = input.required<number>();
  readonly changed = output<Partial<Pick<EncodeSettings, 'mode' | 'threshold'>>>();
  protected readonly modes: { label: string; value: GlowMode; description: string }[] = [
    { label: 'Whites', value: 'whites', description: 'Boost near-neutral whites' },
    { label: 'Bright', value: 'bright', description: 'Boost bright areas, including colors' },
    { label: 'All', value: 'all', description: 'Boost every pixel' },
  ];
  protected number(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }
}
