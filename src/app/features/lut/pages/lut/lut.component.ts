import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeSwitcher } from '@core/theme/components/theme-switcher/theme-switcher.component';
import { Icon } from '@shared/ui/icon/icon.component';
import { SourceUpload } from '@shared/ui/source-upload/source-upload.component';
import { Dropdown, DropdownOption } from '@shared/ui/dropdown/dropdown.component';
import { LutStore } from '@features/lut/state/lut-store.service';
import { LUT_PRESETS, LutPreset } from '@features/lut/engine/presets';

const PRESET_SWATCHES: Record<LutPreset, string> = {
  original: 'linear-gradient(110deg, #c5c4b6, #ddd9c9 45%, #7b927b)',
  warm: 'linear-gradient(110deg, #a37957, #e8c899 45%, #93947a)',
  cool: 'linear-gradient(110deg, #758d99, #c7d4d5 45%, #829789)',
  soft: 'linear-gradient(110deg, #a49a95, #d9c9b8 45%, #b2b49b)',
  'hollywood-teal-orange': 'linear-gradient(110deg, #164f5b, #679b9a 40%, #e9a45e 85%, #f4d7b4)',
  'silver-mist': 'linear-gradient(110deg, #4d626b, #afc1c0 45%, #e2d8bd)',
  'amber-glow': 'linear-gradient(110deg, #263d42, #85a8af 45%, #f1d6a7)',
  'copper-trail': 'linear-gradient(110deg, #655c3e, #b68b5f 45%, #d8bf91)',
  'alpine-film': 'linear-gradient(110deg, #4b6570, #b7a3a5 45%, #e3d9c7)',
  'desert-bloom': 'linear-gradient(110deg, #457c80, #bf9670 45%, #eed99f)',
};

@Component({
  selector: 'app-lut',
  imports: [RouterLink, ThemeSwitcher, Icon, SourceUpload, Dropdown],
  providers: [LutStore],
  templateUrl: './lut.component.html',
  styleUrl: './lut.component.css',
})
export class Lut {
  protected readonly store = inject(LutStore);
  protected readonly split = signal(50);
  protected readonly presets = LUT_PRESETS;
  protected readonly presetOptions = computed<readonly DropdownOption[]>(() => {
    const options: DropdownOption[] = this.presets.map((preset) => ({
      value: preset.id,
      label: preset.name,
      description: preset.description,
      swatch: PRESET_SWATCHES[preset.id],
    }));
    if (this.store.preset() === 'custom') {
      options.push({
        value: 'custom',
        label: this.store.lut()?.title || 'Imported LUT',
        description: 'Your uploaded .cube LUT',
        disabled: true,
      });
    }
    return options;
  });
  protected readonly formatOptions: readonly DropdownOption[] = [
    { value: 'png', label: 'PNG · lossless' },
    { value: 'jpeg', label: 'JPEG' },
    { value: 'webp', label: 'WebP' },
  ];
  protected readonly downloadableLut = computed(() => {
    const preset = this.presets.find((item) => item.id === this.store.preset());
    return preset?.downloadable ? preset.asset : undefined;
  });
  private comparePointer?: number;

  protected startCompare(event: PointerEvent): void {
    if (event.button !== 0) return;
    const target = event.currentTarget as HTMLElement;
    this.comparePointer = event.pointerId;
    target.setPointerCapture(event.pointerId);
    this.moveCompare(event);
  }

  protected moveCompare(event: PointerEvent): void {
    if (this.comparePointer !== event.pointerId) return;
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (bounds.width) {
      this.split.set(
        Math.round(
          Math.min(100, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * 100)),
        ),
      );
    }
  }

  protected endCompare(event: PointerEvent): void {
    if (this.comparePointer !== event.pointerId) return;
    this.comparePointer = undefined;
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  }

  protected loadLut(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void this.store.loadLut(file);
    input.value = '';
  }

  protected selectPreset(value: string): void {
    const preset = this.presets.find((item) => item.id === value);
    if (preset) void this.store.selectPreset(preset.id);
  }

  protected setFormat(value: string): void {
    if (value === 'png' || value === 'jpeg' || value === 'webp') {
      this.store.update({ format: value });
    }
  }

  protected bytes(value: number): string {
    return value < 1024
      ? `${value} B`
      : value < 1024 * 1024
        ? `${(value / 1024).toFixed(1)} KB`
        : `${(value / 1024 / 1024).toFixed(2)} MB`;
  }
}
