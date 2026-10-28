import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeSwitcher } from '@core/theme/components/theme-switcher/theme-switcher.component';
import { Icon } from '@shared/ui/icon/icon.component';
import { SourceUpload } from '@shared/ui/source-upload/source-upload.component';
import { LutStore } from '@features/lut/state/lut-store.service';
import { LUT_PRESETS } from '@features/lut/engine/presets';

@Component({
  selector: 'app-lut',
  imports: [RouterLink, ThemeSwitcher, Icon, SourceUpload],
  providers: [LutStore],
  templateUrl: './lut.component.html',
  styleUrl: './lut.component.css',
})
export class Lut {
  protected readonly store = inject(LutStore);
  protected readonly split = signal(50);
  protected readonly presets = LUT_PRESETS;
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
