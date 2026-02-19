const { defineConfig, globalIgnores } = require('eslint/config')

const html = require('eslint-plugin-html')
const globals = require('globals')
const tsParser = require('@typescript-eslint/parser')
const js = require('@eslint/js')

const { FlatCompat } = require('@eslint/eslintrc')

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

module.exports = defineConfig([
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      parserOptions: {
        parser: 'babel-eslint',
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },

    plugins: {
      html,
    },

    extends: compat.extends('plugin:prettier/recommended'),

    rules: {
      'prettier/prettier': [
        'error',
        {
          endOfLine: 'auto',
        },
      ],

      indent: [
        'error',
        2,
        {
          SwitchCase: 1,
        },
      ],

      'space-infix-ops': [
        'error',
        {
          int32Hint: false,
        },
      ],

      'key-spacing': [
        2,
        {
          beforeColon: false,
          afterColon: true,
        },
      ],

      'no-octal': 2,
      'no-redeclare': 2,
      'comma-spacing': 2,
      'no-new-object': 2,
      'arrow-spacing': 2,

      quotes: [
        2,
        'single',
        {
          avoidEscape: true,
          allowTemplateLiterals: true,
        },
      ],
    },
  },
  globalIgnores(['**/public/']),
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
    },
    extends: compat.extends('plugin:@typescript-eslint/recommended'),
  },
])
