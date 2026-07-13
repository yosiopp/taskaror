import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  globalIgnores(['**/dist']),
  // 全パッケージ共通: 素の TS 推奨設定(packages/core はブラウザ非依存のためここまで)
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
    },
  },
  // packages/cli のみ: Node.js 上で動く CLI のため Node グローバルを許可
  {
    files: ['packages/cli/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  // packages/web のみ: React 系プラグイン+ブラウザグローバル
  {
    files: ['packages/web/**/*.{ts,tsx}'],
    extends: [
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  prettier,
])
