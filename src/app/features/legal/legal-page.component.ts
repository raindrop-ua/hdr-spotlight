import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ThemeSwitcher } from '@shared/ui/theme-switcher/theme-switcher.component';
import { Icon } from '@shared/ui/icon/icon.component';

@Component({
  selector: 'app-legal-page',
  imports: [RouterLink, ThemeSwitcher, Icon],
  templateUrl: './legal-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalPage {
  private readonly route = inject(ActivatedRoute);
  protected readonly data = toSignal(this.route.data, { initialValue: this.route.snapshot.data });
}
