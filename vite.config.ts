/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // React コンポーネントの UI テスト(DOM 操作)を行うため jsdom を既定にする。
    // 純粋ロジックの lib テストも jsdom 上で問題なく動く。
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
