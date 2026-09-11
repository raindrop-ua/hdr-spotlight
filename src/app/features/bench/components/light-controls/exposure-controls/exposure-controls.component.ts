import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { pqOETF, stopsToNits } from '@features/bench/engine/color';

@Component({
  selector: 'app-exposure-controls',
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block space-y-6' },
  templateUrl: './exposure-controls.component.html',
})
export class ExposureControls {
  readonly stops = input.required<number>();
  readonly stopsChanged = output<number>();
  protected readonly peak = computed(() => Math.round(stopsToNits(this.stops())));
  protected readonly presets = [
    { label: 'Subtle', stops: 2 },
    { label: 'Standard', stops: 3 },
    { label: 'Intense', stops: 3.9 },
  ];
  protected readonly ticks = [203, 400, 800, 1500, 3000, 10000];
  protected position(nits: number): number {
    const low = pqOETF(203 / 10000);
    return ((pqOETF(nits / 10000) - low) / (1 - low)) * 100;
  }
  protected number(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }
}
