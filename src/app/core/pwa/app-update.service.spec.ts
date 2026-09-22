import { DOCUMENT } from '@angular/common';
import { ApplicationRef, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SwUpdate, UnrecoverableStateEvent, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { AppUpdateService } from './app-update.service';

const ready = (hash: string): VersionEvent => ({
  type: 'VERSION_READY',
  currentVersion: { hash: 'current' },
  latestVersion: { hash },
});

describe('Application updates', () => {
  let stable: Subject<boolean>;
  let versions: Subject<VersionEvent>;
  let unrecoverable: Subject<UnrecoverableStateEvent>;
  let check: ReturnType<typeof vi.fn>;
  let reload: ReturnType<typeof vi.fn>;
  let document: EventTarget & {
    visibilityState: string;
    defaultView: EventTarget & { navigator: { onLine: boolean } };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    stable = new Subject();
    versions = new Subject();
    unrecoverable = new Subject();
    check = vi.fn().mockResolvedValue(false);
    reload = vi.fn();
    const view = Object.assign(new EventTarget(), {
      navigator: { onLine: true },
      location: { reload },
      setInterval: globalThis.setInterval.bind(globalThis),
      clearInterval: globalThis.clearInterval.bind(globalThis),
    });
    document = Object.assign(new EventTarget(), { visibilityState: 'visible', defaultView: view });
    TestBed.configureTestingModule({
      providers: [
        AppUpdateService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: DOCUMENT, useValue: document },
        { provide: ApplicationRef, useValue: { isStable: stable } },
        {
          provide: SwUpdate,
          useValue: {
            isEnabled: true,
            versionUpdates: versions,
            unrecoverable,
            checkForUpdate: check,
          },
        },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('announces only fully downloaded versions and reloads only on explicit action', () => {
    const service = TestBed.inject(AppUpdateService);
    service.reload();
    expect(reload).not.toHaveBeenCalled();
    versions.next({ type: 'VERSION_DETECTED', version: { hash: 'new' } });
    expect(service.visible()).toBe(false);
    versions.next({
      type: 'VERSION_INSTALLATION_FAILED',
      version: { hash: 'new' },
      error: 'offline',
    });
    expect(service.visible()).toBe(false);
    versions.next(ready('new'));
    expect(service.visible()).toBe(true);
    expect(reload).not.toHaveBeenCalled();
    service.reload();
    expect(reload).toHaveBeenCalledOnce();
  });
  it('remembers Later for the same version but announces a newer one', () => {
    const service = TestBed.inject(AppUpdateService);
    versions.next(ready('one'));
    service.dismiss();
    versions.next(ready('one'));
    expect(service.visible()).toBe(false);
    versions.next(ready('two'));
    expect(service.visible()).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });
  it('offers recovery without an automatic reload', () => {
    const service = TestBed.inject(AppUpdateService);
    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'Missing old chunk' });
    expect(service.visible()).toBe(true);
    expect(service.recoveryRequired()).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });
  it('waits for stability and checks periodically without overlapping requests', async () => {
    let finish!: (value: boolean) => void;
    check.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
    );
    TestBed.inject(AppUpdateService);
    stable.next(false);
    expect(check).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    stable.next(true);
    expect(check).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect(check).toHaveBeenCalledOnce();
    finish(false);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect(check).toHaveBeenCalledTimes(2);
  });
  it('throttles tab focus checks, skips hidden/offline tabs and retries after a network error', async () => {
    check.mockRejectedValueOnce(new Error('offline'));
    TestBed.inject(AppUpdateService);
    stable.next(true);
    await Promise.resolve();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(check).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60000);
    document.visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(check).toHaveBeenCalledOnce();
    document.visibilityState = 'visible';
    document.defaultView.navigator.onLine = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(check).toHaveBeenCalledOnce();
    document.defaultView.navigator.onLine = true;
    document.defaultView.dispatchEvent(new Event('online'));
    await Promise.resolve();
    expect(check).toHaveBeenCalledTimes(2);
  });
  it('removes timers, listeners and subscriptions when destroyed', async () => {
    const service = TestBed.inject(AppUpdateService);
    stable.next(true);
    await Promise.resolve();
    TestBed.resetTestingModule();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(20 * 60 * 1000);
    document.dispatchEvent(new Event('visibilitychange'));
    document.defaultView.dispatchEvent(new Event('online'));
    versions.next(ready('late'));
    expect(check).toHaveBeenCalledOnce();
    expect(service.visible()).toBe(false);
  });
  it('does not start checks or subscribe when service workers are disabled', () => {
    TestBed.overrideProvider(SwUpdate, { useValue: { isEnabled: false } });
    const service = TestBed.inject(AppUpdateService);
    stable.next(true);
    expect(check).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(service.visible()).toBe(false);
  });
  it('does not touch browser APIs during SSR', () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    const service = TestBed.inject(AppUpdateService);
    stable.next(true);
    versions.next(ready('new'));
    expect(check).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(service.visible()).toBe(false);
  });
});
