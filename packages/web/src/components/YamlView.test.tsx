/**
 * YamlView(YAML テキストエディタビュー)のコンポーネントテスト。
 * 初期表示(spec の YAML 化)、編集による dirty 状態、[適用] のパース/検証と
 * エラー表示(モデルは変更しない)、[破棄して再生成] の復元を検証する。
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import YamlView from './YamlView'
import type { TaskSpec } from '@taskaror/core/types/taskspec'

const spec: TaskSpec = {
  taskspec: '1.0',
  info: { title: 'テスト' },
  tasks: [{ id: 'a', title: 'タスクA' }],
}

/** ビューを描画して textarea とモックの onApply を返す */
function renderView() {
  const onApply = vi.fn()
  render(<YamlView spec={spec} baseDoc={null} onApply={onApply} />)
  const textarea = screen.getByRole('textbox', {
    name: 'YAML エディタ',
  }) as HTMLTextAreaElement
  return { onApply, textarea }
}

describe('YamlView', () => {
  it('現在の spec の YAML が表示され、未編集の間は[適用]できない', () => {
    const { textarea } = renderView()

    expect(textarea.value).toContain('taskspec: "1.0"')
    expect(textarea.value).toContain('title: テスト')
    expect(textarea.value).toContain('id: a')
    expect(screen.getByRole('button', { name: '適用' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: '破棄して再生成' }),
    ).toBeDisabled()
  })

  it('編集すると dirty になり[適用]が有効になる', async () => {
    const user = userEvent.setup()
    const { textarea } = renderView()

    await user.type(textarea, '# コメント追記')

    expect(screen.getByText('未適用の編集があります')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '適用' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '破棄して再生成' })).toBeEnabled()
  })

  it('妥当な YAML の[適用]で onApply にパース結果が渡る', async () => {
    const user = userEvent.setup()
    const { onApply, textarea } = renderView()

    const replacement = [
      "taskspec: '1.0'",
      'info:',
      '  title: 差し替え',
      'tasks:',
      '  - id: b',
      '    title: タスクB',
      '',
    ].join('\n')
    await user.clear(textarea)
    await user.paste(replacement)
    await user.click(screen.getByRole('button', { name: '適用' }))

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        taskspec: '1.0',
        info: { title: '差し替え' },
        tasks: [{ id: 'b', title: 'タスクB' }],
      }),
      expect.anything(),
    )
    // 適用が済むと dirty が解除され、[適用] は再び無効になる
    expect(screen.getByRole('button', { name: '適用' })).toBeDisabled()
  })

  it('構文エラーの YAML はエラー表示になり反映されない', async () => {
    const user = userEvent.setup()
    const { onApply, textarea } = renderView()

    await user.clear(textarea)
    await user.paste('tasks: [')
    await user.click(screen.getByRole('button', { name: '適用' }))

    expect(onApply).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'ファイルを読み込めませんでした',
    )
    // エラー時も編集テキストは保持される
    expect(textarea.value).toBe('tasks: [')

    // 編集を再開するとエラーバナーは消える
    await user.type(textarea, ']')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('検証エラーはパス付きの一覧表示になり反映されない', async () => {
    const user = userEvent.setup()
    const { onApply, textarea } = renderView()

    // 構文は妥当だが、depends の参照先が存在しない
    const invalid = [
      "taskspec: '1.0'",
      'tasks:',
      '  - id: a',
      '    title: タスクA',
      '    depends:',
      '      - missing',
      '',
    ].join('\n')
    await user.clear(textarea)
    await user.paste(invalid)
    await user.click(screen.getByRole('button', { name: '適用' }))

    expect(onApply).not.toHaveBeenCalled()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('ファイルの内容が TaskSpec として不正です')
    expect(alert).toHaveTextContent('依存先のタスク "missing" が見つかりません')
  })

  it('[破棄して再生成]で元のテキストに戻る', async () => {
    const user = userEvent.setup()
    const { textarea } = renderView()
    const original = textarea.value

    await user.clear(textarea)
    await user.paste('壊れた編集内容')
    await user.click(screen.getByRole('button', { name: '破棄して再生成' }))

    expect(textarea.value).toBe(original)
    expect(screen.getByRole('button', { name: '適用' })).toBeDisabled()
  })
})
