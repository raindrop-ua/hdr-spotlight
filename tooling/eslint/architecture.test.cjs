const path = require('node:path');
const { RuleTester } = require('eslint');
const parser = require('typescript-eslint').parser;
const rule = require('./architecture.cjs').rules.boundaries;
const filename = (relative) => path.resolve(__dirname, '../../src/app', relative);
const test = (file, code) => ({ filename: filename(file), code });
const invalid = (file, code) => ({ ...test(file, code), errors: [{ messageId: 'boundary' }] });

new RuleTester({ languageOptions: { parser } }).run('architecture/boundaries', rule, {
  valid: [
    test('app.routes.ts', "import { Bench } from '@features/hdr/pages/bench/bench.component';"),
    test('shared/images/utils/geometry.ts', "import { Image } from '../models/image';"),
    test('shared/ui/icon.ts', "import { Component } from '@angular/core';"),
    test('core/theme/theme.ts', "import { Icon } from '@shared/ui/icon';"),
    test('features/hdr/state/store.ts', "import { Engine } from '../engine/encoder';"),
    test('features/converter/pages/page.ts', "import { Theme } from '@core/theme/theme';"),
    test('features/converter/services/encode.ts', "const codec = import('@jsquash/webp/encode');"),
  ],
  invalid: [
    invalid('shared/ui/upload.ts', "import { Bench } from '@features/hdr/pages/bench';"),
    invalid('shared/ui/upload.ts', "import { Theme } from '../../core/theme/theme';"),
    invalid('shared/ui/upload.ts', "export * from '../../app.routes';"),
    invalid('core/theme/theme.ts', "import { Bench } from '@features/hdr/pages/bench';"),
    invalid(
      'features/converter/services/convert.ts',
      "import { Engine } from '@features/hdr/engine/encoder';",
    ),
    invalid(
      'features/converter/services/convert.ts',
      "import { Engine } from '../../hdr/engine/encoder';",
    ),
    invalid(
      'features/converter/services/convert.ts',
      "export { Engine } from '../../hdr/engine/encoder';",
    ),
    invalid(
      'features/converter/services/convert.ts',
      "const engine = import('../../hdr/engine/encoder');",
    ),
    invalid(
      'features/converter/models/format.ts',
      "type Settings = import('../../hdr/models/bench.models').EncodeSettings;",
    ),
  ],
});
