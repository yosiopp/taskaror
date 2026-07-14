/**
 * App の UI テスト: ビュー切替と状態の保存・復元。
 * WBS 表への切り替え、ガント編集 ⇔ YAML ビューの同期([適用] の反映と
 * エラー時の非反映)、ビューモード・編集内容の localStorage 永続化、
 * クリティカルパス強調・完了タスク非表示の表示メニュー、[新規] の確認を検証する。
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

/** [表示]メニューからビューを切り替える */
async function switchView(
  user: ReturnType<typeof userEvent.setup>,
  label: 'ガントチャート' | 'YAML' | 'WBS表',
): Promise<void> {
  await user.click(screen.getByRole('menuitem', { name: '表示' }))
  await user.click(screen.getByRole('menuitemradio', { name: label }))
}

/** YAML ビューの textarea を取得する */
function yamlTextarea(): HTMLTextAreaElement {
  return screen.getByRole('textbox', {
    name: 'YAML エディタ',
  }) as HTMLTextAreaElement
}

describe('App のビュー切替と状態保存', () => {
  it('WBS 表に切り替えると WBS 番号と導出日程が表示される', async () => {
    const user = userEvent.setup()
    render(<App />)
    await switchView(user, 'WBS表')

    const table = screen.getByRole('table')
    for (const header of ['WBS', 'タスク名', '開始', '終了', '依存']) {
      expect(
        within(table).getByRole('columnheader', { name: header }),
      ).toBeInTheDocument()
    }

    // WBS 番号は階層から導出される(1 / 1.1 / 1.2 / 2)
    expect(within(table).getByText('1.1')).toBeInTheDocument()
    expect(within(table).getByText('1.2')).toBeInTheDocument()
    expect(within(table).getByText('2')).toBeInTheDocument()

    // 開始・終了にはスケジュール導出値(YYYY-MM-DD)が表示される
    expect(
      within(table).getAllByText(/^\d{4}-\d{2}-\d{2}$/).length,
    ).toBeGreaterThan(0)

    // 依存列には depends の id が出る
    expect(within(table).getByText('design')).toBeInTheDocument()

    // タスク操作ツールバーはガント編集ビュー専用なので消える
    expect(
      screen.queryByRole('toolbar', { name: 'タスク操作' }),
    ).not.toBeInTheDocument()
  })

  it('ガント編集ビューでの変更が YAML ビューに反映される', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.keyboard('{Insert}')
    await switchView(user, 'YAML')

    expect(yamlTextarea().value).toContain('新しいタスク')
  })

  it('YAML ビューで編集して[適用]するとガント編集ビューに反映される', async () => {
    const user = userEvent.setup()
    render(<App />)
    await switchView(user, 'YAML')

    const replacement = [
      "taskspec: '1.0'",
      'info:',
      '  title: 差し替えプロジェクト',
      'tasks:',
      '  - id: one',
      '    title: 最初の作業',
      '    estimate: 1d',
      '',
    ].join('\n')
    await user.clear(yamlTextarea())
    await user.paste(replacement)
    await user.click(screen.getByRole('button', { name: '適用' }))

    await switchView(user, 'ガントチャート')
    expect(screen.getByText('最初の作業')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'プロジェクト名' })).toHaveValue(
      '差し替えプロジェクト',
    )
    expect(screen.queryByText('API設計')).not.toBeInTheDocument()
  })

  it('YAML の構文エラーは適用されず、モデルは変わらない', async () => {
    const user = userEvent.setup()
    render(<App />)
    await switchView(user, 'YAML')

    await user.clear(yamlTextarea())
    await user.paste('tasks: [')
    await user.click(screen.getByRole('button', { name: '適用' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'ファイルを読み込めませんでした',
    )

    // ガント編集ビューへ戻るとサンプルの内容のまま
    await switchView(user, 'ガントチャート')
    expect(screen.getByText('API設計')).toBeInTheDocument()
  })

  it('ビューモードは保存され、再マウント時に復元される', async () => {
    const user = userEvent.setup()
    const first = render(<App />)
    await switchView(user, 'YAML')
    first.unmount()

    render(<App />)
    expect(yamlTextarea()).toBeInTheDocument()
    expect(
      screen.queryByRole('toolbar', { name: 'タスク操作' }),
    ).not.toBeInTheDocument()
  })

  it('編集内容は localStorage に YAML で保存され、再マウント時に復元される', async () => {
    const user = userEvent.setup()
    const first = render(<App />)

    await user.keyboard('{Insert}')
    expect(localStorage.getItem('taskaror:spec.yaml')).toContain('新しいタスク')
    first.unmount()

    render(<App />)
    expect(screen.getByText('新しいタスク')).toBeInTheDocument()
  })

  it('クリティカルパスの強調を ON にするとガントに強調表示が付く', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(document.querySelector('.critical')).toBeNull()
    await user.click(screen.getByRole('menuitem', { name: '表示' }))
    await user.click(
      screen.getByRole('menuitemcheckbox', { name: 'クリティカルパスを強調' }),
    )
    expect(document.querySelectorAll('.critical').length).toBeGreaterThan(0)

    // メニューを開き直すとチェック状態になっている
    await user.click(screen.getByRole('menuitem', { name: '表示' }))
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'クリティカルパスを強調' }),
    ).toBeChecked()
  })

  it('完了タスクを非表示にすると progress 100 のタスク行が隠れる', async () => {
    const user = userEvent.setup()
    render(<App />)

    // DB設計 の進捗セル(4 番目の編集可能セル)を 100 にする
    const row = screen.getByText('DB設計').closest('.grid-row') as HTMLElement
    const cells = row.querySelectorAll('.grid-cell.editable')
    await user.click(cells[3])
    const input = screen.getByRole('spinbutton')
    await user.type(input, '100')
    fireEvent.blur(input)

    await user.click(screen.getByRole('menuitem', { name: '表示' }))
    await user.click(
      screen.getByRole('menuitemcheckbox', { name: '完了タスクを非表示' }),
    )
    expect(screen.queryByText('DB設計')).not.toBeInTheDocument()
    expect(screen.getByText('API設計')).toBeInTheDocument()

    // OFF に戻すと再表示される(spec からは消えていない)
    await user.click(screen.getByRole('menuitem', { name: '表示' }))
    await user.click(
      screen.getByRole('menuitemcheckbox', { name: '完了タスクを非表示' }),
    )
    expect(screen.getByText('DB設計')).toBeInTheDocument()
  })

  it('[ファイル]→[新規]は確認でキャンセルでき、OK なら空になる', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<App />)

    // キャンセルすると何も変わらない
    await user.click(screen.getByRole('menuitem', { name: 'ファイル' }))
    await user.click(screen.getByRole('menuitem', { name: '新規' }))
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('textbox', { name: 'プロジェクト名' })).toHaveValue(
      'ECサイト構築',
    )
    expect(screen.getByText('API設計')).toBeInTheDocument()

    // OK すると空の TaskSpec になる
    confirmSpy.mockReturnValue(true)
    await user.click(screen.getByRole('menuitem', { name: 'ファイル' }))
    await user.click(screen.getByRole('menuitem', { name: '新規' }))
    expect(screen.getByRole('textbox', { name: 'プロジェクト名' })).toHaveValue(
      '',
    )
    expect(screen.queryByText('API設計')).not.toBeInTheDocument()

    confirmSpy.mockRestore()
  })
})
