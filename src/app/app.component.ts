import { SiteFooter } from '@core/layout/site-footer/site-footer.component';
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SiteFooter],
  templateUrl: './app.component.html',
})
export class App {}
