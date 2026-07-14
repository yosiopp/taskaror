/**
 * App の UI テスト: グリッド編集まわり。
 * セルのインライン編集(確定・キャンセル・入力検証)、依存ポップオーバー、
 * 折りたたみ、ツールバーのタスク操作、編集ダイアログとの統合(適用の反映・
 * id 変更時の depends 一括置換が YAML まで届くこと)を検証する。
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

/** タスク名からグリッド行(.grid-row)を引く(再レンダー後は取り直す) */
function rowByTitle(title: string): HTMLElement {
  const row = screen.getByText(title).closest('.grid-row')
  if (!(row instanceof HTMLElement)) {
    throw new Error(`タスク行が見つかりません: ${title}`)
  }
  return row
}

/** グリッドのタスク名の表示順 */
function titleTexts(): (string | null)[] {
  return Array.from(document.querySelectorAll('.cell-text.title')).map(
    (el) => el.textContent,
  )
}

describe('App のグリッド編集', () => {
  it('タスク名セルをクリックして編集し、Enter で確定できる', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByText('DB設計'))
    const input = screen.getByDisplayValue('DB設計')
    await user.clear(input)
    await user.type(input, 'ストレージ設計')
    await user.keyboard('{Enter}')

    expect(screen.getByText('ストレージ設計')).toBeInTheDocument()
    expect(screen.queryByText('DB設計')).not.toBeInTheDocument()
  })

  it('Enter で確定すると下の行の同じ列の編集へ移る', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByText('API設計'))
    expect(screen.getByDisplayValue('API設計')).toBeInTheDocument()
    await user.keyboard('{Enter}')

    // 次の行(DB設計)のタスク名セルが編集状態になる
    expect(screen.getByDisplayValue('DB設計')).toBeInTheDocument()
  })

  it('Esc でセル編集をキャンセルすると元の値のまま', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByText('DB設計'))
    const input = screen.getByDisplayValue('DB設計')
    await user.clear(input)
    await user.type(input, '別名')
    await user.keyboard('{Escape}')

    expect(screen.getByText('DB設計')).toBeInTheDocument()
    expect(screen.queryByText('別名')).not.toBeInTheDocument()
  })

  it('見積セルの形式違反はコミットされない', async () => {
    const user = userEvent.setup()
    render(<App />)

    // DB設計 の見積セル(4h)を編集して不正な形式を入力する
    await user.click(screen.getByText('4h'))
    const input = screen.getByDisplayValue('4h')
    await user.clear(input)
    await user.type(input, 'xx')
    await user.keyboard('{Enter}')

    // 不正入力は捨てられ、元の値が表示され続ける
    expect(screen.getByText('4h')).toBeInTheDocument()
    expect(screen.queryByText('xx')).not.toBeInTheDocument()
  })

  it('見積セルに妥当な値を入力すると反映される', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByText('4h'))
    const input = screen.getByDisplayValue('4h')
    await user.clear(input)
    await user.type(input, '2d')
    await user.keyboard('{Enter}')

    expect(screen.getByText('2d')).toBeInTheDocument()
    expect(screen.queryByText('4h')).not.toBeInTheDocument()
  })

  it('進捗セルの入力は 0〜100 に丸めて確定される', async () => {
    const user = userEvent.setup()
    render(<App />)

    // DB設計 の進捗セル(4 番目の編集可能セル)を開いて範囲外の値を入れる
    const cells = rowByTitle('DB設計').querySelectorAll('.grid-cell.editable')
    await user.click(cells[3])
    const input = screen.getByRole('spinbutton')
    await user.type(input, '150')
    fireEvent.blur(input)

    expect(within(rowByTitle('DB設計')).getByText('100%')).toBeInTheDocument()
  })

  it('依存セルのポップオーバーで依存を追加・解除できる', async () => {
    const user = userEvent.setup()
    render(<App />)

    const dependsButton = (): HTMLElement => {
      const button = rowByTitle('DB設計').querySelector('.depends-button')
      if (!(button instanceof HTMLElement)) {
        throw new Error('依存ボタンが見つかりません')
      }
      return button
    }

    await user.click(dependsButton())
    const popover = document.querySelector('.depends-popover')
    expect(popover).not.toBeNull()

    // API設計 にチェックを入れると依存セルに id が表示される
    await user.click(
      within(popover as HTMLElement).getByRole('checkbox', { name: /API設計/ }),
    )
    expect(dependsButton().textContent).toContain('api')

    // もう一度チェックを外すと依存が解除される
    await user.click(
      within(popover as HTMLElement).getByRole('checkbox', { name: /API設計/ }),
    )
    expect(dependsButton().textContent).not.toContain('api')
  })

  it('折りたたみトグルで子タスクの行が隠れ、展開で戻る', async () => {
    const user = userEvent.setup()
    render(<App />)

    // サンプルで子を持つのは 設計 のみ
    await user.click(screen.getByRole('button', { name: '折りたたみ' }))
    expect(screen.queryByText('API設計')).not.toBeInTheDocument()
    expect(screen.queryByText('DB設計')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '展開' }))
    expect(screen.getByText('API設計')).toBeInTheDocument()
    expect(screen.getByText('DB設計')).toBeInTheDocument()
  })

  it('行を選択するとツールバーの選択系ボタンが有効になる', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('button', { name: 'タスク削除' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'インデント' })).toBeDisabled()

    await user.click(rowByTitle('DB設計'))
    expect(screen.getByRole('button', { name: 'タスク削除' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'インデント' })).toBeEnabled()
  })

  it('ツールバーの「タスク移動↓」で兄弟との表示順が入れ替わる', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(titleTexts()).toEqual(['設計', 'API設計', 'DB設計', '実装'])
    await user.click(rowByTitle('API設計'))
    await user.click(screen.getByRole('button', { name: 'タスク移動↓' }))

    expect(titleTexts()).toEqual(['設計', 'DB設計', 'API設計', '実装'])
  })

  it('ツールバーの「インデント」「アウトデント」で階層が変わる', async () => {
    const user = userEvent.setup()
    render(<App />)

    // タスク名セルの字下げ(paddingLeft = 6 + depth * 16)で階層を確認する
    const namePad = (title: string): string => {
      const cell = rowByTitle(title).querySelector('.cell-name')
      if (!(cell instanceof HTMLElement)) {
        throw new Error(`タスク名セルが見つかりません: ${title}`)
      }
      return cell.style.paddingLeft
    }

    expect(namePad('DB設計')).toBe('22px') // depth 1
    await user.click(rowByTitle('DB設計'))
    await user.click(screen.getByRole('button', { name: 'インデント' }))
    expect(namePad('DB設計')).toBe('38px') // depth 2(API設計 の子)

    await user.click(screen.getByRole('button', { name: 'アウトデント' }))
    expect(namePad('DB設計')).toBe('22px') // depth 1 に戻る
  })

  it('編集ダイアログの[適用]でタスク名と見積がグリッドに反映される', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.dblClick(rowByTitle('DB設計'))
    const dialog = screen.getByRole('dialog')
    const titleInput = within(dialog).getByLabelText('タスク名')
    await user.clear(titleInput)
    await user.type(titleInput, 'DB 詳細設計')
    const estimateInput = within(dialog).getByLabelText('見積')
    await user.clear(estimateInput)
    await user.type(estimateInput, '1d')
    await user.click(within(dialog).getByRole('button', { name: '適用' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('DB 詳細設計')).toBeInTheDocument()
    expect(screen.getByText('1d')).toBeInTheDocument()
  })

  it('ダイアログで id を変更すると depends の参照も一括置換され YAML に反映される', async () => {
    const user = userEvent.setup()
    render(<App />)

    // 実装 は design(設計)に依存している。設計 の id を変更する
    await user.dblClick(rowByTitle('設計'))
    const dialog = screen.getByRole('dialog')
    const idInput = within(dialog).getByLabelText('ID')
    await user.clear(idInput)
    await user.type(idInput, 'foundation')
    await user.click(within(dialog).getByRole('button', { name: '適用' }))

    // 実装 の依存セルが新 id に置き換わる
    expect(
      rowByTitle('実装').querySelector('.depends-button')?.textContent,
    ).toContain('foundation')

    // YAML ビューにも id と depends の両方が反映され、旧 id は残らない
    await user.click(screen.getByRole('menuitem', { name: '表示' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'YAML' }))
    const yaml = (
      screen.getByRole('textbox', {
        name: 'YAML エディタ',
      }) as HTMLTextAreaElement
    ).value
    expect(yaml).toContain('id: foundation')
    expect(yaml).toMatch(/depends:\s*\n\s*- foundation/)
    expect(yaml).not.toContain('design')
  })

  it('編集ダイアログの[キャンセル]では変更が反映されない', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.dblClick(rowByTitle('DB設計'))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('タスク名'), '(下書き)')
    await user.click(within(dialog).getByRole('button', { name: 'キャンセル' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('DB設計')).toBeInTheDocument()
  })
})
