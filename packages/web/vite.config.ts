/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// [ヘルプ] の [taskaror について] で表示するバージョンには web パッケージ
// (packages/web/package.json)の version を使い、ビルド時に __APP_VERSION__ へ
// 埋め込む(src/env.d.ts で型宣言)。CLI の --version は packages/cli の version を
// 使うため、リリース時は root / web / cli の version を揃えて上げる(CLAUDE.md 参照)。
const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages の /app/ 配下でも CLI(taskaror serve)のルート配信でも動くよう、
  // アセット参照を相対パスにする
  base: './',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    // React コンポーネントの UI テスト(DOM 操作)を行うため jsdom を既定にする。
    // 純粋ロジックの lib テストも jsdom 上で問題なく動く。
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
