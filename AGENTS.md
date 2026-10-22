# Project instructions

Read [docs/architecture.md](docs/architecture.md) before changing application code.
Follow its ownership and dependency rules.

## Angular component files

- Always create new components as three neighboring files with the same base name:
  `example.component.ts`, `example.component.html` and `example.component.css`.
- Keep component logic and metadata in TypeScript, templates in HTML and component
  styles in CSS. Reference the external files with `templateUrl` and `styleUrl`.
- Never put inline `template` or `styles` in a component's TypeScript file, even for
  small components. Keep the CSS file even when it is initially empty.
- Follow the same structure when extracting or substantially rewriting a component.
