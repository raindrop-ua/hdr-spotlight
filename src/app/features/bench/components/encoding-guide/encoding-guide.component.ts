import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-encoding-guide',
  templateUrl: './encoding-guide.component.html',
  styleUrl: './encoding-guide.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EncodingGuide {}
