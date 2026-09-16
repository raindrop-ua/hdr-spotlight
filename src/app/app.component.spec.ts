import { TestBed } from '@angular/core/testing';
import { App } from './app.component';
import { provideRouter, Router } from '@angular/router';
import { routes } from './app.routes';

describe('HDR workspace', () => {
  it('renders the bench with encoding disabled before a source is selected', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('#bench')).toBeTruthy();
    expect(element.querySelector('h1')?.textContent).toContain('Spotlight');
    expect((element.querySelector('.primary-button') as HTMLButtonElement).disabled).toBe(true);
    expect(element.querySelectorAll('.preview-tile').length).toBe(2);
  });
});
