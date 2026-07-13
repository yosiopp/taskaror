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

  it('[編集]メニューにショートカットキーが表示される', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('menuitem', { name: '編集' }))
    // 元に戻す / タスク追加 / タスク削除 のショートカット表示
    expect(screen.getByText('Ctrl+Z')).toBeInTheDocument()
    expect(screen.getByText('Insert')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('Insert キーでタスクを追加し、Delete キーで削除できる', async () => {
    const user = userEvent.setup()
    render(<App />)

    // 初期状態に「新しいタスク」は無い
    expect(screen.queryByText('新しいタスク')).not.toBeInTheDocument()

    // Insert で追加(未選択ならルート末尾に追加され、その行が選択される)
    await user.keyboard('{Insert}')
    expect(screen.getByText('新しいタスク')).toBeInTheDocument()

    // 追加された行が選択中なので Delete で削除できる
    await user.keyboard('{Delete}')
    expect(screen.queryByText('新しいタスク')).not.toBeInTheDocument()
  })

  it('[編集]メニューの「タスク追加」クリックでも追加できる', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('menuitem', { name: '編集' }))
    await user.click(screen.getByRole('menuitem', { name: /タスク追加/ }))

    expect(screen.getByText('新しいタスク')).toBeInTheDocument()
  })
})
