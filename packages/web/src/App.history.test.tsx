/**
 * App の UI テスト: undo / redo(履歴)。
 * キーボードショートカット(Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y)と
 * [編集]メニューの 元に戻す / やり直し、入力欄フォーカス中のガード、
 * タイトル連続入力のまとめ(coalesce)を検証する。
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App の undo / redo', () => {
  it('Ctrl+Z で直前の編集を取り消し、Ctrl+Shift+Z でやり直せる', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.keyboard('{Insert}')
    expect(screen.getByText('新しいタスク')).toBeInTheDocument()

    await user.keyboard('{Control>}z{/Control}')
    expect(screen.queryByText('新しいタスク')).not.toBeInTheDocument()

    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
    expect(screen.getByText('新しいタスク')).toBeInTheDocument()
  })

  it('Ctrl+Y でもやり直せる', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.keyboard('{Insert}')
    await user.keyboard('{Control>}z{/Control}')
    expect(screen.queryByText('新しいタスク')).not.toBeInTheDocument()

    await user.keyboard('{Control>}y{/Control}')
    expect(screen.getByText('新しいタスク')).toBeInTheDocument()
  })

  it('[編集]メニューの 元に戻す / やり直し は履歴に追従して動く', async () => {
    const user = userEvent.setup()
    render(<App />)

    // 初期状態は履歴が無いのでどちらも無効
    await user.click(screen.getByRole('menuitem', { name: '編集' }))
    expect(screen.getByRole('menuitem', { name: /元に戻す/ })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: /やり直し/ })).toBeDisabled()
    await user.keyboard('{Escape}')

    // タスクを追加すると 元に戻す が有効になり、クリックで取り消せる
    await user.keyboard('{Insert}')
    await user.click(screen.getByRole('menuitem', { name: '編集' }))
    expect(screen.getByRole('menuitem', { name: /元に戻す/ })).toBeEnabled()
    await user.click(screen.getByRole('menuitem', { name: /元に戻す/ }))
    expect(screen.queryByText('新しいタスク')).not.toBeInTheDocument()

    // 取り消し後は やり直し が有効になり、クリックで復元できる
    await user.click(screen.getByRole('menuitem', { name: '編集' }))
    expect(screen.getByRole('menuitem', { name: /やり直し/ })).toBeEnabled()
    await user.click(screen.getByRole('menuitem', { name: /やり直し/ }))
    expect(screen.getByText('新しいタスク')).toBeInTheDocument()
  })

  it('入力欄にフォーカスがある間は Ctrl+Z がアプリの undo にならない', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.keyboard('{Insert}')
    expect(screen.getByText('新しいタスク')).toBeInTheDocument()

    // プロジェクト名の入力欄にフォーカスした状態ではブラウザ既定の undo を優先する
    await user.click(screen.getByRole('textbox', { name: 'プロジェクト名' }))
    await user.keyboard('{Control>}z{/Control}')
    expect(screen.getByText('新しいタスク')).toBeInTheDocument()
  })

  it('タイトルの連続入力は 1 回の undo でまとめて戻る', async () => {
    const user = userEvent.setup()
    render(<App />)

    const titleInput = screen.getByRole('textbox', { name: 'プロジェクト名' })
    await user.type(titleInput, 'AB')
    expect(titleInput).toHaveValue('ECサイト構築AB')

    // 入力欄の外(グリッド本体)へフォーカスを移してから undo する
    const body = document.querySelector('.grid-body') as HTMLElement
    body.focus()
    await user.keyboard('{Control>}z{/Control}')

    // キーストローク 2 回分(A と B)が 1 履歴にまとまって戻る
    expect(titleInput).toHaveValue('ECサイト構築')
  })
})
