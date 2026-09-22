import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AppUpdateService } from '@core/pwa/app-update.service';
import { Icon } from '@shared/ui/icon/icon.component';

@Component({
  selector: 'app-update-banner',
  host: { class: 'sticky top-0 z-50 block' },
  imports: [Icon],
  templateUrl: './update-banner.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateBanner {
  protected readonly updates = inject(AppUpdateService);
}
