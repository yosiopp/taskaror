/**
 * App の UI テスト(React Testing Library + jsdom)。
 * 実 DOM にマウントしてユーザー操作を再現し、操作に対する表示の反応を検証する。
 * 描画パイプラインの最小確認(SSR)は App.smoke.test.tsx が担当し、
 * こちらは「操作 → 画面の変化」という UI の振る舞いを対象にする。
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
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
    await user.click(
      screen.getByRole('menuitem', { name: 'taskaror について' }),
    )
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

  // --- ガントチャート: 依存線の選択・削除、逆方向の接続ハンドル ---
  // SVG のポインタドラッグは jsdom で完全再現しにくいため、ここでは
  // 「依存線のクリック選択 → Delete 削除」「タスク選択と依存線選択の相互排他」
  // という検証可能な振る舞いを中心にカバーする。

  it('依存線をクリックで選択し、Delete でその依存を削除できる', async () => {
    const user = userEvent.setup()
    render(<App />)

    // サンプルは implementation が design に依存する 1 本の依存線を持つ
    const hits = document.querySelectorAll('.gantt-arrow-hit')
    expect(hits.length).toBe(1)
    expect(document.querySelector('.gantt-arrow.selected')).toBeNull()

    // 透明ヒットラインをクリックすると依存線が選択状態になる
    fireEvent.click(hits[0])
    expect(document.querySelector('.gantt-arrow.selected')).not.toBeNull()

    // Delete で依存参照が外れ、矢印(と依存線)が消える
    await user.keyboard('{Delete}')
    expect(document.querySelectorAll('.gantt-arrow-hit').length).toBe(0)
    expect(document.querySelector('.gantt-arrow.selected')).toBeNull()
  })

  it('タスク選択と依存線選択は相互排他になる', async () => {
    const user = userEvent.setup()
    render(<App />)

    // 先頭のタスク行(グリッド)をクリックして選択する
    const firstRow = document.querySelector(
      '.grid-row:not(.grid-row-empty)',
    ) as HTMLElement
    await user.click(firstRow)
    expect(document.querySelector('.grid-row.selected')).not.toBeNull()

    // 依存線を選択するとタスク選択が解除される(依存線が選択に、行選択が解除)
    fireEvent.click(document.querySelector('.gantt-arrow-hit') as Element)
    expect(document.querySelector('.gantt-arrow.selected')).not.toBeNull()
    expect(document.querySelector('.grid-row.selected')).toBeNull()

    // 逆に、タスクを選び直すと依存線選択が解除される
    await user.click(firstRow)
    expect(document.querySelector('.grid-row.selected')).not.toBeNull()
    expect(document.querySelector('.gantt-arrow.selected')).toBeNull()
  })

  it('依存線選択中でなければ Delete は従来どおり選択タスクを削除する', async () => {
    const user = userEvent.setup()
    render(<App />)

    // Insert で末尾に新規タスクを追加(選択される)。依存線は未選択のまま
    await user.keyboard('{Insert}')
    expect(screen.getByText('新しいタスク')).toBeInTheDocument()

    // 依存線選択が無いので Delete は選択タスク削除にフォールバックする
    await user.keyboard('{Delete}')
    expect(screen.queryByText('新しいタスク')).not.toBeInTheDocument()
    // 既存の依存線は削除されず残っている
    expect(document.querySelectorAll('.gantt-arrow-hit').length).toBe(1)
  })

  it('各バーに先行(左端)・後続(右端)の接続ハンドルが両方描画される', () => {
    render(<App />)
    // 左端(start=先行を張る)と右端(end=後続を張る)のハンドルが同数だけ出る
    const starts = document.querySelectorAll('.gantt-link-handle.start')
    const ends = document.querySelectorAll('.gantt-link-handle.end')
    expect(starts.length).toBeGreaterThan(0)
    expect(starts.length).toBe(ends.length)
  })

  it('左端ハンドルからのドラッグで逆方向(後続→先行)の依存を設定できる', () => {
    render(<App />)

    // 初期の依存線は 1 本(design → implementation)
    expect(document.querySelectorAll('.gantt-arrow-hit').length).toBe(1)

    // api バーの左端ハンドル(start)を掴み、db の行へドラッグして離す。
    // これは「api(後続)→ db(先行)」の逆方向定義で、api.depends に db を足す。
    const apiBar = document.querySelector('[data-gantt-bar="api"]')
    const group = apiBar?.closest('.gantt-bar-group')
    const startHandle = group?.querySelector(
      '.gantt-link-handle.start',
    ) as Element

    // jsdom では SVG の getBoundingClientRect が原点を返すので、clientY をそのまま
    // 行インデックス(ROW_HEIGHT=34)に対応させられる。db は 3 番目の表示行(index 2)。
    fireEvent.pointerDown(startHandle)
    fireEvent.pointerMove(window, { clientX: 40, clientY: 34 * 2 + 10 })
    fireEvent.pointerUp(window)

    // 依存線が 2 本になり、api の依存セルに db が表示される
    expect(document.querySelectorAll('.gantt-arrow-hit').length).toBe(2)
    const apiRow = document
      .querySelector('[data-gantt-bar="api"]')
      ?.closest('.gantt-bar-group')
    expect(apiRow).not.toBeNull()
    const apiGridRow = Array.from(
      document.querySelectorAll('.grid-row:not(.grid-row-empty)'),
    ).find((row) => within(row as HTMLElement).queryByText('API設計'))
    expect(apiGridRow?.querySelector('.depends-button')?.textContent).toContain(
      'db',
    )
  })
})
