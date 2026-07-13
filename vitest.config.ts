import { defineConfig } from 'vitest/config'

// モノレポ全体のテスト設定。各パッケージの設定
// (packages/core/vitest.config.ts・packages/web/vite.config.ts)をプロジェクトとして束ね、
// ルートの `npm run test` で全パッケージのテストを一括実行する。
export default defineConfig({
  test: {
    projects: ['packages/*'],
  },
})
