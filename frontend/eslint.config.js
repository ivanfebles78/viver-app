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
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      /*
       * `varsIgnorePattern` es el rodeo que ya usaba este proyecto para que los
       * componentes importados no se marquen como no usados: no está instalado
       * `eslint-plugin-react`, así que `no-unused-vars` no sabe que un
       * identificador dentro de JSX cuenta como uso.
       *
       * `argsIgnorePattern` extiende el mismo rodeo a los PARÁMETROS, que la
       * regla trata aparte. Sin él, un componente recibido como prop —
       * `function SectionHeader({ as: Tag })` y luego `<Tag/>` — se marca como
       * no usado aunque se renderice.
       */
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    // Las pruebas corren en Node bajo vitest: necesitan sus globales (process,
    // console) además de las del navegador que aporta jsdom. `react-refresh`
    // no aplica a un fichero que no se sirve al navegador.
    files: ['**/*.{test,spec}.{js,jsx}', 'src/test/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
