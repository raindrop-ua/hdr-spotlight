import { Component, computed, input, output, signal } from '@angular/core';
import { evaluateCurve } from '@features/lut/engine/editor-transform';
import type { CurveChannel, EditorCurves } from '@features/lut/models/lut-editor.model';

const HEIGHT = 220;
const LEFT = 24;
const TOP = 14;
const PLOT_WIDTH = 260;
const PLOT_HEIGHT = 184;
const ADJUST_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'PageUp',
  'PageDown',
  'Home',
  'End',
]);

@Component({
  selector: 'app-curve-editor',
  templateUrl: './curve-editor.component.html',
  styleUrl: './curve-editor.component.css',
})
export class CurveEditor {
  readonly curves = input.required<EditorCurves>();
  readonly changed = output<{ channel: CurveChannel; points: number[] }>();
  readonly committed = output<void>();
  readonly resetRequested = output<CurveChannel>();

  protected readonly channels = [
    { id: 'master', label: 'Master' },
    { id: 'red', label: 'Red' },
    { id: 'green', label: 'Green' },
    { id: 'blue', label: 'Blue' },
  ] as const;
  protected readonly channel = signal<CurveChannel>('master');
  protected readonly selectedPoint = signal(2);
  protected readonly grid = [0, 0.25, 0.5, 0.75, 1];
  protected readonly points = computed(() => this.curves()[this.channel()]);
  protected readonly channelLabel = computed(
    () => this.channels.find((item) => item.id === this.channel())!.label,
  );
  protected readonly selectedValue = computed(() => this.points()[this.selectedPoint()] * 100);
  protected readonly valueLabel = computed(() => `${Math.round(this.selectedValue() * 10) / 10}%`);
  protected readonly curvePath = computed(() => {
    const points = this.points();
    const positions: string[] = [];
    for (let index = 0; index <= 100; index++) {
      const x = index / 100;
      const y = Math.min(1, Math.max(0, evaluateCurve(points, x)));
      positions.push(
        `${index === 0 ? 'M' : 'L'}${(LEFT + x * PLOT_WIDTH).toFixed(2)} ${(TOP + (1 - y) * PLOT_HEIGHT).toFixed(2)}`,
      );
    }
    return positions.join(' ');
  });
  private pointer?: number;

  protected chooseChannel(channel: CurveChannel): void {
    this.committed.emit();
    this.channel.set(channel);
  }

  protected x(value: number): number {
    return LEFT + value * PLOT_WIDTH;
  }

  protected y(value: number): number {
    return TOP + (1 - value) * PLOT_HEIGHT;
  }

  protected pointLabel(index: number): string {
    return `${this.channelLabel()} curve point ${index + 1}`;
  }

  protected percentage(value: number): number {
    return Math.round(value * 1000) / 10;
  }

  protected selectPoint(index: number): void {
    this.selectedPoint.set(index);
  }

  protected startDrag(event: PointerEvent, index: number, graph: Element): void {
    if (event.button !== 0 || this.pointer !== undefined) return;
    event.preventDefault();
    this.selectedPoint.set(index);
    this.pointer = event.pointerId;
    (event.currentTarget as SVGCircleElement).focus();
    graph.setPointerCapture(event.pointerId);
    this.drag(event, graph);
  }

  protected drag(event: PointerEvent, graph: Element): void {
    if (this.pointer !== event.pointerId) return;
    const bounds = graph.getBoundingClientRect();
    if (!bounds.height || !bounds.width) return;
    // The SVG keeps its viewBox ratio, so CSS scaling and mobile width use the same coordinates.
    const y = ((event.clientY - bounds.top) / bounds.height) * HEIGHT;
    this.setPoint(this.selectedPoint(), 1 - (y - TOP) / PLOT_HEIGHT);
  }

  protected endDrag(event: PointerEvent, graph: Element): void {
    if (this.pointer !== event.pointerId) return;
    this.pointer = undefined;
    if (graph.hasPointerCapture(event.pointerId)) graph.releasePointerCapture(event.pointerId);
    this.committed.emit();
  }

  protected keyDown(event: KeyboardEvent, index: number): void {
    if (!ADJUST_KEYS.has(event.key)) return;
    event.preventDefault();
    this.selectedPoint.set(index);
    const current = this.points()[index];
    const amount = event.shiftKey || event.key.startsWith('Page') ? 0.1 : 0.01;
    const value =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? 1
          : current + (['ArrowUp', 'ArrowRight', 'PageUp'].includes(event.key) ? amount : -amount);
    this.setPoint(index, value);
  }

  protected keyUp(event: KeyboardEvent): void {
    if (ADJUST_KEYS.has(event.key)) this.committed.emit();
  }

  protected changeOutput(event: Event): void {
    this.setPoint(this.selectedPoint(), +(event.target as HTMLInputElement).value / 100);
  }

  protected reset(): void {
    this.resetRequested.emit(this.channel());
  }

  private setPoint(index: number, value: number): void {
    const points = [...this.points()];
    points[index] = Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
    this.changed.emit({ channel: this.channel(), points });
  }
}
