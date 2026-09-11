import { TestBed } from '@angular/core/testing';
import { BenchStore } from '@features/bench/services/bench-store.service';
import { ImageEncoderService } from '@features/bench/services/image-encoder.service';
import { DEFAULT_SETTINGS, EncodeResult } from '@features/bench/models/bench.models';
import { SourceImage } from '@features/bench/models/source-image.model';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const source = (name: string): SourceImage => ({
  name,
  url: `blob:${name}`,
  width: 600,
  height: 300,
  image: {} as HTMLImageElement,
});
const result = (): EncodeResult => ({
  jpegUrl: 'blob:jpeg',
  pngUrl: 'blob:png',
  name: 'logo',
  width: 400,
  height: 400,
  bytes: 1200,
  settings: { ...DEFAULT_SETTINGS },
  stats: { peakNits: 3030, litFraction: 0.08, clippedFraction: 0 },
});

describe('BenchStore asynchronous lifecycle', () => {
  let store: BenchStore;
  let encoder: { load: ReturnType<typeof vi.fn>; encode: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override revokeObjectURL = vi.fn();
      },
    );
    encoder = { load: vi.fn(), encode: vi.fn() };
    TestBed.configureTestingModule({
      providers: [BenchStore, { provide: ImageEncoderService, useValue: encoder }],
    });
    store = TestBed.inject(BenchStore);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('keeps the latest upload when an older decode finishes later', async () => {
    const old = deferred<SourceImage>();
    encoder.load.mockReturnValueOnce(old.promise).mockResolvedValueOnce(source('new'));
    const first = store.load(new File([], 'old'));
    await store.load(new File([], 'new'));
    old.resolve(source('old'));
    await first;
    expect(store.source()?.name).toBe('new');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:old');
    expect(store.loading()).toBe(false);
  });

  it('invalidates downloads on a setting change', async () => {
    encoder.load.mockResolvedValue(source('logo'));
    encoder.encode.mockResolvedValue(result());
    await store.load(new File([], 'logo'));
    await store.encode();
    expect(store.result()).not.toBeNull();
    store.update({ stops: 2 });
    expect(store.result()).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:jpeg');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:png');
  });

  it('cancels in-flight output when settings change and discards a late result', async () => {
    encoder.load.mockResolvedValue(source('logo'));
    const pending = deferred<EncodeResult>();
    encoder.encode.mockReturnValue(pending.promise);
    await store.load(new File([], 'logo'));
    const work = store.encode();
    const signal = encoder.encode.mock.calls[0][2] as AbortSignal;
    store.update({ size: 800 });
    expect(signal.aborted).toBe(true);
    pending.resolve(result());
    await work;
    expect(store.result()).toBeNull();
    expect(store.encoding()).toBe(false);
  });

  it('keeps a usable source on invalid replacement and restores busy state on failure', async () => {
    encoder.load
      .mockResolvedValueOnce(source('good'))
      .mockRejectedValueOnce(new Error('Invalid file'));
    await store.load(new File([], 'good'));
    await store.load(new File([], 'bad'));
    expect(store.source()?.name).toBe('good');
    expect(store.error()).toBe('Invalid file');
    expect(store.busy()).toBe(false);
    encoder.encode.mockRejectedValue(new Error('Export failed'));
    await store.encode();
    expect(store.error()).toBe('Export failed');
    expect(store.encoding()).toBe(false);
  });
});
