import { TestBed } from '@angular/core/testing';
import { createEditorDocument, CurveChannel } from '@features/lut/models/lut-editor.model';
import { CurveEditor } from './curve-editor.component';

describe('LUT curve controls', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('edits the selected RGB curve by keyboard without mutating the input array', async () => {
    await TestBed.configureTestingModule({ imports: [CurveEditor] }).compileComponents();
    const fixture = TestBed.createComponent(CurveEditor);
    const curves = createEditorDocument().settings.curves;
    fixture.componentRef.setInput('curves', curves);
    fixture.detectChanges();
    const changed = vi.fn();
    const committed = vi.fn();
    fixture.componentInstance.changed.subscribe(changed);
    fixture.componentInstance.committed.subscribe(committed);
    const root = fixture.nativeElement as HTMLElement;
    const red = Array.from(root.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Red',
    )!;
    red.click();
    fixture.detectChanges();
    committed.mockClear();
    const midpoint = root.querySelectorAll('.curve-target')[2];
    midpoint.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    midpoint.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp', bubbles: true }));
    expect(changed).toHaveBeenCalledExactlyOnceWith({
      channel: 'red',
      points: [0, 0.25, 0.51, 0.75, 1],
    });
    expect(curves.red).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(curves.master).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(committed).toHaveBeenCalledOnce();
  });

  it('reflects parent updates and requests a reset only for the active channel', async () => {
    await TestBed.configureTestingModule({ imports: [CurveEditor] }).compileComponents();
    const fixture = TestBed.createComponent(CurveEditor);
    const curves = createEditorDocument().settings.curves;
    fixture.componentRef.setInput('curves', curves);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const initialPath = root.querySelector('.curve-line')?.getAttribute('d');
    fixture.componentRef.setInput('curves', { ...curves, master: [0, 0.15, 0.4, 0.85, 1] });
    fixture.detectChanges();
    expect(root.querySelector('.curve-line')?.getAttribute('d')).not.toBe(initialPath);
    expect(root.querySelectorAll('.curve-target')[2].getAttribute('aria-valuenow')).toBe('40');
    const requested: CurveChannel[] = [];
    fixture.componentInstance.resetRequested.subscribe((channel) => requested.push(channel));
    const blue = Array.from(root.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Blue',
    )!;
    blue.click();
    fixture.detectChanges();
    Array.from(root.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Reset channel')!
      .click();
    expect(requested).toEqual(['blue']);
  });
});
