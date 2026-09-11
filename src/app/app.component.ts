import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Bench } from '@features/bench/bench.component';

@Component({
  selector: 'app-root',
  imports: [Bench],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
