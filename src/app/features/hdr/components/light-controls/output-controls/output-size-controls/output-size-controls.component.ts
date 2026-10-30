import { Component, computed, input, output } from '@angular/core';
import { OutputSizeSettings } from '@features/hdr/models/bench.models';
import { MAX_IMAGE_SIDE } from '@shared/images/constants/image-limits';
import { outputSizeError } from '@features/hdr/utils/output-size';
import { Dropdown, DropdownOption } from '@shared/ui/dropdown/dropdown.component';

@Component({
  selector: 'app-output-size-controls',
  imports: [Dropdown],
  host: { class: 'block' },
  templateUrl: './output-size-controls.component.html',
  styleUrl: './output-size-controls.component.css',
})
export class OutputSizeControls {
  readonly settings = input.required<OutputSizeSettings>();
  readonly changed = output<Partial<OutputSizeSettings>>();
  protected readonly maxSide = MAX_IMAGE_SIDE;
  protected readonly error = computed(() => outputSizeError(this.settings()));
  protected readonly sizeOptions: readonly DropdownOption[] = [
    { value: '400', label: '400 × 400' },
    { value: '800', label: '800 × 800' },
    { value: '1200', label: '1200 × 1200' },
    { value: '3840', label: '3840 × 3840 · 4K' },
    { value: '0', label: 'Original dimensions' },
    { value: 'custom', label: 'Custom dimensions' },
  ];

  protected selectSize(value: string): void {
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
