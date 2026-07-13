/**
 * App の UI テスト(React Testing Library + jsdom)。
 * 実 DOM にマウントしてユーザー操作を再現し、操作に対する表示の反応を検証する。
 * 描画パイプラインの最小確認(SSR)は App.smoke.test.tsx が担当し、
 * こちらは「操作 → 画面の変化」という UI の振る舞いを対象にする。
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App の UI', () => {
  it('サンプルのプロジェクト名が入力欄に表示される', () => {
    render(<App />)
    // examples/ecommerce.taskspec.yaml の info.title
    expect(screen.getByRole('textbox', { name: 'プロジェクト名' })).toHaveValue(
      'ECサイト構築',
    )
  })

  it('ガント編集ビューではタスク操作ツールバーが表示される', () => {
    render(<App />)
    expect(
      screen.getByRole('toolbar', { name: 'タスク操作' }),
    ).toBeInTheDocument()
    // 未選択でも「タスク追加」は押せる(選択が要るボタンだけ無効化される)
    expect(screen.getByRole('button', { name: 'タスク追加' })).toBeEnabled()
  })

  it('[表示]メニューから YAML に切り替えるとタスク操作ツールバーが消える', async () => {
    const user = userEvent.setup()
    render(<App />)

    // 初期(ガント編集ビュー)ではタスク操作ツールバーがある
    expect(
      screen.getByRole('toolbar', { name: 'タスク操作' }),
    ).toBeInTheDocument()

    // [表示] メニューを開いて YAML を選ぶ
    await user.click(screen.getByRole('menuitem', { name: '表示' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'YAML' }))

    // YAML ビューではタスク操作ツールバーは描画されない
    expect(
      screen.queryByRole('toolbar', { name: 'タスク操作' }),
    ).not.toBeInTheDocument()
  })
})
