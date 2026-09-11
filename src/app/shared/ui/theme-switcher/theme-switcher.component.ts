import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ThemeService } from '@core/theme/theme.service';
import { Icon } from '@shared/ui/icon/icon.component';

@Component({
  selector: 'app-theme-switcher',
  imports: [Icon],
  templateUrl: './theme-switcher.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeSwitcher {
  protected readonly theme = inject(ThemeService);
  protected readonly options = [
    { value: 'system', label: 'System theme', icon: 'monitor' },
    { value: 'light', label: 'Light theme', icon: 'sun' },
    { value: 'dark', label: 'Dark theme', icon: 'moon' },
  ] as const;
}
