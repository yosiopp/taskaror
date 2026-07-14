/**
 * TaskDialog(タスク編集ダイアログ)のコンポーネントテスト。
 * フィールドの初期表示、編集内容が [適用] で onSubmit にまとまること、
 * 入力検証(見積の形式・id の空/形式違反/重複)による [適用] の無効化、
 * 依存候補の除外(自分自身・子孫・祖先)、閉じる操作の各経路を検証する。
 */
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import TaskDialog from './TaskDialog'
import { flattenTasks } from '@taskaror/core/taskspec'
import type { Task } from '@taskaror/core/types/taskspec'

/** テスト用のタスク階層(design ─ api / db。impl は design に依存) */
const tasks: Task[] = [
  {
    id: 'design',
    title: '設計',
    tasks: [
      {
        id: 'api',
        title: 'API設計',
        estimate: '1.5d',
        assignees: ['tanaka'],
        progress: 50,
      },
      { id: 'db', title: 'DB設計', estimate: '4h' },
    ],
  },
  { id: 'impl', title: '実装', depends: ['design'] },
]
const allTasks = flattenTasks(tasks)

/** id からテストデータのタスク実体を引く */
function taskById(id: string): Task {
  const found = allTasks.find((flat) => flat.task.id === id)
  if (found === undefined) throw new Error(`タスクが見つかりません: ${id}`)
  return found.task
}

/** ダイアログを描画してモックのハンドラを返す */
function renderDialog(taskId: string) {
  const onClose = vi.fn()
  const onSubmit = vi.fn()
  render(
    <TaskDialog
      task={taskById(taskId)}
      allTasks={allTasks}
      onClose={onClose}
      onSubmit={onSubmit}
    />,
  )
  return { onClose, onSubmit }
}

describe('TaskDialog', () => {
  it('各フィールドがタスクの現在値で初期表示される', () => {
    renderDialog('api')

    expect(screen.getByLabelText('ID')).toHaveValue('api')
    expect(screen.getByLabelText('タスク名')).toHaveValue('API設計')
    expect(screen.getByLabelText('見積')).toHaveValue('1.5d')
    expect(screen.getByLabelText('担当')).toHaveValue('tanaka')
    expect(screen.getByLabelText('進捗(%)')).toHaveValue(50)
    expect(screen.getByLabelText('タグ')).toHaveValue('')
    expect(screen.getByLabelText('メモ(Markdown)')).toHaveValue('')
  })

  it('既存の depends はチェック済みで表示される', () => {
    renderDialog('impl')

    // impl 自身を除く design / api / db が候補になり、depends の design だけ ON
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
    expect(screen.getByRole('checkbox', { name: /^design/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /^api/ })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /^db/ })).not.toBeChecked()
  })

  it('自分自身・子孫・祖先は依存候補に出ない', () => {
    // design の候補: 自分自身(design)と子孫(api / db)を除いた impl のみ
    renderDialog('design')

    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(1)
    expect(screen.getByRole('checkbox', { name: /実装/ })).toBeInTheDocument()
  })

  it('編集した内容が[適用]で onSubmit にまとめて渡る', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog('api')

    const title = screen.getByLabelText('タスク名')
    await user.clear(title)
    await user.type(title, '認証API設計')
    const estimate = screen.getByLabelText('見積')
    await user.clear(estimate)
    await user.type(estimate, '2d')
    fireEvent.change(screen.getByLabelText('開始'), {
      target: { value: '2026-08-03' },
    })
    const assignees = screen.getByLabelText('担当')
    await user.clear(assignees)
    await user.type(assignees, 'tanaka, suzuki')
    const progress = screen.getByLabelText('進捗(%)')
    await user.clear(progress)
    await user.type(progress, '80')
    await user.type(screen.getByLabelText('タグ'), 'backend, 優先')
    await user.type(screen.getByLabelText('メモ(Markdown)'), '補足メモ')
    await user.click(screen.getByRole('checkbox', { name: /^db/ }))

    await user.click(screen.getByRole('button', { name: '適用' }))

    // id は未変更なので newId(第 2 引数)は undefined になる
    expect(onSubmit).toHaveBeenCalledWith(
      {
        title: '認証API設計',
        estimate: '2d',
        start: '2026-08-03',
        assignees: ['tanaka', 'suzuki'],
        depends: ['db'],
        progress: 80,
        tags: ['backend', '優先'],
        note: '補足メモ',
      },
      undefined,
    )
  })

  it('見積の形式違反はエラー表示され[適用]できない', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog('api')

    const estimate = screen.getByLabelText('見積')
    await user.clear(estimate)
    await user.type(estimate, '2days')

    expect(
      screen.getByText('「数値+h」または「数値+d」で入力してください'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '適用' })).toBeDisabled()
    // フォーム送信(Enter 相当)でも onSubmit は呼ばれない
    fireEvent.submit(screen.getByRole('dialog'))
    expect(onSubmit).not.toHaveBeenCalled()

    // 妥当な形式に直すとエラーが消えて適用できる
    await user.clear(estimate)
    await user.type(estimate, '4h')
    expect(
      screen.queryByText('「数値+h」または「数値+d」で入力してください'),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '適用' })).toBeEnabled()
  })

  it('id を空にするとエラーが出て[適用]できない', async () => {
    const user = userEvent.setup()
    renderDialog('api')

    const idInput = screen.getByLabelText('ID')
    await user.clear(idInput)

    expect(screen.getByText('id を入力してください')).toBeInTheDocument()
    expect(idInput).toBeInvalid()
    expect(screen.getByRole('button', { name: '適用' })).toBeDisabled()
  })

  it('id の形式違反はエラーになる', async () => {
    const user = userEvent.setup()
    renderDialog('api')

    const idInput = screen.getByLabelText('ID')
    await user.clear(idInput)
    await user.type(idInput, '1api')

    expect(
      screen.getByText('id は英字で始まり、英数字と . _ - のみ使えます'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '適用' })).toBeDisabled()
  })

  it('id が他タスクと重複するとエラーになる', async () => {
    const user = userEvent.setup()
    renderDialog('api')

    const idInput = screen.getByLabelText('ID')
    await user.clear(idInput)
    await user.type(idInput, 'db')

    expect(
      screen.getByText('この id は他のタスクで使われています'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '適用' })).toBeDisabled()
  })

  it('id を変更して[適用]すると newId が渡る', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog('api')

    const idInput = screen.getByLabelText('ID')
    await user.clear(idInput)
    await user.type(idInput, 'api2')
    await user.click(screen.getByRole('button', { name: '適用' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'API設計' }),
      'api2',
    )
  })

  it('[キャンセル]と × ボタンで onClose が呼ばれ、onSubmit は呼ばれない', async () => {
    const user = userEvent.setup()
    const { onClose, onSubmit } = renderDialog('api')

    await user.click(screen.getByRole('button', { name: 'キャンセル' }))
    await user.click(screen.getByRole('button', { name: '閉じる' }))

    expect(onClose).toHaveBeenCalledTimes(2)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Esc キーで閉じる', async () => {
    const user = userEvent.setup()
    const { onClose } = renderDialog('api')

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('バックドロップのクリックで閉じる(カード内クリックでは閉じない)', () => {
    const { onClose } = renderDialog('api')

    // カード(ダイアログ本体)内の mousedown では閉じない
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    // 背景(バックドロップ)の mousedown で閉じる
    const backdrop = document.querySelector('.dialog-backdrop')
    expect(backdrop).not.toBeNull()
    fireEvent.mouseDown(backdrop as Element)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
