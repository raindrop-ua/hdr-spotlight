# HDR Spotlight

![HDR Spotlight — make your images shine in HDR](public/og-image.png)

A local HDR image workbench built with Angular 22 and Tailwind CSS 4. Upload, drop or paste PNG, JPEG, WebP or SVG artwork, adjust exposure and export a PQ-encoded BT.2020 image. No files are uploaded to a server.

Website: [hdrspotlight.com](https://hdrspotlight.com/)

## Development

```sh
pnpm install --frozen-lockfile
pnpm start
```

Open http://localhost:4200. Validation:

```sh
pnpm build
pnpm test --watch=false
```

## Docker

Build and run the production SSR image locally:

```sh
docker build -t hdr-spotlight .
docker run --rm -p 4200:4200 hdr-spotlight
```

The application listens on port `4200` inside the container and is available at http://localhost:4200 with this mapping. In Dokploy, set the domain's **Container Port** to `4200` so Traefik can route internal traffic to the application. Publishing host port `4100` under **Advanced → Ports** is optional and only needed for direct access outside Traefik.

## Structure

```text
src/
  app/
    app.component.*               # Root application shell
    app.config*.ts                # Browser hydration and server rendering providers
    app.routes*.ts                # Browser and prerender route configuration
    core/theme/                   # Theme preference, persistence and system sync
    features/bench/
      bench.component.*           # Workspace composition and store bindings
      components/
        source-upload/            # File selection, drag/drop and clipboard lifecycle
        display-indicator/        # HDR capability detection and media-query lifecycle
        light-controls/           # Settings group composition, reset and encode actions
          exposure-controls/      # Presets, highlight boost and PQ luminance ruler
          glow-mask-controls/     # Glow mode and threshold
          output-controls/        # Background, transparency and dimensions
        image-comparison/         # Original / actual HDR file and preview backdrop
        export-results/           # Downloads and measured luminance statistics
      services/
        bench-store.service.ts    # Signals, async lifecycle, cancellation, URL ownership
        image-encoder.service.ts  # Decode, fit/composite, worker and canvas export
      engine/
        color.ts                  # sRGB / BT.2020 / ST 2084 mathematics
        encoder.ts                # Pure pixel transformation and statistics
        encoder.worker.ts         # Pixel transformation off the UI thread
        icc.ts                    # ICC v4.4 profile with CICP
        container.ts              # JPEG profile and PNG cICP embedding
      models/                     # Typed contracts, settings and defaults
    shared/ui/
      icon/                       # Shared SVG icon component
      theme-switcher/             # System, light and dark theme control
    styles/                       # Fonts and shared design-system styles
  assets/fonts/                   # Self-hosted fonts with their OFL 1.1 licenses
  index.html                      # Document metadata and pre-hydration theme bootstrap
  main*.ts                        # Browser and server application entry points
  server.ts                       # Express SSR server
  styles.css                      # Tailwind entry point and design tokens
public/
  Rec2020-PQ.icc                  # Downloadable BT.2020 PQ color profile
  favicon.*                       # Browser icons
  robots.txt                      # Crawler rules and sitemap location
  sitemap.xml                     # Public route index
LICENSE                           # MIT license for the project source code
```

Presentation components use signal inputs/outputs and OnPush. Settings groups accept narrow inputs and emit typed changes; only the workspace writes to the store. The workspace provides its own store, while the root theme service owns appearance preference and browser synchronization. Browser APIs initialize after rendering, so SSR and hydration work. The store owns and revokes image object URLs, ignores stale uploads and cancels processing on settings changes or destruction. A yielding strip-based fallback is available when workers are not supported.

## Image behavior

- Pipeline: sRGB decode → background compositing → selected highlight boost → linear BT.2020 → absolute luminance anchored at 203 nits → ST 2084 PQ with ordered dithering.
- JPEG includes an ICC v4.4 profile with CICP `9 / 16 / 0 / 1`. It uses the browser's highest-quality JPEG encoding; exact chroma subsampling is browser-dependent.
- PNG carries a `cICP` chunk. Enable **Preserve transparency** to retain the original alpha channel and transparent padding; the preview, primary download and statistics then refer to PNG. JPEG always composites the source onto the selected background before HDR encoding. With the switch off, both outputs are opaque, matching the reference bench. Transparent-image coverage is weighted by opacity; fully invisible pixels do not affect peak luminance.
- Preset sizes fit the artwork inside a square without stretching. Original dimensions preserve width and height.
- Inputs are limited to 32 MB, 16 megapixels and 16,384 pixels per side. Output presets run through 3840 × 3840.
- Input color is normalized through an sRGB canvas. This is not a wide-gamut preservation workflow or a gain-map encoder.
- HDR appearance depends on the display, browser, color management and power settings. The preview uses the actual exported file, without simulated CSS brightness. The Light/Dark preview backdrop does not change output pixels.

Unit tests cover PQ values, masks, coverage/clipping, ICC fields, JPEG metadata replacement, PNG CRCs asynchronous store races, settings propagation/reset, and browser-listener cleanup. Browser checks cover SVG upload, PNG paste, image encoding, real export metadata, original dimensions and responsive layouts.

## License

The project source code is available under the [MIT License](LICENSE). Montserrat and JetBrains Mono are distributed under the SIL Open Font License 1.1; their license texts are included alongside the font files.
