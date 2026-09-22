import { Routes } from '@angular/router';
import { Bench } from '@features/hdr/pages/bench/bench.component';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    component: Bench,
    title: 'Spotlight — HDR image studio',
    data: {
      description:
        'Create PQ-encoded BT.2020 HDR images from PNG, JPEG, WebP, or SVG artwork directly in your browser. Your files never leave your device.',
    },
  },
  {
    path: 'convert',
    loadComponent: () =>
      import('@features/converter/pages/convert/convert.component').then((m) => m.Convert),
    title: 'Image Converter — HDR Spotlight',
    data: {
      description:
        'Convert images to PNG, JPEG, WebP, BMP and ICO. Adjust quality and resize locally in your browser, without uploading your files.',
    },
  },
  {
    path: 'privacy',
    loadComponent: () =>
      import('@features/legal/pages/legal/legal-page.component').then((m) => m.LegalPage),
    title: 'Privacy Policy — HDR Spotlight',
    data: {
      document: 'privacy',
      description:
        'How HDR Spotlight handles your images, browser storage, and privacy. Local image processing, no analytics, and clear information about hosting and Cloudflare.',
    },
  },
  {
    path: 'terms',
    loadComponent: () =>
      import('@features/legal/pages/legal/legal-page.component').then((m) => m.LegalPage),
    title: 'Terms of Use — HDR Spotlight',
    data: {
      document: 'terms',
      description: 'Terms for using HDR Spotlight, the free browser-based HDR image studio.',
    },
  },
];
