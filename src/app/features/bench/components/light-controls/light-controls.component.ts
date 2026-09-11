import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Icon } from '../../../../shared/ui/icon/icon.component';
import { EncodeSettings } from '../../models/bench.models';
import { ExposureControls } from './exposure-controls/exposure-controls.component';
import { GlowMaskControls } from './glow-mask-controls/glow-mask-controls.component';
import { OutputControls } from './output-controls/output-controls.component';

@Component({
  selector: 'app-light-controls',
  host: { class: 'block' },
  imports: [Icon, ExposureControls, GlowMaskControls, OutputControls],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './light-controls.component.html',
})
export class LightControls {
  readonly settings = input.required<EncodeSettings>();
  readonly ready = input(false);
  readonly busy = input(false);
  readonly changed = output<Partial<EncodeSettings>>();
  readonly resetRequested = output<void>();
  readonly encode = output<void>();
}
