export const FORMATS = [
  { id: 'webp', label: 'WebP', mime: 'image/webp', extension: 'webp' },
  { id: 'jpeg', label: 'JPEG', mime: 'image/jpeg', extension: 'jpg' },
  { id: 'png', label: 'PNG', mime: 'image/png', extension: 'png' },
  { id: 'ico', label: 'ICO', mime: 'image/x-icon', extension: 'ico' },
  { id: 'bmp', label: 'BMP', mime: 'image/bmp', extension: 'bmp' },
] as const;
export type Format = (typeof FORMATS)[number]['id'];
