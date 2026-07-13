/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// [ヘルプ] の [taskaror について] で表示するバージョンは package.json の version を
// 単一のソースとし、ビルド時に __APP_VERSION__ へ埋め込む(src/env.d.ts で型宣言)。
const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string }

// https://vite.dev/config/
export default defineConfig({
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
