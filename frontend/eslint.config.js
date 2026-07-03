import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // The v7 "recommended" preset enables experimental compiler-era checks
      // (purity, set-state-in-effect, refs...) that flag long-standing patterns
      // across the big page components. Keep the classic, high-signal rules
      // hard-on; revisit the experimental ones during the pages refactor.
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/static-components': 'off',
      'react-refresh/only-export-components': 'warn',
      // Intentional empty catch blocks are idiomatic here (best-effort saves)
      'no-empty': ['error', { allowEmptyCatch: true }],
      // `const { volatile, ...rest } = obj` is how we exclude fields — the
      // extracted names are intentionally unused.
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
])
