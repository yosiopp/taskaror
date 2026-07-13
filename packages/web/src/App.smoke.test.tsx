/**
 * App のスモークテスト。
 * parse → schedule → flatten → layout → SVG の描画パイプラインを Node 上で
 * 実レンダリングし、初期レンダーでクラッシュしないこと・サンプルの内容が
 * 描画されることを確認する(ブラウザなしで実行時エラーを捕捉するための最小確認)。
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App スモーク', () => {
  const html = renderToStaticMarkup(<App />)

  it('例外なくレンダリングできる', () => {
    expect(html.length).toBeGreaterThan(0)
  })

  it('プロジェクトタイトルが描画される', () => {
    // examples/ecommerce.taskspec.yaml の info.title
    expect(html).toContain('ECサイト構築')
  })

  it('タスク名がグリッドに描画される', () => {
    expect(html).toContain('API設計')
    expect(html).toContain('設計')
    expect(html).toContain('実装')
  })

  it('ガントチャートの SVG が描画される', () => {
    expect(html).toContain('<svg')
  })

  it('ヘッダにメニューバー(ファイル/編集/表示)が描画される', () => {
    expect(html).toContain('ファイル')
    expect(html).toContain('編集')
    expect(html).toContain('表示')
  })

  it('2 行目ツールバーのタスク操作ボタンが描画される', () => {
    // アイコンボタンは aria-label で機能名を持つ(ガント編集ビュー時)
    expect(html).toContain('タスク追加')
    expect(html).toContain('タスク削除')
    expect(html).toContain('インデント')
  })

  it('スケジュール計算エラーは表示されない(サンプルは正常)', () => {
    expect(html).not.toContain('スケジュールを計算できませんでした')
  })
})
