# Project architecture

The application is organized by product feature. Route paths are `/`, `/convert`,
`/lut`, `/privacy` and `/terms`; folder names describe ownership rather than public URLs.

```text
src/
  app/
    app.*                         # Bootstrap, root shell and route composition
    core/
      layout/site-footer/         # Site-wide shell UI
      seo/                        # Route metadata and canonical URLs
      pwa/                        # Service-worker updates and the global update banner
      theme/                      # Application theme state and its switcher
    features/
      hdr/
        pages/bench/              # Routed HDR workspace
        components/               # HDR-specific controls, previews and guide
        state/                    # Page state and asynchronous lifecycle
        services/                 # HDR loading, encoding and export orchestration
        models/                   # HDR settings, pixel and export contracts
        utils/                    # HDR output-size rules
        engine/                   # PQ/color math, ICC, containers and Web Worker
      converter/
        pages/convert/            # Routed converter workspace
        state/                    # Source/result ownership and conversion lifecycle
        services/                 # Input policy and conversion orchestration
        models/                   # Formats, settings, defaults and result contracts
        utils/                    # Converter-specific output-size selection
      lut/
        pages/lut/                # Routed SDR LUT workspace
        state/                    # Source/LUT selection, preview and export lifecycle
        services/                 # sRGB decode, preview and full-size export orchestration
        models/                   # LUT tables, image buffers and workspace contracts
        engine/                   # .cube parsing, tetrahedral interpolation and worker
      legal/pages/legal/          # Privacy and terms route view
    shared/
      ui/                         # Feature-independent icon and upload components
      images/
        models/                   # Image dimensions and decoded-source contracts
        constants/                # File, side and pixel limits
        utils/                    # Validation, aspect ratio and image placement
        codecs/                   # BMP and ICO containers
        services/                 # Lazy WebP WASM encoder
  styles/                         # Global design tokens, components and fonts
  assets/                         # Bundled fonts and licenses
public/                           # Static public assets
tooling/eslint/                  # Dependency boundary rule
```

## Dependency direction

- The root application composes routes and the global shell.
- Features may import their own code, `core` and `shared`, but never another feature.
- `core` may use `shared`, but must not depend on features.
- `shared` must not depend on `core` or features.

`pnpm lint` enforces these boundaries for alias and relative imports, re-exports,
static type imports and literal dynamic imports. External package imports remain allowed.
Use `@core/`, `@shared/` and `@features/` for cross-directory imports; relative imports
are convenient for neighboring files. Avoid umbrella barrels that hide dependencies
or pull unrelated browser codecs into a route.

## Where new code belongs

A page composes the UI and binds a page-scoped store. The store owns signals, async
request revisions, object URL cleanup and page lifetime. A feature service coordinates
browser operations and the feature's input/output policy. Models describe contracts;
utilities and engines contain pure calculations where practical.

Move code to `shared` when it has a feature-independent contract and a concrete reusable
responsibility. The uploader is used by both workspaces. Image dimensions, geometry,
limits and file codecs have no knowledge of HDR settings or conversion-page state.
The HDR algorithm, ICC profile and encoding guide remain in the HDR feature. Decoding
policies stay in feature services: HDR and conversion intentionally accept different
formats and use different decoding paths. Theme controls live in `core` because they
use application-wide theme state, while basic UI in `shared` stays independent.

The SDR LUT feature owns its `.cube` parser, presets and pixel transform. It does not
depend on the HDR or converter features. LUT values operate on encoded sRGB channels;
preview and full-resolution export share the same interpolation. Camera Log, HDR,
1D tables and combined shaper/3D LUTs are outside this feature's initial contract.

Create only the folders a feature needs. Do not add generic repositories, facades or
base services without a real responsibility. Tests stay alongside the code they verify.

## Component files

Always create new Angular components as three neighboring files with the same base
name: `example.component.ts`, `example.component.html` and `example.component.css`.
Keep logic and metadata in TypeScript, templates in HTML and component styles in CSS.
Use `templateUrl` and `styleUrl` to reference those files; never use inline `template`
or `styles` in a component's TypeScript file, even for small components. Keep the CSS
file even when it is initially empty. Apply the same structure when extracting or
substantially rewriting a component.

## Validation

Run `CI=1 pnpm check` for formatting, boundary linting, unit tests and production
build/prerender. Run `pnpm exec tsc --project tsconfig.worker.json --noEmit` when changing
worker imports or contracts. When moving pages, templates, styles or browser codecs,
verify the HDR encode flow, converter exports (including WebP fallback), route metadata,
and both themes in a browser. WASM files are copied by `angular.json` to `/assets/codecs/`
and cached on demand by `ngsw-config.json`.
