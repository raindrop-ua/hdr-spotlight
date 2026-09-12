import { Component, input } from '@angular/core';

const PATHS = {
  logo1:
    'M12.35 2.16A9.84 9.84 0 0 1 20.34 6.77Q17.86 8.7 15.4 12.12A3.4 3.4 0 0 0 13.8 9.12Q13.08 5.65 12.35 2.16ZM20.7 7.38A9.84 9.84 0 0 1 20.7 16.62Q17.79 15.42 13.59 15A3.4 3.4 0 0 0 15.4 12.12Q18.05 9.75 20.7 7.38ZM20.34 17.23A9.84 9.84 0 0 1 12.35 21.84Q11.93 18.73 10.2 14.88A3.4 3.4 0 0 0 13.59 15Q16.97 16.1 20.34 17.23ZM11.65 21.84A9.84 9.84 0 0 1 3.66 17.23Q6.14 15.3 8.6 11.88A3.4 3.4 0 0 0 10.2 14.88Q10.92 18.35 11.65 21.84ZM3.3 16.62A9.84 9.84 0 0 1 3.3 7.38Q6.21 8.58 10.41 9A3.4 3.4 0 0 0 8.6 11.88Q5.95 14.25 3.3 16.62ZM3.66 6.77A9.84 9.84 0 0 1 11.65 2.16Q12.07 5.27 13.8 9.12A3.4 3.4 0 0 0 10.41 9Q7.03 7.9 3.66 6.77Z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42',
  moon: 'M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3',
  image:
    'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm-2 14 6-6 10 10M15 7h.01',
  sparkle: 'm12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3ZM20 2v4m-2-2h4',
  reset: 'M3 10a9 9 0 1 1 2.6 8.4M3 4v6h6',
  monitor: 'M4 3h16a1 1 0 0 1 1 1v12H3V4a1 1 0 0 1 1-1ZM8 21h8m-4-5v5',
  check: 'm5 12 4 4L19 6',
  chip: 'M7 7h10v10H7V7ZM9 1v4m6-4v4M9 19v4m6-4v4M1 9h4m-4 6h4M19 9h4m-4 6h4',
  aperture:
    'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM14.3 2.3 3.7 8.4M21.7 9.7 11.1 3.6M19.4 18.3V6.1M9.7 21.7l10.6-6.1M2.3 14.3l10.6 6.1M4.6 5.7v12.2',
  info: 'M12 8h.01M12 11v6M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
} as const;

@Component({
  selector: 'app-icon',
  host: { class: 'inline-flex shrink-0', 'aria-hidden': 'true' },
  template: `<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="h-full w-full"
  >
    <path [attr.d]="paths[name()]" />
  </svg>`,
})
export class Icon {
  readonly name = input<keyof typeof PATHS>('image');
  protected readonly paths = PATHS;
}
