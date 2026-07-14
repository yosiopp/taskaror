/**
 * MenuBar(メニューバー)のコンポーネントテスト。
 * 開閉(クリック・外側クリック・Esc)とキーボード操作(↑/↓/←/→・Enter)、
 * separator・無効項目のスキップ、checkbox / radio の状態表示を検証する。
 */
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import MenuBar from './MenuBar'
import type { Menu } from './MenuBar'

/** メニューバーを描画してモックのハンドラを返す */
function renderMenuBar() {
  const onNew = vi.fn()
  const onOpen = vi.fn()
  const onToggle = vi.fn()
  const menus: Menu[] = [
    {
      label: 'ファイル',
      items: [
        { kind: 'action', label: '新規', onSelect: onNew, shortcut: 'Ctrl+N' },
        { kind: 'separator' },
        { kind: 'action', label: '保存', onSelect: vi.fn(), disabled: true },
        { kind: 'action', label: '開く', onSelect: onOpen },
      ],
    },
    {
      label: '表示',
      items: [
        { kind: 'radio', label: 'ガント', checked: true, onSelect: vi.fn() },
        { kind: 'checkbox', label: '強調', checked: false, onSelect: onToggle },
      ],
    },
  ]
  render(<MenuBar menus={menus} />)
  return { onNew, onOpen, onToggle }
}

describe('MenuBar', () => {
  it('トリガーのクリックで開閉し、外側クリックで閉じる', async () => {
    const user = userEvent.setup()
    renderMenuBar()
    const trigger = screen.getByRole('menuitem', { name: 'ファイル' })

    // クリックで開き、もう一度クリックで閉じる
    await user.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await user.click(trigger)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    // 開いた状態で外側を mousedown すると閉じる
    await user.click(trigger)
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('↓ キーで開くと最初の選択可能項目にフォーカスされる', async () => {
    const user = userEvent.setup()
    renderMenuBar()

    screen.getByRole('menuitem', { name: 'ファイル' }).focus()
    await user.keyboard('{ArrowDown}')

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /新規/ })).toHaveFocus()
  })

  it('↑/↓ の項目移動は separator と無効項目をスキップして折り返す', async () => {
    const user = userEvent.setup()
    renderMenuBar()

    screen.getByRole('menuitem', { name: 'ファイル' }).focus()
    await user.keyboard('{ArrowDown}')

    // 新規 → (separator と無効な 保存 を飛ばして) 開く
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: '開く' })).toHaveFocus()

    // 末尾からさらに ↓ で先頭へ折り返す
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: /新規/ })).toHaveFocus()

    // 先頭から ↑ で末尾へ折り返す
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: '開く' })).toHaveFocus()
  })

  it('Enter で項目を実行するとメニューが閉じ、トリガーへフォーカスが戻る', async () => {
    const user = userEvent.setup()
    const { onNew } = renderMenuBar()
    const trigger = screen.getByRole('menuitem', { name: 'ファイル' })

    trigger.focus()
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')

    expect(onNew).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('→ キーで隣のメニューへ移動して最初の項目にフォーカスされる', async () => {
    const user = userEvent.setup()
    renderMenuBar()

    screen.getByRole('menuitem', { name: 'ファイル' }).focus()
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{ArrowRight}')

    expect(screen.getByRole('menuitemradio', { name: 'ガント' })).toHaveFocus()
  })

  it('Esc で閉じてトリガーへフォーカスが戻る', async () => {
    const user = userEvent.setup()
    renderMenuBar()
    const trigger = screen.getByRole('menuitem', { name: 'ファイル' })

    trigger.focus()
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('checkbox / radio 項目はチェック状態が表示され、選択で発火する', async () => {
    const user = userEvent.setup()
    const { onToggle } = renderMenuBar()

    await user.click(screen.getByRole('menuitem', { name: '表示' }))
    expect(screen.getByRole('menuitemradio', { name: 'ガント' })).toBeChecked()
    const checkbox = screen.getByRole('menuitemcheckbox', { name: '強調' })
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)
    expect(onToggle).toHaveBeenCalledTimes(1)
    // 選択後はメニューが閉じる
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
