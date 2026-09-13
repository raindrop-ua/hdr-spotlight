import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-encoding-faq',
  host: { class: 'mt-11 block' },
  templateUrl: './encoding-faq.component.html',
  styleUrl: './encoding-faq.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EncodingFaq {}
