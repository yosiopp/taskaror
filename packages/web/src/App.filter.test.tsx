/**
 * App の UI テスト: ガント表示のフィルタ([表示] → [フィルター])。
 * 担当者・タグ・完了タスク非表示それぞれの絞り込みと組み合わせ(AND)、
 * 一括解除、ツールバーのフィルターアイコンの状態表示、
 * フィルタの localStorage 永続化を検証する。
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

type User = ReturnType<typeof userEvent.setup>

/** 担当者・タグ・進捗が混在する検証用の TaskSpec */
const FILTER_SPEC = [
  "taskspec: '1.0'",
  'info:',
  '  title: フィルタ検証',
  'tasks:',
  '  - id: parent',
  '    title: 親作業',
  '    tasks:',
  '      - id: back',
  '        title: バックエンド実装',
  '        estimate: 1d',
  '        assignees: [tanaka]',
  '        tags: [backend]',
  '      - id: front',
  '        title: フロント実装',
  '        estimate: 1d',
  '        assignees: [suzuki]',
  '        tags: [frontend]',
  '  - id: done',
  '    title: 完了済み作業',
  '    estimate: 1d',
  '    progress: 100',
  '    assignees: [tanaka]',
  '',
].join('\n')

/** YAML ビュー経由で spec を読み込み、ガント編集ビューへ戻る */
async function loadSpec(user: User, yaml: string): Promise<void> {
  await user.click(screen.getByRole('menuitem', { name: '表示' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'YAML' }))
  const textarea = screen.getByRole('textbox', { name: 'YAML エディタ' })
  await user.clear(textarea)
  await user.paste(yaml)
  await user.click(screen.getByRole('button', { name: '適用' }))
  await user.click(screen.getByRole('menuitem', { name: '表示' }))
  await user.click(
    screen.getByRole('menuitemradio', { name: 'ガントチャート' }),
  )
}

/** [表示] → [フィルター] サブメニューを開く */
async function openFilterMenu(user: User): Promise<void> {
  await user.click(screen.getByRole('menuitem', { name: '表示' }))
  await user.click(screen.getByRole('menuitem', { name: 'フィルター' }))
}

/** 開いているフィルターダイアログを返す */
function filterDialog(): HTMLElement {
  return screen.getByRole('dialog', { name: 'フィルター' })
}

describe('App のガント表示フィルタ', () => {
  it('担当者で絞り込むと該当タスクとその祖先だけが表示され、再マウント後も維持される', async () => {
    const user = userEvent.setup()
    const first = render(<App />)
    await loadSpec(user, FILTER_SPEC)

    await openFilterMenu(user)
    await user.click(
      screen.getByRole('menuitem', { name: '担当者で絞り込む…' }),
    )
    await user.click(
      within(filterDialog()).getByRole('checkbox', { name: 'tanaka' }),
    )
    await user.keyboard('{Escape}')

    // tanaka のタスク(back / done)と、back の祖先(親作業)だけが残る
    expect(screen.getByText('バックエンド実装')).toBeInTheDocument()
    expect(screen.getByText('親作業')).toBeInTheDocument()
    expect(screen.getByText('完了済み作業')).toBeInTheDocument()
    expect(screen.queryByText('フロント実装')).not.toBeInTheDocument()

    // ツールバーのアイコンが「適用中」の状態になる
    expect(
      screen.getByRole('button', { name: 'フィルター(適用中)' }),
    ).toBeInTheDocument()

    // フィルタは localStorage に保存され、再マウント後も効いたまま
    first.unmount()
    render(<App />)
    expect(screen.queryByText('フロント実装')).not.toBeInTheDocument()
    expect(screen.getByText('バックエンド実装')).toBeInTheDocument()
  })

  it('タグ・担当者・完了非表示のフィルタは AND で組み合わさる', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadSpec(user, FILTER_SPEC)

    // タグ backend で絞ると、タグなしの完了済み作業やフロント実装は消える
    await openFilterMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'タグで絞り込む…' }))
    await user.click(
      within(filterDialog()).getByRole('checkbox', { name: 'backend' }),
    )

    expect(screen.getByText('バックエンド実装')).toBeInTheDocument()
    expect(screen.queryByText('フロント実装')).not.toBeInTheDocument()
    expect(screen.queryByText('完了済み作業')).not.toBeInTheDocument()

    // さらに担当者 suzuki を組み合わせると両方満たすタスクがなくなる
    await user.click(
      within(filterDialog()).getByRole('checkbox', { name: 'suzuki' }),
    )
    expect(screen.queryByText('バックエンド実装')).not.toBeInTheDocument()

    // ダイアログの [すべて解除] で全タスクが戻る
    await user.click(
      within(filterDialog()).getByRole('button', { name: 'すべて解除' }),
    )
    expect(screen.getByText('バックエンド実装')).toBeInTheDocument()
    expect(screen.getByText('フロント実装')).toBeInTheDocument()
    expect(screen.getByText('完了済み作業')).toBeInTheDocument()
  })

  it('完了タスクを非表示はフィルターメニューから切り替えられる', async () => {
    const user = userEvent.setup()
    render(<App />)

    // DB設計 の進捗セル(4 番目の編集可能セル)を 100 にする
    const row = screen.getByText('DB設計').closest('.grid-row') as HTMLElement
    const cells = row.querySelectorAll('.grid-cell.editable')
    await user.click(cells[3])
    const input = screen.getByRole('spinbutton')
    await user.type(input, '100')
    fireEvent.blur(input)

    await openFilterMenu(user)
    await user.click(
      screen.getByRole('menuitemcheckbox', { name: '完了タスクを非表示' }),
    )
    expect(screen.queryByText('DB設計')).not.toBeInTheDocument()
    expect(screen.getByText('API設計')).toBeInTheDocument()

    // OFF に戻すと再表示される(spec からは消えていない)
    await openFilterMenu(user)
    await user.click(
      screen.getByRole('menuitemcheckbox', { name: '完了タスクを非表示' }),
    )
    expect(screen.getByText('DB設計')).toBeInTheDocument()
  })

  it('[フィルターをすべて解除] は未適用時は無効で、適用中は全条件を外す', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadSpec(user, FILTER_SPEC)

    // 未適用ならメニューの一括解除は無効
    await openFilterMenu(user)
    expect(
      screen.getByRole('menuitem', { name: 'フィルターをすべて解除' }),
    ).toBeDisabled()
    await user.keyboard('{Escape}')

    // 担当者フィルタ+完了非表示を適用する
    await openFilterMenu(user)
    await user.click(
      screen.getByRole('menuitem', { name: '担当者で絞り込む…' }),
    )
    await user.click(
      within(filterDialog()).getByRole('checkbox', { name: 'tanaka' }),
    )
    await user.click(
      within(filterDialog()).getByRole('checkbox', {
        name: '完了タスクを非表示',
      }),
    )
    await user.keyboard('{Escape}')
    expect(screen.queryByText('完了済み作業')).not.toBeInTheDocument()
    expect(screen.queryByText('フロント実装')).not.toBeInTheDocument()

    // 一括解除ですべて表示に戻り、アイコンの「適用中」も外れる
    await openFilterMenu(user)
    await user.click(
      screen.getByRole('menuitem', { name: 'フィルターをすべて解除' }),
    )
    expect(screen.getByText('フロント実装')).toBeInTheDocument()
    expect(screen.getByText('完了済み作業')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'フィルター' }),
    ).toBeInTheDocument()
  })

  it('ツールバーのフィルターアイコンからもダイアログを開ける', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'フィルター' }))
    const dialog = filterDialog()
    // サンプルにはタグがないので、タグ節は空の案内になる
    expect(
      within(dialog).getByText('タグが設定されたタスクがありません'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('checkbox', { name: 'tanaka' }),
    ).toBeInTheDocument()

    // Esc でも閉じられる
    await user.keyboard('{Escape}')
    expect(
      screen.queryByRole('dialog', { name: 'フィルター' }),
    ).not.toBeInTheDocument()
  })
})
