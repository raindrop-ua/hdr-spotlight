import { SiteFooter } from '@shared/ui/site-footer/site-footer.component';
import { Component } from '@angular/core';
import { Bench } from '@features/bench/bench.component';

@Component({
  selector: 'app-root',
  imports: [Bench, SiteFooter],
  templateUrl: './app.component.html',
})
export class App {}
