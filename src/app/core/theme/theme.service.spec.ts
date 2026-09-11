import { TestBed } from '@angular/core/testing';
import { ThemeSwitcher } from '../../shared/ui/theme-switcher/theme-switcher.component';
import { ThemeService } from './theme.service';

describe('Theme preference', () => {
  let media: {
    matches: boolean;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    localStorage.removeItem('spotlight.theme');
    media = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => media),
    );
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.removeItem('spotlight.theme');
    delete document.documentElement.dataset['theme'];
  });

  async function setup() {
    const fixture = TestBed.createComponent(ThemeSwitcher);
    await fixture.whenStable();
    return { fixture, service: TestBed.inject(ThemeService) };
  }

  function changeSystem(dark: boolean) {
    media.matches = dark;
    (media.addEventListener.mock.calls[0][1] as () => void)();
  }

  it('follows the system without persisting an automatic choice', async () => {
    const { service } = await setup();
    expect(service.preference()).toBe('system');
    expect(service.theme()).toBe('dark');
    changeSystem(false);
    expect(service.theme()).toBe('light');
    expect(localStorage.getItem('spotlight.theme')).toBeNull();
  });

  it('keeps a manual choice across system changes and restores it on initialization', async () => {
    const { fixture, service } = await setup();
    const button = fixture.nativeElement.querySelector(
      '[aria-label="Light theme"]',
    ) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('spotlight.theme')).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    changeSystem(true);
    expect(service.theme()).toBe('light');
    TestBed.resetTestingModule();
    const restored = await setup();
    expect(restored.service.preference()).toBe('light');
  });

  it('returns to the current system theme and removes the saved override', async () => {
    localStorage.setItem('spotlight.theme', 'light');
    const { service } = await setup();
    service.setPreference('system');
    expect(service.theme()).toBe('dark');
    expect(localStorage.getItem('spotlight.theme')).toBeNull();
    changeSystem(false);
    expect(service.theme()).toBe('light');
  });

  it('synchronizes other tabs including cleared storage, ignoring unrelated changes', async () => {
    const { service } = await setup();
    const storage = (key: string | null, newValue: string | null) =>
      window.dispatchEvent(
        new StorageEvent('storage', { key, newValue, storageArea: localStorage }),
      );
    storage('spotlight.theme', 'light');
    expect(service.theme()).toBe('light');
    storage('unrelated', 'dark');
    expect(service.preference()).toBe('light');
    storage(null, null);
    expect(service.preference()).toBe('system');
    expect(service.theme()).toBe('dark');
  });

  it('ignores invalid saved preferences', async () => {
    localStorage.setItem('spotlight.theme', 'invalid');
    const { service } = await setup();
    expect(service.preference()).toBe('system');
  });

  it('works when storage access is denied', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const { service } = await setup();
    expect(service.theme()).toBe('dark');
    expect(() => service.setPreference('light')).not.toThrow();
    expect(service.theme()).toBe('light');
  });

  it('releases browser listeners on destruction', async () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    await setup();
    TestBed.resetTestingModule();
    expect(media.removeEventListener).toHaveBeenCalledWith(
      'change',
      media.addEventListener.mock.calls[0][1],
    );
    expect(remove).toHaveBeenCalledWith('storage', expect.any(Function));
  });
});
