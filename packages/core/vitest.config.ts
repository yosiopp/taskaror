import { defineConfig } from 'vitest/config'

// コアパッケージのテスト設定。lib 群はブラウザ非依存の純粋ロジックのため Node 環境で実行する。
export default defineConfig({
  test: {
    environment: 'node',
  },
})
