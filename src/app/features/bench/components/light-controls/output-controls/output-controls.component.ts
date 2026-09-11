import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { EncodeSettings } from '@features/bench/models/bench.models';

@Component({
  selector: 'app-output-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block space-y-6' },
  templateUrl: './output-controls.component.html',
})
export class OutputControls {
  readonly background = input.required<string>();
  readonly preserveTransparency = input.required<boolean>();
  readonly size = input.required<number>();
  readonly changed =
    output<Partial<Pick<EncodeSettings, 'background' | 'preserveTransparency' | 'size'>>>();
  protected readonly backgrounds = [
    { value: '#000000', label: 'Black' },
    { value: '#8a8fa8', label: 'Gray' },
    { value: '#ffffff', label: 'White' },
  ];
  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
  protected number(event: Event): number {
    return Number(this.value(event));
  }
}
