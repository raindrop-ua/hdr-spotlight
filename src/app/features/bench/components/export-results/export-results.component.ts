import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Icon } from '../../../../shared/ui/icon/icon.component';
import { EncodeResult } from '../../models/bench.models';

@Component({
  selector: 'app-export-results',
  imports: [DecimalPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './export-results.component.html',
})
export class ExportResults {
  readonly result = input<EncodeResult | null>(null);
}
