/**
 * App の UI テスト(React Testing Library + jsdom)。
 * 実 DOM にマウントしてユーザー操作を再現し、操作に対する表示の反応を検証する。
 * 描画パイプラインの最小確認(SSR)は App.smoke.test.tsx が担当し、
 * こちらは「操作 → 画面の変化」という UI の振る舞いを対象にする。
 */
import { render, screen, within } from '@testing-library/react'
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
    // 移動・インデント操作もショートカット併記でメニューに出る
    expect(screen.getByText('Ctrl+↑')).toBeInTheDocument()
    expect(screen.getByText('Ctrl+↓')).toBeInTheDocument()
    expect(screen.getByText('Ctrl+→')).toBeInTheDocument()
    expect(screen.getByText('Ctrl+←')).toBeInTheDocument()
  })

  it('[編集]メニューの移動・インデントは未選択時は無効になっている', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('menuitem', { name: '編集' }))
    // 初期は未選択なので、選択タスクに作用する項目は無効表示
    expect(screen.getByRole('menuitem', { name: /タスク移動↑/ })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: /インデント/ })).toBeDisabled()
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

  it('ツールバーのツールチップは機能名のみでショートカットを併記しない', () => {
    render(<App />)
    // ショートカットの併記はメニューバーの項目のみ。ツールチップ(title)は機能名だけ
    expect(screen.getByRole('button', { name: 'タスク移動↑' })).toHaveAttribute(
      'title',
      'タスク移動↑',
    )
    expect(screen.getByRole('button', { name: 'インデント' })).toHaveAttribute(
      'title',
      'インデント',
    )
  })

  it('[ヘルプ]メニューに GitHub リンクと [taskaror について] がある', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('menuitem', { name: 'ヘルプ' }))

    // GitHub リポジトリへのリンク(新規タブで開く)
    const link = screen.getByRole('menuitem', { name: /GitHub リポジトリ/ })
    expect(link).toHaveAttribute('href', 'https://github.com/yosiopp/taskaror')
    expect(link).toHaveAttribute('target', '_blank')

    // [taskaror について] を開くとバージョンが表示される
    await user.click(screen.getByRole('menuitem', { name: 'taskaror について' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/バージョン/)).toBeInTheDocument()
  })

  it('タスクの行をダブルクリックすると編集ダイアログが開き依存リストが出る', async () => {
    const user = userEvent.setup()
    render(<App />)

    // 行そのものをダブルクリック(セルの上でなければインライン編集にならない)
    const firstRow = document.querySelector('.grid-row')
    expect(firstRow).not.toBeNull()
    await user.dblClick(firstRow as Element)

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('タスクの編集')).toBeInTheDocument()
    // 依存(先行タスク)セクションが描画され、候補はチェックボックスで表示される
    expect(within(dialog).getByText('依存(先行タスク)')).toBeInTheDocument()
    expect(within(dialog).getAllByRole('checkbox').length).toBeGreaterThan(0)
  })

  it('Ctrl+↑ で選択タスクを上に移動できる', async () => {
    const user = userEvent.setup()
    render(<App />)

    // Insert で末尾に追加すると「新しいタスク」が最後の行かつ選択中になる
    await user.keyboard('{Insert}')
    const lastTitle = (): string | null | undefined => {
      const titles = document.querySelectorAll('.cell-text.title')
      return titles[titles.length - 1]?.textContent
    }
    expect(lastTitle()).toBe('新しいタスク')

    // Ctrl+↑ で一つ上の兄弟と入れ替わり、最後の行ではなくなる
    await user.keyboard('{Control>}{ArrowUp}{/Control}')
    expect(lastTitle()).not.toBe('新しいタスク')
    // 消えたわけではなく移動しただけ
    expect(screen.getByText('新しいタスク')).toBeInTheDocument()
  })

  it('末尾タスク行で ↓ を押すと空グリッド行へフォーカスが移り、↑ で戻れる', async () => {
    const user = userEvent.setup()
    render(<App />)

    // Insert で末尾に追加すると「新しいタスク」が最後の行かつ選択中になる
    await user.keyboard('{Insert}')
    expect(document.querySelector('.grid-row.selected')).not.toBeNull()

    // グリッド本体にフォーカスを当ててから ↓ を押す
    const body = document.querySelector('.grid-body') as HTMLElement
    body.focus()
    await user.keyboard('{ArrowDown}')

    // 末尾タスクから直下の空グリッド行へフォーカスが移る(タスク選択は解除)
    expect(document.querySelector('.grid-row-empty.focused')).not.toBeNull()
    expect(document.querySelector('.grid-row.selected')).toBeNull()

    // 空行の一番上で ↑ を押すと末尾タスク行へ戻る
    await user.keyboard('{ArrowUp}')
    expect(document.querySelector('.grid-row-empty.focused')).toBeNull()
    const selected = document.querySelector('.grid-row.selected')
    expect(selected?.querySelector('.cell-text.title')?.textContent).toBe(
      '新しいタスク',
    )
  })

  it('空グリッド行で Enter を押すと新規タスクが作成される', async () => {
    const user = userEvent.setup()
    render(<App />)

    const taskRowCount = (): number =>
      document.querySelectorAll('.grid-row:not(.grid-row-empty)').length

    // 末尾タスク → ↓ で空行へフォーカス
    await user.keyboard('{Insert}')
    const before = taskRowCount()
    const body = document.querySelector('.grid-body') as HTMLElement
    body.focus()
    await user.keyboard('{ArrowDown}')
    expect(document.querySelector('.grid-row-empty.focused')).not.toBeNull()

    // 空行フォーカス状態で Enter → タスクが 1 つ増える
    await user.keyboard('{Enter}')
    expect(taskRowCount()).toBe(before + 1)
  })

  it('空グリッド行で文字入力すると、その文字を名称にして新規タスクが作成される', async () => {
    const user = userEvent.setup()
    render(<App />)

    const taskRowCount = (): number =>
      document.querySelectorAll('.grid-row:not(.grid-row-empty)').length

    // 末尾タスク → ↓ で空行へフォーカス
    await user.keyboard('{Insert}')
    const before = taskRowCount()
    const body = document.querySelector('.grid-body') as HTMLElement
    body.focus()
    await user.keyboard('{ArrowDown}')
    expect(document.querySelector('.grid-row-empty.focused')).not.toBeNull()

    // 空行フォーカス状態で 'a' を打つと、その文字を初期値に名称編集が始まる
    await user.keyboard('a')
    expect(taskRowCount()).toBe(before + 1)
    expect(screen.getByDisplayValue('a')).toBeInTheDocument()
  })
})
