import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-encoding-guide',
  host: { class: 'mt-11 block md:mt-16' },
  templateUrl: './encoding-guide.component.html',
  styleUrl: './encoding-guide.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EncodingGuide {}
