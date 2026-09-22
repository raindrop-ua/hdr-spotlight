const path = require('node:path');

const appRoot = path.resolve(__dirname, '../../src/app');
const aliases = { '@core/': 'core/', '@shared/': 'shared/', '@features/': 'features/' };

function owner(filename) {
  const [layer, feature] = path.relative(appRoot, filename).split(path.sep);
  return { layer, feature };
}

function resolveImport(filename, specifier) {
  for (const [alias, directory] of Object.entries(aliases)) {
    if (specifier.startsWith(alias)) {
      return path.resolve(appRoot, directory, specifier.slice(alias.length));
    }
  }
  return specifier.startsWith('.') ? path.resolve(path.dirname(filename), specifier) : null;
}

module.exports = {
  rules: {
    boundaries: {
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          boundary:
            '{{source}} cannot import {{target}}. Move reusable code to shared; compose features in app routes.',
        },
      },
      create(context) {
        const filename = context.filename;
        const source = owner(filename);
        function check(node) {
          if (!node || typeof node.value !== 'string') return;
          const resolved = resolveImport(filename, node.value);
          if (!resolved) return;
          const target = owner(resolved);
          const blocked =
            (source.layer === 'shared' && target.layer !== 'shared') ||
            (source.layer === 'core' && !['core', 'shared'].includes(target.layer)) ||
            (source.layer === 'features' &&
              (!['core', 'shared', 'features'].includes(target.layer) ||
                (target.layer === 'features' && source.feature !== target.feature)));
          if (blocked) {
            context.report({
              node,
              messageId: 'boundary',
              data: {
                source: source.layer === 'features' ? `features/${source.feature}` : source.layer,
                target: target.layer === 'features' ? `features/${target.feature}` : target.layer,
              },
            });
          }
        }
        return {
          ImportDeclaration: (node) => check(node.source),
          ExportNamedDeclaration: (node) => check(node.source),
          ExportAllDeclaration: (node) => check(node.source),
          ImportExpression: (node) => check(node.source),
          TSImportType: (node) => check(node.argument?.literal ?? node.argument),
        };
      },
    },
  },
};
