import { afterNextRender, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeSwitcher } from '@core/theme/components/theme-switcher/theme-switcher.component';
import { CurveEditor } from '@features/lut/components/curve-editor/curve-editor.component';
import { LUT_PRESETS, LutPreset } from '@features/lut/engine/presets';
import {
  createEditorDocument,
  EditorDownload,
  ToneSettings,
} from '@features/lut/models/lut-editor.model';
import { LutEditorStore } from '@features/lut/state/lut-editor-store.service';
import { Icon } from '@shared/ui/icon/icon.component';
import { SourceUpload } from '@shared/ui/source-upload/source-upload.component';
import { Dropdown, DropdownOption } from '@shared/ui/dropdown/dropdown.component';

type BasicControl = 'exposure' | 'contrast' | 'saturation' | 'temperature' | 'tint';
type ToneControl = 'shadows' | 'midtones' | 'highlights';

@Component({
  selector: 'app-lut-editor',
  imports: [RouterLink, ThemeSwitcher, Icon, SourceUpload, CurveEditor, Dropdown],
  providers: [LutEditorStore],
  templateUrl: './lut-editor.component.html',
  styleUrl: './lut-editor.component.css',
})
export class LutEditor {
  protected readonly store = inject(LutEditorStore);
  protected readonly presets = LUT_PRESETS;
  protected readonly baseOptions = computed<readonly DropdownOption[]>(() => [
    ...this.presets.map((preset) => ({ value: preset.id, label: preset.name })),
    {
      value: 'custom',
      label:
        this.store.basePreset() === 'custom'
          ? (this.store.document().base?.title ?? 'Imported LUT')
          : 'Imported LUT',
      disabled: this.store.basePreset() !== 'custom',
    },
  ]);
  protected readonly sizeOptions: readonly DropdownOption[] = [
    { value: '33', label: '33 × 33 × 33' },
    { value: '65', label: '65 × 65 × 65' },
  ];
  protected readonly split = signal(50);
  protected readonly controls: readonly {
    key: BasicControl;
    label: string;
    min: number;
    max: number;
    step: number;
    low: string;
    high: string;
  }[] = [
    {
      key: 'exposure',
      label: 'Exposure',
      min: -3,
      max: 3,
      step: 0.05,
      low: 'Darker',
      high: 'Brighter',
    },
    {
      key: 'contrast',
      label: 'Contrast',
      min: -100,
      max: 100,
      step: 1,
      low: 'Soft',
      high: 'Strong',
    },
    {
      key: 'saturation',
      label: 'Saturation',
      min: 0,
      max: 200,
      step: 1,
      low: 'Muted',
      high: 'Vivid',
    },
    {
      key: 'temperature',
      label: 'Temperature',
      min: -100,
      max: 100,
      step: 1,
      low: 'Cool',
      high: 'Warm',
    },
    { key: 'tint', label: 'Tint', min: -100, max: 100, step: 1, low: 'Green', high: 'Magenta' },
  ];
  protected readonly tones: readonly { key: ToneControl; label: string }[] = [
    { key: 'shadows', label: 'Shadows' },
    { key: 'midtones', label: 'Midtones' },
    { key: 'highlights', label: 'Highlights' },
  ];
  private readonly defaults = createEditorDocument().settings;
  private comparePointer?: number;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const shortcut = (event: KeyboardEvent) => {
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.tagName === 'TEXTAREA' ||
            (target instanceof HTMLInputElement && target.type !== 'range'))
        )
          return;
        if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'z')
          return;
        event.preventDefault();
        if (event.shiftKey) this.store.redo();
        else this.store.undo();
      };
      window.addEventListener('keydown', shortcut);
      destroyRef.onDestroy(() => window.removeEventListener('keydown', shortcut));
    });
  }

  protected setBase(value: string): void {
    if (this.presets.some((preset) => preset.id === value))
      void this.store.selectBase(value as LutPreset);
  }

  protected readFile(event: Event, kind: 'base' | 'project'): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      if (kind === 'base') void this.store.loadBase(file);
      else void this.store.loadProject(file);
    }
    input.value = '';
  }

  protected setValue(key: BasicControl, value: number): void {
    this.store.update({ [key]: value });
  }

  protected resetValue(key: BasicControl): void {
    this.store.update({ [key]: this.defaults[key] });
    this.store.commit();
  }

  protected setTone(key: ToneControl, field: keyof ToneSettings, value: number): void {
    this.store.update({ [key]: { ...this.store.document().settings[key], [field]: value } });
  }

  protected resetTone(key: ToneControl): void {
    this.store.update({ [key]: { ...this.defaults[key] } });
    this.store.commit();
  }

  protected formatValue(key: BasicControl, value: number): string {
    return key === 'exposure'
      ? `${value > 0 ? '+' : ''}${value.toFixed(2)} EV`
      : `${value}${key === 'saturation' ? '%' : ''}`;
  }

  protected setSize(value: string): void {
    if (value === '33' || value === '65') this.store.setSize(+value as 33 | 65);
  }

  protected async save(kind: 'cube' | 'project' | 'image'): Promise<void> {
    const file =
      kind === 'cube'
        ? await this.store.exportCube()
        : kind === 'image'
          ? await this.store.exportImage()
          : this.store.exportProject();
    if (file) this.download(file);
  }

  protected startCompare(event: PointerEvent): void {
    if (event.button !== 0) return;
    this.comparePointer = event.pointerId;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.moveCompare(event);
  }

  protected moveCompare(event: PointerEvent): void {
    if (this.comparePointer !== event.pointerId) return;
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (bounds.width)
      this.split.set(
        Math.round(
          Math.min(100, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * 100)),
        ),
      );
  }

  protected endCompare(event: PointerEvent): void {
    if (this.comparePointer !== event.pointerId) return;
    this.comparePointer = undefined;
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  }

  private download(file: EditorDownload): void {
    const link = document.createElement('a');
    link.href = file.url;
    link.download = file.name;
    link.click();
  }
}
