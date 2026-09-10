import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Icon } from '../../../../shared/ui/icon/icon.component';
import { EncodeSettings, GlowMode } from '../../models/bench.models';
import { pqOETF, stopsToNits } from '../../engine/color';

@Component({
  selector: 'app-light-controls',
  imports: [DecimalPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './light-controls.component.html',
})
export class LightControls {
  readonly settings = input.required<EncodeSettings>();
  readonly ready = input(false);
  readonly busy = input(false);
  readonly changed = output<Partial<EncodeSettings>>();
  readonly reset = output<void>();
  readonly encode = output<void>();
  protected readonly peak = computed(() => Math.round(stopsToNits(this.settings().stops)));
  protected readonly presets = [
    { label: 'Subtle', stops: 2 },
    { label: 'Standard', stops: 3 },
    { label: 'Intense', stops: 3.9 },
  ];
  protected readonly modes: { label: string; value: GlowMode; description: string }[] = [
    { label: 'Whites', value: 'whites', description: 'Boost near-neutral whites' },
    { label: 'Bright', value: 'bright', description: 'Boost bright areas, including colours' },
    { label: 'All', value: 'all', description: 'Boost every pixel' },
  ];
  protected readonly backgrounds = [
    { value: '#000000', label: 'Black' },
    { value: '#8a8fa8', label: 'Gray' },
    { value: '#ffffff', label: 'White' },
  ];
  protected readonly ticks = [203, 400, 800, 1500, 3000, 10000];
  protected position(nits: number): number {
    const low = pqOETF(203 / 10000);
    return ((pqOETF(nits / 10000) - low) / (1 - low)) * 100;
  }
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
