import { TestBed } from '@angular/core/testing';
import { Bench } from '@features/bench/bench.component';
import { BenchStore } from '@features/bench/services/bench-store.service';
import { DEFAULT_SETTINGS } from '@features/bench/models/bench.models';
import { SourceUpload } from '@features/bench/components/source-upload/source-upload.component';
import { DisplayIndicator } from '@features/bench/components/display-indicator/display-indicator.component';

function pasteEvent(file: File): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { files: [file] } });
  return event;
}

describe('Workbench component boundaries', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('routes each settings group through the store and propagates reset back to all controls', async () => {
    const fixture = TestBed.createComponent(Bench);
    await fixture.whenStable();
    const store = fixture.debugElement.injector.get(BenchStore);
    const element = fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      [...element.querySelectorAll('button')].find((el) => el.textContent?.trim() === label)!;
    const change = (selector: string, value: string, type = 'input') => {
      const input = element.querySelector(selector) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event(type, { bubbles: true }));
      fixture.detectChanges();
    };

    expect(button('Standard').getAttribute('aria-pressed')).toBe('true');
    button('Subtle').click();
    fixture.detectChanges();
    expect(store.settings().stops).toBe(2);
    change('#boost', '3');
    expect(store.settings().stops).toBe(3);
    expect(button('Standard').getAttribute('aria-pressed')).toBe('true');

    button('All').click();
    fixture.detectChanges();
    expect(store.settings().mode).toBe('all');
    expect(element.querySelector('#threshold')).toBeNull();
    button('Bright').click();
    fixture.detectChanges();
    change('#threshold', '70');
    expect(store.settings().threshold).toBe(0.7);

    const transparency = element.querySelector('[role="switch"]') as HTMLInputElement;
    transparency.click();
    fixture.detectChanges();
    change('#size', '800', 'change');
    change('#jpeg-quality', '72');
    change('[type="color"]', '#123456');
    expect(store.settings()).toMatchObject({
      preserveTransparency: true,
      jpegQuality: 72,
      size: 800,
      background: '#123456',
      stops: 3,
      mode: 'bright',
      threshold: 0.7,
    });
    expect(element.textContent).toContain('JPEG background');

    button('Reset').click();
    fixture.detectChanges();
    expect(store.settings()).toEqual(DEFAULT_SETTINGS);
    expect((element.querySelector('#boost') as HTMLInputElement).value).toBe('3');
    expect(button('Standard').getAttribute('aria-pressed')).toBe('true');
    expect((element.querySelector('#threshold') as HTMLInputElement).value).toBe('85');
    expect((element.querySelector('#size') as HTMLSelectElement).value).toBe('400');
    expect(transparency.checked).toBe(false);
    expect((element.querySelector('#jpeg-quality') as HTMLInputElement).value).toBe('100');
  });

  it('owns clipboard selection in the uploader, respects inputs and removes the global listener', async () => {
    const fixture = TestBed.createComponent(SourceUpload);
    const selected = vi.fn();
    fixture.componentInstance.selected.subscribe(selected);
    await fixture.whenStable();
    const file = new File(['image'], 'test.png', { type: 'image/png' });
    const event = pasteEvent(file);
    window.dispatchEvent(event);
    expect(selected).toHaveBeenCalledWith(file);
    expect(event.defaultPrevented).toBe(true);

    const input = document.createElement('input');
    document.body.append(input);
    try {
      const inputEvent = pasteEvent(file);
      input.dispatchEvent(inputEvent);
      expect(inputEvent.defaultPrevented).toBe(false);
      expect(selected).toHaveBeenCalledTimes(1);
    } finally {
      input.remove();
    }

    fixture.destroy();
    const afterDestroy = pasteEvent(file);
    window.dispatchEvent(afterDestroy);
    expect(afterDestroy.defaultPrevented).toBe(false);
    expect(selected).toHaveBeenCalledTimes(1);
  });

  it('updates display status on media changes and releases its listener', async () => {
    const query = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => query),
    );
    const fixture = TestBed.createComponent(DisplayIndicator);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('SDR display');
    const update = query.addEventListener.mock.calls[0][1] as () => void;
    query.matches = true;
    update();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('HDR display');
    fixture.destroy();
    expect(query.removeEventListener).toHaveBeenCalledWith('change', update);
  });
});
