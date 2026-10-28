import { TestBed } from '@angular/core/testing';
import { LutStore } from './lut-store.service';
import { LutService } from '@features/lut/services/lut.service';
import { Lut3D } from '@features/lut/models/lut.model';
import { LutPreview, LutResult, LutSource } from '@features/lut/models/lut-workspace.model';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const source = (name: string): LutSource => ({
  name,
  url: `blob:${name}`,
  width: 600,
  height: 400,
  bytes: 100,
  demo: false,
  image: {} as ImageBitmap,
});
const preview: LutPreview = { originalUrl: 'blob:original', url: 'blob:processed' };
const result: LutResult = {
  url: 'blob:export',
  name: 'photo-lut.png',
  width: 600,
  height: 400,
  bytes: 80,
  format: 'png',
};
const lut: Lut3D = {
  title: 'Custom look',
  size: 2,
  domainMin: [0, 0, 0],
  domainMax: [1, 1, 1],
  values: new Float32Array(24),
};

describe('LUT workspace lifecycle', () => {
  let store: LutStore;
  let service: {
    load: ReturnType<typeof vi.fn>;
    loadDemo: ReturnType<typeof vi.fn>;
    loadLut: ReturnType<typeof vi.fn>;
    loadPreset: ReturnType<typeof vi.fn>;
    preview: ReturnType<typeof vi.fn>;
    export: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
  const revoke = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('URL', { revokeObjectURL: revoke });
    service = {
      load: vi.fn().mockResolvedValue(source('photo.png')),
      loadDemo: vi.fn().mockResolvedValue({ ...source('demo.jpg'), demo: true }),
      loadLut: vi.fn().mockResolvedValue(lut),
      loadPreset: vi.fn().mockResolvedValue(lut),
      preview: vi.fn().mockResolvedValue(preview),
      export: vi.fn().mockResolvedValue(result),
      release: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [LutStore, { provide: LutService, useValue: service }],
    });
    store = TestBed.inject(LutStore);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('keeps the valid image and previews when another file cannot be decoded', async () => {
    await store.loadImage(new File([], 'photo.png'));
    await vi.advanceTimersByTimeAsync(100);
    service.load.mockRejectedValueOnce(new Error('Invalid image'));
    await store.loadImage(new File([], 'broken.png'));
    expect(store.source()?.name).toBe('photo.png');
    expect(store.previewUrl()).toBe('blob:processed');
    expect(service.release).not.toHaveBeenCalled();
    expect(store.error()).toBe('Invalid image');
  });

  it('releases an older image that finishes loading after a newer selection', async () => {
    const older = deferred<LutSource>();
    service.load.mockReturnValueOnce(older.promise).mockResolvedValueOnce(source('new.png'));
    const pending = store.loadImage(new File([], 'old.png'));
    await store.loadImage(new File([], 'new.png'));
    older.resolve(source('old.png'));
    await pending;
    expect(store.source()?.name).toBe('new.png');
    expect(service.release).toHaveBeenCalledWith(source('old.png'));
    expect(store.loading()).toBe(false);
  });

  it('keeps the prior LUT on an invalid upload and ignores a load superseded by a preset', async () => {
    await store.loadLut(new File([], 'valid.cube'));
    service.loadLut.mockRejectedValueOnce(new Error('Invalid cube'));
    await store.loadLut(new File([], 'broken.cube'));
    expect(store.lut()).toBe(lut);
    expect(store.error()).toBe('Invalid cube');
    const late = deferred<Lut3D>();
    service.loadLut.mockReturnValueOnce(late.promise);
    const pending = store.loadLut(new File([], 'late.cube'));
    store.selectPreset('original');
    late.resolve(lut);
    await pending;
    expect(store.lut()).toBeNull();
    expect(store.preset()).toBe('original');
    expect(store.lutLoading()).toBe(false);
  });

  it('debounces strength changes and only renders the latest settings', async () => {
    await store.loadImage(new File([], 'photo.png'));
    store.update({ intensity: 20 });
    await vi.advanceTimersByTimeAsync(50);
    store.update({ intensity: 75 });
    await vi.advanceTimersByTimeAsync(99);
    expect(service.preview).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(service.preview).toHaveBeenCalledExactlyOnceWith(
      source('photo.png'),
      null,
      75,
      expect.any(AbortSignal),
    );
    expect(store.previewing()).toBe(false);
  });

  it('aborts and releases stale preview results when a new look is requested', async () => {
    const older = deferred<LutPreview>();
    service.preview.mockReturnValueOnce(older.promise);
    await store.loadImage(new File([], 'photo.png'));
    await vi.advanceTimersByTimeAsync(100);
    const signal = service.preview.mock.calls[0][3] as AbortSignal;
    store.update({ intensity: 30 });
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    older.resolve({ originalUrl: 'blob:old-original', url: 'blob:old-processed' });
    await Promise.resolve();
    expect(store.previewUrl()).toBe('blob:processed');
    expect(revoke).toHaveBeenCalledWith('blob:old-original');
    expect(revoke).toHaveBeenCalledWith('blob:old-processed');
  });

  it('invalidates a finished export and discards an export completed after settings change', async () => {
    await store.loadImage(new File([], 'photo.png'));
    await store.export();
    expect(store.result()).toEqual(result);
    store.update({ format: 'jpeg' });
    expect(store.result()).toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:export');
    const late = deferred<LutResult>();
    service.export.mockReturnValueOnce(late.promise);
    const pending = store.export();
    const signal = service.export.mock.calls.at(-1)![3] as AbortSignal;
    store.update({ quality: 80 });
    expect(signal.aborted).toBe(true);
    late.resolve({ ...result, url: 'blob:late-export' });
    await pending;
    expect(store.result()).toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:late-export');
    expect(store.exporting()).toBe(false);
  });

  it('releases the decoded image and unique preview URLs when leaving the page', async () => {
    service.preview.mockResolvedValueOnce({ originalUrl: 'blob:same', url: 'blob:same' });
    await store.loadImage(new File([], 'photo.png'));
    await vi.advanceTimersByTimeAsync(100);
    await store.export();
    TestBed.resetTestingModule();
    expect(service.release).toHaveBeenCalledWith(source('photo.png'));
    expect(revoke.mock.calls.filter(([url]) => url === 'blob:same')).toHaveLength(1);
    expect(revoke).toHaveBeenCalledWith('blob:export');
  });

  it('releases a file decoded after the page is destroyed', async () => {
    const late = deferred<LutSource>();
    service.load.mockReturnValueOnce(late.promise);
    const pending = store.loadImage(new File([], 'photo.png'));
    TestBed.resetTestingModule();
    late.resolve(source('late.png'));
    await pending;
    expect(service.release).toHaveBeenCalledWith(source('late.png'));
    expect(store.source()).toBeNull();
  });

  it('cancels a collection LUT and ignores it when Original is selected', async () => {
    const late = deferred<Lut3D>();
    service.loadPreset.mockReturnValueOnce(late.promise);
    const pending = store.selectPreset('silver-mist');
    const signal = service.loadPreset.mock.calls[0][1] as AbortSignal;
    expect(store.lutLoading()).toBe(true);
    await store.selectPreset('original');
    expect(signal.aborted).toBe(true);
    late.resolve(lut);
    await pending;
    expect(store.preset()).toBe('original');
    expect(store.lut()).toBeNull();
    expect(store.lutLoading()).toBe(false);
  });

  it('keeps the newest preset when an older fetch finishes last', async () => {
    const older = deferred<Lut3D>();
    const newer = { ...lut, title: 'Desert Bloom' };
    service.loadPreset.mockReturnValueOnce(older.promise).mockResolvedValueOnce(newer);
    const pending = store.selectPreset('silver-mist');
    await store.selectPreset('desert-bloom');
    older.resolve({ ...lut, title: 'Silver Mist' });
    await pending;
    expect(store.preset()).toBe('desert-bloom');
    expect(store.lut()).toBe(newer);
    expect(store.error()).toBeNull();
  });

  it('keeps an uploaded LUT when a superseded collection request fails', async () => {
    const late = deferred<Lut3D>();
    service.loadPreset.mockReturnValueOnce(late.promise);
    const pending = store.selectPreset('alpine-film');
    const signal = service.loadPreset.mock.calls[0][1] as AbortSignal;
    await store.loadLut(new File([], 'custom.cube'));
    expect(signal.aborted).toBe(true);
    late.reject(new Error('Late network error'));
    await pending;
    expect(store.preset()).toBe('custom');
    expect(store.lut()).toBe(lut);
    expect(store.error()).toBeNull();
    expect(store.lutLoading()).toBe(false);
  });

  it('retains the prior look on failure and prevents export while a preset is loading', async () => {
    await store.loadImage(new File([], 'photo.png'));
    await store.selectPreset('warm');
    await store.export();
    const late = deferred<Lut3D>();
    service.loadPreset.mockReturnValueOnce(late.promise);
    const pending = store.selectPreset('amber-glow');
    expect(store.result()).toBeNull();
    expect(store.preset()).toBe('warm');
    expect(store.lut()).toBe(lut);
    await store.export();
    expect(service.export).toHaveBeenCalledOnce();
    late.reject(new Error('Could not load preset'));
    await pending;
    expect(store.preset()).toBe('warm');
    expect(store.lut()).toBe(lut);
    expect(store.lutLoading()).toBe(false);
    expect(store.error()).toBe('Could not load preset');
    await store.selectPreset('amber-glow');
    expect(store.preset()).toBe('amber-glow');
    expect(store.error()).toBeNull();
  });

  it('aborts a pending preset request when the page is destroyed', async () => {
    const late = deferred<Lut3D>();
    service.loadPreset.mockReturnValueOnce(late.promise);
    const pending = store.selectPreset('copper-trail');
    const signal = service.loadPreset.mock.calls[0][1] as AbortSignal;
    TestBed.resetTestingModule();
    expect(signal.aborted).toBe(true);
    late.resolve(lut);
    await pending;
    expect(store.lut()).toBeNull();
    expect(store.preset()).toBe('original');
  });
});
