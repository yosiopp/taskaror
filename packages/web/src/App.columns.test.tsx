/**
 * App の UI テスト: グリッドのカラム表示([表示] → [カラム])。
 * 担当者・タグ・進捗率の表示切り替え、タグ列の既定非表示、タグセルのインライン編集、
 * 既定へのリセット、カラム状態の localStorage 永続化を検証する。
 */
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

type User = ReturnType<typeof userEvent.setup>

/** グリッドの列見出しラベル(フィラー列の空セルは除く) */
function headerLabels(): string[] {
  return Array.from(document.querySelectorAll('.grid-header .grid-th'))
    .map((el) => el.textContent ?? '')
    .filter((label) => label !== '')
}

/** [表示] → [カラム] サブメニューを開く */
async function openColumnMenu(user: User): Promise<void> {
  await user.click(screen.getByRole('menuitem', { name: '表示' }))
  await user.click(screen.getByRole('menuitem', { name: 'カラム' }))
}

describe('App のグリッドカラム表示', () => {
  it('既定ではタグ列だけが非表示になっている', () => {
    render(<App />)
    expect(headerLabels()).toEqual([
      'タスク名',
      '見積',
      '開始',
      '担当',
      '進捗',
      '依存',
    ])
  })

  it('メニューからタグ列を表示でき、再マウント後も維持される', async () => {
    const user = userEvent.setup()
    const first = render(<App />)

    await openColumnMenu(user)
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'タグ' }))
    expect(headerLabels()).toEqual([
      'タスク名',
      '見積',
      '開始',
      '担当',
      'タグ',
      '進捗',
      '依存',
    ])

    // カラム状態は localStorage に保存され、再マウント後も効いたまま
    first.unmount()
    render(<App />)
    expect(headerLabels()).toContain('タグ')
  })

  it('担当者・進捗率の列を非表示にできる', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openColumnMenu(user)
    await user.click(screen.getByRole('menuitemcheckbox', { name: '担当者' }))
    expect(headerLabels()).not.toContain('担当')

    await openColumnMenu(user)
    await user.click(screen.getByRole('menuitemcheckbox', { name: '進捗率' }))
    expect(headerLabels()).toEqual(['タスク名', '見積', '開始', '依存'])
  })

  it('タグ列を表示するとセルのインライン編集で tags を変更できる', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openColumnMenu(user)
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'タグ' }))

    // DB設計 のタグセル(見積・開始・担当に続く 4 番目の編集可能セル)を編集する
    const row = screen.getByText('DB設計').closest('.grid-row') as HTMLElement
    const cells = row.querySelectorAll('.grid-cell.editable')
    await user.click(cells[3])
    const input = screen.getByPlaceholderText('カンマ区切り')
    await user.type(input, 'backend, design')
    fireEvent.blur(input)

    expect(screen.getByText('backend, design')).toBeInTheDocument()
  })

  it('[カラムを既定に戻す] は既定状態では無効で、変更後は既定に戻せる', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openColumnMenu(user)
    expect(
      screen.getByRole('menuitem', { name: 'カラムを既定に戻す' }),
    ).toBeDisabled()
    await user.keyboard('{Escape}')

    // タグを表示・担当者を非表示にしてからリセットする
    await openColumnMenu(user)
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'タグ' }))
    await openColumnMenu(user)
    await user.click(screen.getByRole('menuitemcheckbox', { name: '担当者' }))
    expect(headerLabels()).toContain('タグ')
    expect(headerLabels()).not.toContain('担当')

    await openColumnMenu(user)
    await user.click(
      screen.getByRole('menuitem', { name: 'カラムを既定に戻す' }),
    )
    expect(headerLabels()).toEqual([
      'タスク名',
      '見積',
      '開始',
      '担当',
      '進捗',
      '依存',
    ])
  })

  it('列見出しの境界にはリサイザがあり、左右キーで列幅を変更できる', async () => {
    const user = userEvent.setup()
    render(<App />)

    const resizer = screen.getByRole('separator', {
      name: 'タスク名列の幅。ドラッグまたは左右キーで変更',
    })
    expect(resizer).toHaveAttribute('aria-valuenow', '155')

    resizer.focus()
    await user.keyboard('{ArrowRight}')
    expect(resizer).toHaveAttribute('aria-valuenow', '163')
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}')
    expect(resizer).toHaveAttribute('aria-valuenow', '131')
  })
})
