import {
  afterNextRender,
  DestroyRef,
  inject,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import { Icon } from '@shared/ui/icon/icon.component';

@Component({
  selector: 'app-source-upload',
  imports: [Icon],
  templateUrl: './source-upload.component.html',
})
export class SourceUpload {
  readonly filename = input('');
  readonly loading = input(false);
  readonly selected = output<File>();
  protected readonly dragging = signal(false);

  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      const paste = (event: ClipboardEvent) => {
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
        )
          return;
        const file = event.clipboardData?.files[0];
        if (file) {
          event.preventDefault();
          this.selected.emit(file);
        }
      };
      window.addEventListener('paste', paste);
      this.destroyRef.onDestroy(() => window.removeEventListener('paste', paste));
    });
  }

  protected choose(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.selected.emit(file);
    input.value = '';
  }

  protected drop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files[0];
    if (file) this.selected.emit(file);
  }

  protected drag(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }
}
