import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeSwitcher } from '@shared/ui/theme-switcher/theme-switcher.component';
import { Icon } from '@shared/ui/icon/icon.component';
import { SourceUpload } from '@features/bench/components/source-upload/source-upload.component';
import { FORMATS, ICON_SIZES, Format } from './conversion';
import { ConverterStore } from './converter-store.service';

@Component({
  selector: 'app-convert',
  imports: [RouterLink, ThemeSwitcher, Icon, SourceUpload],
  providers: [ConverterStore],
  templateUrl: './convert.component.html',
})
export class Convert {
  protected readonly store = inject(ConverterStore);
  protected readonly formats = FORMATS;
  protected readonly iconSizes = ICON_SIZES;
  protected setFormat(value: string): void {
    this.store.update({ format: value as Format });
  }
  protected bytes(value: number): string {
    return value < 1024
      ? `${value} B`
      : value < 1024 * 1024
        ? `${(value / 1024).toFixed(1)} KB`
        : `${(value / 1024 / 1024).toFixed(2)} MB`;
  }
}
