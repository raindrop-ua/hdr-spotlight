import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Icon } from '@shared/ui/icon/icon.component';
import { EncodeSettings } from '@features/bench/models/bench.models';
import { ExposureControls } from '@features/bench/components/light-controls/exposure-controls/exposure-controls.component';
import { GlowMaskControls } from '@features/bench/components/light-controls/glow-mask-controls/glow-mask-controls.component';
import { OutputControls } from '@features/bench/components/light-controls/output-controls/output-controls.component';

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
