import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeSwitcher } from '@core/theme/components/theme-switcher/theme-switcher.component';
import { Icon } from '@shared/ui/icon/icon.component';
import { SourceUpload } from '@shared/ui/source-upload/source-upload.component';
import { FORMATS, Format } from '@features/converter/models/conversion-format';
import { ICON_SIZES } from '@shared/images/codecs/ico';
import { ConverterStore } from '@features/converter/state/converter-store.service';

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
