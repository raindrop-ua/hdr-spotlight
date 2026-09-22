import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppUpdateService } from '@core/pwa/app-update.service';
import { UpdateBanner } from './update-banner.component';

describe('Update banner', () => {
  it('explains loss of in-memory work and lets the user defer or explicitly reload', async () => {
    const visible = signal(false);
    const recoveryRequired = signal(false);
    const reload = vi.fn();
    const dismiss = vi.fn(() => visible.set(false));
    TestBed.configureTestingModule({
      providers: [
        { provide: AppUpdateService, useValue: { visible, recoveryRequired, reload, dismiss } },
      ],
    });
    const fixture = TestBed.createComponent(UpdateBanner);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('section')).toBeNull();
    visible.set(true);
    await fixture.whenStable();
    expect(element.textContent).toContain('A new version of Spotlight is ready');
    expect(element.textContent).toContain('Reloading clears your current image and settings.');
    expect(element.querySelector('[aria-live="polite"]')).not.toBeNull();
    const buttons = element.querySelectorAll('button');
    buttons[1].click();
    await fixture.whenStable();
    expect(dismiss).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
    expect(element.querySelector('section')).toBeNull();
    visible.set(true);
    recoveryRequired.set(true);
    await fixture.whenStable();
    expect(element.textContent).toContain('Please reload Spotlight');
    element.querySelector('button')!.click();
    expect(reload).toHaveBeenCalledOnce();
  });
});
