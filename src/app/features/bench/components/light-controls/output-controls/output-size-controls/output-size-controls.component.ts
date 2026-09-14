import { Component, computed, input, output } from '@angular/core';
import { OutputSizeSettings } from '@features/bench/models/bench.models';
import { MAX_OUTPUT_SIDE, outputSizeError } from '@features/bench/models/output-size';

@Component({
  selector: 'app-output-size-controls',
  host: { class: 'block' },
  templateUrl: './output-size-controls.component.html',
})
export class OutputSizeControls {
  readonly settings = input.required<OutputSizeSettings>();
  readonly changed = output<Partial<OutputSizeSettings>>();
  protected readonly maxSide = MAX_OUTPUT_SIDE;
  protected readonly error = computed(() => outputSizeError(this.settings()));

  protected selectSize(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.changed.emit({ size: value === 'custom' ? 'custom' : Number(value) });
  }

  protected dimension(event: Event, axis: 'customWidth' | 'customHeight'): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    this.changed.emit({ [axis]: Number.isNaN(value) ? null : value });
  }

  protected toggleAspectRatio(event: Event): void {
    this.changed.emit({ preserveAspectRatio: (event.target as HTMLInputElement).checked });
  }
}
