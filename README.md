# Spotlight

A local HDR image workbench built with Angular 22 and Tailwind CSS 4. Upload, drop or paste PNG, JPEG, WebP or SVG artwork, adjust exposure and export a PQ-encoded BT.2020 image. No files are uploaded to a server.

## Development

```sh
npm ci
npm start
```

Open http://localhost:4200. Validation:

```sh
npm run build
npm test -- --watch=false
```

## Structure

```text
src/app/
  features/bench/
    bench.component.*             # Workspace composition and browser events
    components/
      source-upload/              # File selection and drag/drop
      light-controls/             # Exposure, masks, background, output size
      image-comparison/           # Original / actual HDR file, preview backdrop
      export-results/             # Downloads and measured luminance statistics
    services/
      bench-store.service.ts      # Signals, async lifecycle, cancellation, URL ownership
      image-encoder.service.ts    # Decode, fit/composite, worker, canvas export
    engine/
      color.ts                    # sRGB / BT.2020 / ST 2084 mathematics
      encoder.ts                  # Pure pixel transformation and statistics
      encoder.worker.ts           # Pixel transformation off the UI thread
      icc.ts                      # ICC v4.4 profile with CICP
      container.ts                # JPEG profile and PNG cICP embedding
    models/                       # Typed contracts, settings and defaults
  shared/ui/icon/                 # Shared SVG icon component
```

Presentation components use signal inputs/outputs and OnPush. The workspace provides its own store; browser APIs initialize after rendering, so SSR and hydration work. The store owns and revokes image object URLs, ignores stale uploads and cancels processing on settings changes or destruction. A yielding strip-based fallback is available when workers are not supported.

## Image behavior

- Colour mathematics and binary profile/container code are ported from the supplied superGLOW scripts: https://superglow.stacktreelabs.com/. The original imperative `main.js` UI is replaced with Angular components and services.
- Pipeline: sRGB decode → background compositing → selected highlight boost → linear BT.2020 → absolute luminance anchored at 203 nits → ST 2084 PQ with ordered dithering.
- JPEG includes an ICC v4.4 profile with CICP `9 / 16 / 0 / 1`. It uses the browser's highest-quality JPEG encoding; exact chroma subsampling is browser-dependent.
- PNG carries a `cICP` chunk. Enable **Preserve transparency** to retain the original alpha channel and transparent padding; the preview, primary download and statistics then refer to PNG. JPEG always composites the source onto the selected background before HDR encoding. With the switch off, both outputs are opaque, matching the reference bench. Transparent-image coverage is weighted by opacity; fully invisible pixels do not affect peak luminance.
- Preset sizes fit the artwork inside a square without stretching. Original dimensions preserve width and height.
- Inputs are limited to 32 MB, 16 megapixels and 16,384 pixels per side. Output presets run through 3840 × 3840.
- Input colour is normalized through an sRGB canvas. This is not a wide-gamut preservation workflow or a gain-map encoder.
- HDR appearance depends on the display, browser, colour management and power settings. The preview uses the actual exported file, without simulated CSS brightness. The Light/Dark preview backdrop does not change output pixels.

Unit tests cover PQ values, masks, coverage/clipping, ICC fields, JPEG metadata replacement, PNG CRCs and asynchronous store races. Browser checks cover SVG upload, PNG paste, image encoding, real export metadata, original dimensions and responsive layouts.
