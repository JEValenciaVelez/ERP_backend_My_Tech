// @ts-check

import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import pluginPrettier from 'eslint-plugin-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

export default defineConfig([
  {
    ignores: ['**/*.js', '**/*.jsx', 'node_modules', 'migrations'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    plugins: { prettier: pluginPrettier, 'simple-import-sort': simpleImportSort },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // '@typescript-eslint/no-explicit-any': 'error',
      'no-undef': 'off',
      'prefer-const': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      'prettier/prettier': 'error',
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      'no-var': 'error',
      'no-shadow': 'error',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error',
      // security
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-new-wrappers': 'error',
      'no-useless-catch': 'error',
      'callback-return': 'error',
      '@typescript-eslint/naming-convention': [
        'error',
        // clases y tipos en PascalCase
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          selector: 'class',
          format: ['PascalCase'],
        },
        {
          selector: 'interface',
          format: ['PascalCase'],
          prefix: ['I'],
        },
        {
          selector: 'method',
          modifiers: ['private'],
          leadingUnderscore: 'require',
          format: ['camelCase'],
        },
      ],
    },
    languageOptions: {
      globals: {
        process: 'readonly',
      },
    },
  },
]);
