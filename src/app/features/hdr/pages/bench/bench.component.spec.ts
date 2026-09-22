import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { Bench } from './bench.component';
import { BenchStore } from '@features/hdr/state/bench-store.service';
import { DEFAULT_SETTINGS } from '@features/hdr/models/bench.models';

describe('Workbench component boundaries', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));
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

  it('edits custom dimensions, blocks invalid output and restores defaults', async () => {
    const fixture = TestBed.createComponent(Bench);
    await fixture.whenStable();
    const store = fixture.debugElement.injector.get(BenchStore);
    store.source.set({
      width: 600,
      height: 300,
      name: 'test',
      url: 'blob:test',
      image: {} as HTMLImageElement,
    });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const change = (selector: string, value: string, type = 'input') => {
      const input = element.querySelector(selector) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event(type, { bubbles: true }));
      fixture.detectChanges();
    };
    const encode = [...element.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Encode image'),
    )!;
    change('#size', 'custom', 'change');
    change('#output-width', '960');
    change('#output-height', '540');
    (element.querySelector('#preserve-aspect-ratio') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(store.settings()).toMatchObject({
      size: 'custom',
      customWidth: 960,
      customHeight: 540,
      preserveAspectRatio: false,
    });
    expect(encode.disabled).toBe(false);
    change('#output-width', '');
    expect(encode.disabled).toBe(true);
    expect(element.querySelector('#output-size-hint')?.textContent).toContain('whole number');
    change('#size', '800', 'change');
    expect(encode.disabled).toBe(false);
    change('#size', 'custom', 'change');
    expect((element.querySelector('#output-height') as HTMLInputElement).value).toBe('540');
    [...element.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Reset')!
      .click();
    fixture.detectChanges();
    expect(store.settings()).toEqual(DEFAULT_SETTINGS);
    expect(element.querySelector('#output-width')).toBeNull();
    expect((element.querySelector('#preserve-aspect-ratio') as HTMLInputElement).checked).toBe(
      true,
    );
    store.source.set(null);
  });
});
