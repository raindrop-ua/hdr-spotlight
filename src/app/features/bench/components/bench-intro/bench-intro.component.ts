import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-bench-intro',
  templateUrl: './bench-intro.component.html',
  styleUrl: './bench-intro.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BenchIntro {}
