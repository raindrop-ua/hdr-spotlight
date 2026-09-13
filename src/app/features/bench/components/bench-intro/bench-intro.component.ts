import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-bench-intro',
  host: { class: 'block' },
  templateUrl: './bench-intro.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BenchIntro {}
