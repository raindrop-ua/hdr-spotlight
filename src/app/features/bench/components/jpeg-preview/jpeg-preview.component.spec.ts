import { TestBed } from '@angular/core/testing';
import { JpegPreview } from './jpeg-preview.component';
import { ImageEncoderService } from '@features/bench/services/image-encoder.service';
import { DEFAULT_SETTINGS, EncodeResult, JpegExport } from '@features/bench/models/bench.models';

const file: EncodeResult = {
  jpegUrl: 'blob:original',
  pngUrl: 'blob:png',
  jpegBytes: 2000,
  bytes: 2000,
  name: 'test',
  width: 400,
  height: 400,
  settings: { ...DEFAULT_SETTINGS },
  stats: { peakNits: 1000, litFraction: 0, clippedFraction: 0 },
};

async function setup() {
  const encode = vi.fn().mockResolvedValue({ url: 'blob:draft', bytes: 1000, quality: 70 });
  const prepare = vi.fn().mockResolvedValue(encode);
  TestBed.configureTestingModule({
    providers: [{ provide: ImageEncoderService, useValue: { prepareJpeg: prepare } }],
  });
  const fixture = TestBed.createComponent(JpegPreview);
  fixture.componentRef.setInput('result', file);
  fixture.componentRef.setInput('source', {
    name: 'test',
    width: 400,
    height: 400,
    url: 'blob:source',
    image: {},
  });
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const dialog = root.querySelector('dialog')!;
  dialog.showModal = vi.fn();
  dialog.close = vi.fn();
  root.querySelector('button')!.click();
  fixture.detectChanges();
  vi.useFakeTimers();
  const change = (quality: number) => {
    const slider = root.querySelector('input')!;
    slider.value = String(quality);
    slider.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const apply = () =>
    [...root.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Apply quality',
    )!;
  return { fixture, root, dialog, encode, prepare, change, apply };
}

describe('JPEG preview lifecycle', () => {
  beforeEach(() => vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined));
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('debounces changes, reuses the original render and transfers the applied URL', async () => {
    const { fixture, encode, prepare, change, apply } = await setup();
    const applied = vi.fn();
    fixture.componentInstance.applied.subscribe(applied);
    change(60);
    change(70);
    expect(apply().disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(250);
    fixture.detectChanges();
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(encode).toHaveBeenCalledTimes(1);
    expect(encode.mock.calls[0][0]).toBe(70);
    apply().click();
    expect(applied).toHaveBeenCalledWith({ url: 'blob:draft', bytes: 1000, quality: 70 });
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:draft');
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:original');
  });

  it('keeps the cancelled preview for CSS exit, then releases it on destruction', async () => {
    const { fixture, dialog, change } = await setup();
    const applied = vi.fn();
    fixture.componentInstance.applied.subscribe(applied);
    change(70);
    await vi.advanceTimersByTimeAsync(250);
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(dialog.close).toHaveBeenCalled();
    expect(applied).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:draft');
    fixture.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:draft');
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:original');
  });

  it('discards a late encode after the dialog is closed', async () => {
    const { encode, dialog, change } = await setup();
    let resolve!: (jpeg: JpegExport) => void;
    encode.mockReturnValue(
      new Promise<JpegExport>((done) => {
        resolve = done;
      }),
    );
    change(70);
    await vi.advanceTimersByTimeAsync(250);
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    resolve({ url: 'blob:late', bytes: 900, quality: 70 });
    await vi.advanceTimersByTimeAsync(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:late');
  });

  it('keeps the prior preview and prevents applying failed quality', async () => {
    const { fixture, root, encode, change, apply } = await setup();
    encode.mockRejectedValue(new Error('Export failed'));
    change(70);
    await vi.advanceTimersByTimeAsync(250);
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Export failed');
    expect(root.querySelector('img')?.getAttribute('src')).toBe('blob:original');
    expect(apply().disabled).toBe(true);
  });
});
