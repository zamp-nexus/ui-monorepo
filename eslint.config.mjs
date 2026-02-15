import nx from '@nx/eslint-plugin';
import unusedImports from 'eslint-plugin-unused-imports';

export default [
  {
    files: ['**/*.json'],
    // Override or add rules here
    rules: {},
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
      '**/test-output',
      '**/out-tsc',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      // ============================================
      // TYPE IMPORT RULES - Consistent type-only imports
      // ============================================
      // Enforce using `import type` for type-only imports (better tree-shaking)
      // NOTE: consistent-type-exports is NOT enabled because it requires typed linting
      // (parserOptions.project), which significantly slows down ESLint.
      // For exports, follow the convention manually: `export type { X }` for types.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          disallowTypeAnnotations: true,
          fixStyle: 'separate-type-imports',
        },
      ],
      // ============================================
      // MODULE BOUNDARY RULES
      // ============================================
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            // ============================================
            // SCOPE RULES - Control library visibility
            // ============================================
            // scope:app → Can import products and foundation only
            {
              sourceTag: 'scope:app',
              onlyDependOnLibsWithTags: [
                'scope:product',
                'foundation:data-model',
                'foundation:utils',
                'foundation:trackers',
                'foundation:hooks',
                'foundation:database',
                'foundation:data-layer',
                'foundation:sync-engine',
                'foundation:bridge',
                'foundation:adapters',
                'foundation:design-system',
                'foundation:icons',
                'foundation:auth',
                'foundation:http',
                'foundation:metrics',
                'foundation:query-engine',
              ],
            },
            // scope:product → Can import features, shared, and foundation
            // NOTE: Removed self-import to prevent cross-product coupling
            {
              sourceTag: 'scope:product',
              onlyDependOnLibsWithTags: [
                'scope:feature',
                'scope:shared',
                'foundation:data-model',
                'foundation:utils',
                'foundation:trackers',
                'foundation:hooks',
                'foundation:database',
                'foundation:data-layer',
                'foundation:sync-engine',
                'foundation:bridge',
                'foundation:adapters',
                'foundation:design-system',
                'foundation:icons',
                'foundation:auth',
                'foundation:http',
                'foundation:metrics',
                'foundation:query-engine',
              ],
            },
            // scope:feature → Can import shared and foundation only
            {
              sourceTag: 'scope:feature',
              onlyDependOnLibsWithTags: [
                'scope:shared',
                'foundation:data-model',
                'foundation:utils',
                'foundation:trackers',
                'foundation:hooks',
                'foundation:database',
                'foundation:data-layer',
                'foundation:sync-engine',
                'foundation:bridge',
                'foundation:adapters',
                'foundation:design-system',
                'foundation:icons',
                'foundation:auth',
                'foundation:http',
                'foundation:metrics',
                'foundation:query-engine',
              ],
            },
            // scope:shared → Can import other shared libraries and foundation
            {
              sourceTag: 'scope:shared',
              onlyDependOnLibsWithTags: [
                'scope:shared',
                'foundation:data-model',
                'foundation:utils',
                'foundation:trackers',
                'foundation:hooks',
                'foundation:database',
                'foundation:data-layer',
                'foundation:sync-engine',
                'foundation:bridge',
                'foundation:adapters',
                'foundation:design-system',
                'foundation:icons',
                'foundation:auth',
                'foundation:http',
                'foundation:metrics',
                'foundation:query-engine',
              ],
            },
            // ============================================
            // FOUNDATION RULES - Base layer isolation
            // ============================================
            // foundation:data-model → Can only import itself
            {
              sourceTag: 'foundation:data-model',
              onlyDependOnLibsWithTags: ['foundation:data-model'],
            },
            // foundation:utils → Can import utils and data-model
            {
              sourceTag: 'foundation:utils',
              onlyDependOnLibsWithTags: ['foundation:utils', 'foundation:data-model'],
            },
            // foundation:trackers → Can import itself and data-model (for typed events)
            // FIX: Added data-model so tracking events can be properly typed
            {
              sourceTag: 'foundation:trackers',
              onlyDependOnLibsWithTags: ['foundation:trackers', 'foundation:data-model'],
            },
            // foundation:adapters → Can import adapters, utils, data-model, and trackers
            // FIX: Added trackers for API logging/monitoring
            {
              sourceTag: 'foundation:adapters',
              onlyDependOnLibsWithTags: [
                'foundation:adapters',
                'foundation:utils',
                'foundation:data-model',
                'foundation:trackers',
              ],
            },
            // foundation:database → Can import data-model, utils, trackers
            {
              sourceTag: 'foundation:database',
              onlyDependOnLibsWithTags: [
                'foundation:data-model',
                'foundation:utils',
                'foundation:trackers',
                'foundation:database',
              ],
            },
            // foundation:sync-engine → Can import database, data-model, utils, trackers
            {
              sourceTag: 'foundation:sync-engine',
              onlyDependOnLibsWithTags: [
                'foundation:sync-engine',
                'foundation:database',
                'foundation:data-model',
                'foundation:utils',
                'foundation:trackers',
              ],
            },
            // foundation:bridge → Can import sync-engine, database, data-model, utils, trackers
            {
              sourceTag: 'foundation:bridge',
              onlyDependOnLibsWithTags: [
                'foundation:bridge',
                'foundation:sync-engine',
                'foundation:database',
                'foundation:data-model',
                'foundation:utils',
                'foundation:trackers',
              ],
            },
            // foundation:data-layer → Can import data-layer, sync-engine, bridge, database, utils, data-model, and trackers
            // FIX: Added sync-engine and bridge for offline-first architecture
            {
              sourceTag: 'foundation:data-layer',
              onlyDependOnLibsWithTags: [
                'foundation:data-layer',
                'foundation:sync-engine',
                'foundation:bridge',
                'foundation:database',
                'foundation:utils',
                'foundation:data-model',
                'foundation:trackers',
                'foundation:hooks',
              ],
            },
            // foundation:design-system → Can import components, utils, data-model, and trackers
            {
              sourceTag: 'foundation:design-system',
              onlyDependOnLibsWithTags: [
                'foundation:design-system',
                'foundation:utils',
                'foundation:data-model',
                'foundation:trackers',
                'foundation:icons',
              ],
            },
            // foundation:hooks → Can import hooks, utils, data-model, and trackers
            {
              sourceTag: 'foundation:hooks',
              onlyDependOnLibsWithTags: [
                'foundation:hooks',
                'foundation:utils',
                'foundation:data-model',
                'foundation:trackers',
              ],
            },
            // foundation:icons → Can import icons, utils, data-model, and trackers
            {
              sourceTag: 'foundation:icons',
              onlyDependOnLibsWithTags: [
                'foundation:icons',
                'foundation:utils',
                'foundation:data-model',
                'foundation:trackers',
              ],
            },
            // foundation:auth → Can import auth, utils, and data-model
            {
              sourceTag: 'foundation:auth',
              onlyDependOnLibsWithTags: [
                'foundation:auth',
                'foundation:utils',
                'foundation:data-model',
              ],
            },
            // foundation:http → Can import http, utils, and data-model
            {
              sourceTag: 'foundation:http',
              onlyDependOnLibsWithTags: [
                'foundation:http',
                'foundation:utils',
                'foundation:data-model',
              ],
            },
            // foundation:query-engine → Can import query-engine, data-layer, bridge, data-model, and utils
            //
            // ARCHITECTURE NOTE (C-2): The data-layer import is intentional and restricted.
            // The core engine (engine/, compiler/, schema/, builder/) is Tier 2 with zero
            // data-layer dependency. Only the hooks/ directory (Tier 4) imports from
            // data-layer — it is a thin "bridge module" composing data-layer execution
            // hooks with query-engine routing logic. This is enforced by the
            // no-restricted-imports rule below targeting non-hooks files.
            {
              sourceTag: 'foundation:query-engine',
              onlyDependOnLibsWithTags: [
                'foundation:query-engine',
                'foundation:data-layer',
                'foundation:bridge',
                'foundation:data-model',
                'foundation:utils',
              ],
            },
            // foundation:metrics → Can import metrics, utils, data-model, trackers, and http
            {
              sourceTag: 'foundation:metrics',
              onlyDependOnLibsWithTags: [
                'foundation:metrics',
                'foundation:utils',
                'foundation:data-model',
                'foundation:trackers',
                'foundation:http',
              ],
            },
            // foundation:mocks → Can import all foundation libraries
            {
              sourceTag: 'foundation:mocks',
              onlyDependOnLibsWithTags: [
                'foundation:data-model',
                'foundation:utils',
                'foundation:trackers',
                'foundation:hooks',
                'foundation:database',
                'foundation:data-layer',
                'foundation:sync-engine',
                'foundation:bridge',
                'foundation:adapters',
                'foundation:design-system',
                'foundation:icons',
                'foundation:auth',
                'foundation:http',
                'foundation:metrics',
                'foundation:query-engine',
                'foundation:mocks',
              ],
            },
            // ============================================
            // TYPE RULES - Library layer hierarchy
            // ============================================
            // type:data-model → Can import type and foundation data-model
            {
              sourceTag: 'type:data-model',
              onlyDependOnLibsWithTags: ['type:data-model', 'foundation:data-model'],
            },
            // type:utils → Can import type and foundation: utils, data-model, trackers
            // FIX: Removed type:mocks - mocks should not be in production code
            {
              sourceTag: 'type:utils',
              onlyDependOnLibsWithTags: [
                'type:utils',
                'type:data-model',
                'type:trackers',
                'foundation:utils',
                'foundation:data-model',
                'foundation:trackers',
              ],
            },
            // type:trackers → Can import itself, data-model, and foundation equivalents
            // FIX: Added data-model access for typed tracking events
            {
              sourceTag: 'type:trackers',
              onlyDependOnLibsWithTags: [
                'type:trackers',
                'type:data-model',
                'foundation:trackers',
                'foundation:data-model',
              ],
            },
            // type:adapters → Can import type and foundation: adapters, utils, data-model, trackers
            // FIX: Added trackers for API logging; Removed type:mocks
            {
              sourceTag: 'type:adapters',
              onlyDependOnLibsWithTags: [
                'type:adapters',
                'type:utils',
                'type:data-model',
                'type:trackers',
                'foundation:adapters',
                'foundation:utils',
                'foundation:data-model',
                'foundation:trackers',
              ],
            },
            // type:data-layer → Can import type and foundation: data-layer, sync-engine, bridge, database, utils, data-model, trackers
            // FIX: Added sync-engine and bridge for offline-first architecture
            {
              sourceTag: 'type:data-layer',
              onlyDependOnLibsWithTags: [
                'type:data-layer',
                'type:sync-engine',
                'type:bridge',
                'type:utils',
                'type:data-model',
                'type:trackers',
                'foundation:data-layer',
                'foundation:sync-engine',
                'foundation:bridge',
                'foundation:database',
                'foundation:utils',
                'foundation:data-model',
                'foundation:trackers',
              ],
            },
            // type:components → Can import type and foundation: components, data-layer, utils, data-model, trackers, hooks
            // FIX: Removed type:mocks
            {
              sourceTag: 'type:components',
              onlyDependOnLibsWithTags: [
                'type:components',
                'type:data-layer',
                'type:hooks',
                'type:utils',
                'type:data-model',
                'type:trackers',
                'foundation:design-system',
                'foundation:data-layer',
                'foundation:hooks',
                'foundation:utils',
                'foundation:data-model',
                'foundation:trackers',
              ],
            },
            // type:hooks → Can import type and foundation: hooks, utils, data-model, trackers
            {
              sourceTag: 'type:hooks',
              onlyDependOnLibsWithTags: [
                'type:hooks',
                'type:utils',
                'type:data-model',
                'type:trackers',
                'foundation:hooks',
                'foundation:utils',
                'foundation:data-model',
                'foundation:trackers',
              ],
            },
            // type:core → Full orchestration access
            // FIX: Added type:adapters for consistency with foundation:adapters access
            // FIX: Removed type:mocks
            {
              sourceTag: 'type:core',
              onlyDependOnLibsWithTags: [
                'type:core',
                'type:components',
                'type:data-layer',
                'type:hooks',
                'type:adapters',
                'type:utils',
                'type:data-model',
                'type:trackers',
                'foundation:data-layer',
                'foundation:database',
                'foundation:hooks',
                'foundation:adapters',
                'foundation:utils',
                'foundation:data-model',
                'foundation:trackers',
              ],
            },
            // type:mocks → Can ONLY import type:data-model and all foundation libraries
            // This restriction ensures mocks stay purely data-driven with no logic dependencies
            {
              sourceTag: 'type:mocks',
              onlyDependOnLibsWithTags: [
                'type:data-model',
                'type:mocks',
                'foundation:data-model',
                'foundation:utils',
                'foundation:trackers',
                'foundation:hooks',
                'foundation:database',
                'foundation:data-layer',
                'foundation:adapters',
                'foundation:design-system',
                'foundation:mocks',
              ],
            },
          ],
        },
      ],
    },
  },
  // ============================================
  // TEST FILE RULES - Allow mock imports in tests and configure test environment
  // ============================================
  {
    files: [
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/test/**/*.ts',
      '**/test/**/*.tsx',
      '**/__tests__/**/*.ts',
      '**/__tests__/**/*.tsx',
      '**/testing/**/*.ts',
      '**/testing/**/*.tsx',
    ],
    rules: {
      // Disable no-undef for test files - TypeScript handles this via tsconfig.spec.json
      // which includes vitest/globals types and dom lib types
      'no-undef': 'off',
      // For test files, we relax TypeScript strict rules that conflict with test patterns
      // TypeScript compiler still performs full type checking via tsconfig.spec.json
      // These rules are disabled to avoid false positives with:
      // - DOM APIs in jsdom environment (@vitest-environment jsdom)
      // - Testing library patterns (container.querySelector, etc.)
      // - Mock functions and test utilities
      // Note: TypeScript type checking still catches real type errors at compile time
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: false,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            // In test files, allow importing mocks from any library
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: [
                // All scope tags
                'scope:app',
                'scope:product',
                'scope:feature',
                'scope:shared',
                // All foundation tags
                'foundation:data-model',
                'foundation:utils',
                'foundation:trackers',
                'foundation:hooks',
                'foundation:database',
                'foundation:data-layer',
                'foundation:sync-engine',
                'foundation:bridge',
                'foundation:adapters',
                'foundation:design-system',
                'foundation:icons',
                'foundation:auth',
                'foundation:http',
                'foundation:metrics',
                'foundation:query-engine',
                'foundation:mocks',
                // All type tags
                'type:data-model',
                'type:utils',
                'type:trackers',
                'type:hooks',
                'type:adapters',
                'type:data-layer',
                'type:sync-engine',
                'type:bridge',
                'type:components',
                'type:core',
                'type:mocks',
              ],
            },
          ],
        },
      ],
    },
  },
  // ============================================
  // QUERY-ENGINE BOUNDARY: Restrict data-layer imports to hooks/ only (C-2)
  // The core engine modules must remain Tier 2 (no data-layer dependency).
  // Only the hooks/ directory may import from data-layer as a "bridge module".
  // ============================================
  {
    files: [
      'libs/foundation/query-engine/src/**/*.ts',
      'libs/foundation/query-engine/src/**/*.tsx',
    ],
    ignores: [
      'libs/foundation/query-engine/src/hooks/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@open-insights-web/foundation-data-layer',
              message:
                'data-layer imports are restricted to query-engine/src/hooks/ only. ' +
                'Core engine modules (engine/, compiler/, schema/, builder/) must remain ' +
                'Tier 2 with zero data-layer dependency. See architecture review C-2.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      'no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
    },
  },
];
