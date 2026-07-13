import { defineConfig } from 'vitest/config'

// CLI パッケージのテスト設定。Node.js 上で動く CLI のため Node 環境で実行する。
export default defineConfig({
  test: {
    environment: 'node',
  },
})
