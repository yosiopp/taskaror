/**
 * Vitest のテスト共通セットアップ(全テストファイルで実行)。
 * - jest-dom のカスタムマッチャ(toBeInTheDocument / toHaveValue など)を登録する
 * - 各テスト後に React Testing Library がマウントした DOM を破棄する
 *   (vitest の globals を無効にしているため自動 cleanup は登録されない)
 * - localStorage を初期化してテスト間の状態リークを防ぐ
 * - jsdom に無い ResizeObserver を最小スタブで補う(App の仮想化 effect が使う)
 */
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

// jsdom は ResizeObserver を実装しないため、何もしないスタブを注入する
// (要素サイズの実測に依存するテストは書かない前提)。
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??=
  ResizeObserverStub as unknown as typeof ResizeObserver
