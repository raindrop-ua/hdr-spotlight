import { outputSizeError } from '@features/hdr/utils/output-size';
import { Component, computed, input, output } from '@angular/core';
import { Icon } from '@shared/ui/icon/icon.component';
import { EncodeSettings } from '@features/hdr/models/bench.models';
import { ExposureControls } from '@features/hdr/components/light-controls/exposure-controls/exposure-controls.component';
import { GlowMaskControls } from '@features/hdr/components/light-controls/glow-mask-controls/glow-mask-controls.component';
import { OutputControls } from '@features/hdr/components/light-controls/output-controls/output-controls.component';

@Component({
  selector: 'app-light-controls',
  host: { class: 'block' },
  imports: [Icon, ExposureControls, GlowMaskControls, OutputControls],
  templateUrl: './light-controls.component.html',
})
export class LightControls {
  readonly settings = input.required<EncodeSettings>();
  protected readonly sizeError = computed(() => outputSizeError(this.settings()));
  readonly ready = input(false);
  readonly busy = input(false);
  readonly changed = output<Partial<EncodeSettings>>();
  readonly resetRequested = output<void>();
  readonly encode = output<void>();
}
