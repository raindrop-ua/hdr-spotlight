import { TestBed } from '@angular/core/testing';
import { ConverterStore } from './converter-store.service';
import { ConverterService } from '@features/converter/services/converter.service';
import { ConversionResult, ConversionSource } from '@features/converter/models/conversion.models';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const source = (name: string): ConversionSource => ({
  name,
  url: `blob:${name}`,
  width: 600,
  height: 300,
  bytes: 100,
  image: {} as ImageBitmap,
});
const result: ConversionResult = {
  name: 'out.webp',
  url: 'blob:out',
  bytes: 80,
  width: 600,
  height: 300,
};

describe('Converter state lifecycle', () => {
  let service: {
    load: ReturnType<typeof vi.fn>;
    convert: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
  let store: ConverterStore;
  const revoke = vi.fn();
  beforeEach(() => {
    service = { load: vi.fn(), convert: vi.fn(), release: vi.fn() };
    vi.stubGlobal('URL', { revokeObjectURL: revoke });
    TestBed.configureTestingModule({
      providers: [ConverterStore, { provide: ConverterService, useValue: service }],
    });
    store = TestBed.inject(ConverterStore);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('discards and releases a file decoded after a newer selection', async () => {
    const first = deferred<ConversionSource>();
    service.load.mockReturnValueOnce(first.promise).mockResolvedValueOnce(source('new'));
    const pending = store.load(new File([], 'old.png'));
    await store.load(new File([], 'new.png'));
    first.resolve(source('old'));
    await pending;
    expect(store.source()?.name).toBe('new');
    expect(service.release).toHaveBeenCalledWith(source('old'));
    expect(store.loading()).toBe(false);
  });
  it('invalidates downloaded results after settings change and keeps aspect ratio linked', async () => {
    service.load.mockResolvedValue(source('in'));
    service.convert.mockResolvedValue(result);
    await store.load(new File([], 'in.png'));
    await store.convert();
    expect(store.result()).toEqual(result);
    store.dimension('width', 200);
    expect(store.settings()).toMatchObject({ width: 200, height: 100 });
    expect(store.result()).toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:out');
  });
  it('does not publish an export if settings changed during conversion', async () => {
    const pending = deferred<ConversionResult>();
    service.load.mockResolvedValue(source('in'));
    service.convert.mockReturnValue(pending.promise);
    await store.load(new File([], 'in.png'));
    const task = store.convert();
    store.update({ format: 'png' });
    pending.resolve(result);
    await task;
    expect(store.result()).toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:out');
  });
  it('cleans up late loads when leaving the page', async () => {
    const pending = deferred<ConversionSource>();
    service.load.mockReturnValue(pending.promise);
    const task = store.load(new File([], 'in.png'));
    TestBed.resetTestingModule();
    pending.resolve(source('late'));
    await task;
    expect(service.release).toHaveBeenCalledWith(source('late'));
    expect(store.source()).toBeNull();
  });
  it('shows decode failures and allows a subsequent load', async () => {
    service.load
      .mockRejectedValueOnce(new Error('Invalid image'))
      .mockResolvedValueOnce(source('valid'));
    await store.load(new File([], 'broken.png'));
    expect(store.error()).toBe('Invalid image');
    expect(store.loading()).toBe(false);
    await store.load(new File([], 'valid.png'));
    expect(store.error()).toBe('');
    expect(store.source()?.name).toBe('valid');
  });
});
