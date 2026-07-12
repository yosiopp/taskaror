import { describe, expect, it } from 'vitest'
import type { Task, TaskSpec } from '../types/taskspec'
import {
  collectAncestors,
  collectIds,
  editorReducer,
  generateTaskId,
  moveTaskTo,
  newTask,
  type EditorAction,
} from './editor'
import { flattenTasks } from './taskspec'

function spec(tasks: Task[]): TaskSpec {
  return { taskspec: '1.0', tasks }
}

function reduce(base: TaskSpec, ...actions: EditorAction[]): TaskSpec {
  return actions.reduce(editorReducer, base)
}

/** ツリーを "id(child,child)" 形式の文字列にして構造を検証しやすくする */
function shape(tasks: Task[]): string {
  return tasks
    .map((task) => (task.tasks ? `${task.id}(${shape(task.tasks)})` : task.id))
    .join(',')
}

describe('generateTaskId', () => {
  it('t- + 英数字 4 文字を生成する', () => {
    const id = generateTaskId(new Set())
    expect(id).toMatch(/^t-[a-z0-9]{4}$/)
  })

  it('衝突したら再生成する', () => {
    // 最初の 4 回は 'a'(=> t-aaaa 衝突)、その後 'b' を返す乱数
    const values = [0, 0, 0, 0, 0.05, 0.05, 0.05, 0.05]
    let i = 0
    const random = () => values[i++] ?? 0.05
    const id = generateTaskId(new Set(['t-aaaa']), random)
    expect(id).toBe('t-bbbb')
  })
})

describe('collectIds', () => {
  it('全階層の id を集める', () => {
    const ids = collectIds([
      { id: 'a', title: 'A', tasks: [{ id: 'a1', title: 'A1' }] },
      { id: 'b', title: 'B' },
    ])
    expect(ids).toEqual(new Set(['a', 'a1', 'b']))
  })
})

describe('newTask', () => {
  it('未使用 id と既定タイトルの空タスクを作る', () => {
    const s = spec([{ id: 'a', title: 'A' }])
    const task = newTask(s)
    expect(task.title).toBe('新しいタスク')
    expect(collectIds(s.tasks).has(task.id)).toBe(false)
  })
})

describe('editorReducer: 追加', () => {
  const base = spec([
    { id: 'a', title: 'A' },
    { id: 'b', title: 'B' },
  ])

  it('ルート末尾に追加する', () => {
    const next = editorReducer(base, {
      type: 'addTask',
      task: { id: 'c', title: 'C' },
      mode: 'root-append',
    })
    expect(shape(next.tasks)).toBe('a,b,c')
  })

  it('指定タスクの子として追加する', () => {
    const next = editorReducer(base, {
      type: 'addTask',
      task: { id: 'a1', title: 'A1' },
      mode: 'child',
      targetId: 'a',
    })
    expect(shape(next.tasks)).toBe('a(a1),b')
  })

  it('指定タスクの直後に兄弟として追加する', () => {
    const next = editorReducer(base, {
      type: 'addTask',
      task: { id: 'a2', title: 'A2' },
      mode: 'sibling-after',
      targetId: 'a',
    })
    expect(shape(next.tasks)).toBe('a,a2,b')
  })
})

describe('editorReducer: 削除', () => {
  it('タスクと子孫を削除する', () => {
    const base = spec([
      { id: 'a', title: 'A', tasks: [{ id: 'a1', title: 'A1' }] },
      { id: 'b', title: 'B' },
    ])
    const next = editorReducer(base, { type: 'removeTask', id: 'a' })
    expect(shape(next.tasks)).toBe('b')
  })

  it('削除したタスクへの depends 参照も取り除く', () => {
    const base = spec([
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B', depends: ['a', 'x'] },
      { id: 'c', title: 'C', depends: ['a'] },
    ])
    const next = editorReducer(base, { type: 'removeTask', id: 'a' })
    expect(next.tasks.find((t) => t.id === 'b')?.depends).toEqual(['x'])
    // depends が空になったらキーごと消す
    expect(next.tasks.find((t) => t.id === 'c')?.depends).toBeUndefined()
  })
})

describe('editorReducer: フィールド編集', () => {
  const base = spec([{ id: 'a', title: 'A', estimate: '1d' }])

  it('フィールドを更新する', () => {
    const next = editorReducer(base, {
      type: 'updateTask',
      id: 'a',
      changes: { title: 'AA', estimate: '2d', progress: 50 },
    })
    expect(next.tasks[0]).toMatchObject({
      title: 'AA',
      estimate: '2d',
      progress: 50,
    })
  })

  it('空値を渡すと任意フィールドを削除する', () => {
    const next = editorReducer(base, {
      type: 'updateTask',
      id: 'a',
      changes: { estimate: '', assignees: [] },
    })
    expect(next.tasks[0].estimate).toBeUndefined()
    expect(next.tasks[0].assignees).toBeUndefined()
  })
})

describe('editorReducer: 階層変更', () => {
  it('インデントで直前の兄弟の子にする', () => {
    const base = spec([
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
    ])
    const next = editorReducer(base, { type: 'indentTask', id: 'b' })
    expect(shape(next.tasks)).toBe('a(b)')
  })

  it('先頭タスクのインデントは無効', () => {
    const base = spec([
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
    ])
    const next = editorReducer(base, { type: 'indentTask', id: 'a' })
    expect(shape(next.tasks)).toBe('a,b')
  })

  it('アウトデントで親の次の兄弟にする', () => {
    const base = spec([
      {
        id: 'a',
        title: 'A',
        tasks: [
          { id: 'a1', title: 'A1' },
          { id: 'a2', title: 'A2' },
        ],
      },
      { id: 'b', title: 'B' },
    ])
    const next = editorReducer(base, { type: 'outdentTask', id: 'a1' })
    expect(shape(next.tasks)).toBe('a(a2),a1,b')
  })

  it('唯一の子をアウトデントすると親の tasks が消える', () => {
    const base = spec([
      { id: 'a', title: 'A', tasks: [{ id: 'a1', title: 'A1' }] },
    ])
    const next = editorReducer(base, { type: 'outdentTask', id: 'a1' })
    expect(shape(next.tasks)).toBe('a,a1')
    expect(next.tasks[0].tasks).toBeUndefined()
  })

  it('ルート直下のタスクのアウトデントは無効', () => {
    const base = spec([{ id: 'a', title: 'A' }])
    const next = editorReducer(base, { type: 'outdentTask', id: 'a' })
    expect(shape(next.tasks)).toBe('a')
  })
})

describe('editorReducer: 並び替え', () => {
  const base = spec([
    { id: 'a', title: 'A' },
    { id: 'b', title: 'B' },
    { id: 'c', title: 'C' },
  ])

  it('上に移動する', () => {
    const next = editorReducer(base, {
      type: 'moveTask',
      id: 'b',
      direction: 'up',
    })
    expect(shape(next.tasks)).toBe('b,a,c')
  })

  it('下に移動する', () => {
    const next = editorReducer(base, {
      type: 'moveTask',
      id: 'b',
      direction: 'down',
    })
    expect(shape(next.tasks)).toBe('a,c,b')
  })

  it('端を越える移動は無効', () => {
    const next = editorReducer(base, {
      type: 'moveTask',
      id: 'a',
      direction: 'up',
    })
    expect(shape(next.tasks)).toBe('a,b,c')
  })

  it('子タスクの並び替えは親の中で完結する', () => {
    const nested = spec([
      {
        id: 'p',
        title: 'P',
        tasks: [
          { id: 'x', title: 'X' },
          { id: 'y', title: 'Y' },
        ],
      },
    ])
    const next = editorReducer(nested, {
      type: 'moveTask',
      id: 'y',
      direction: 'up',
    })
    expect(shape(next.tasks)).toBe('p(y,x)')
  })
})

describe('editorReducer: moveTaskTo(ドラッグ移動)', () => {
  const base = spec([
    { id: 'a', title: 'A' },
    {
      id: 'b',
      title: 'B',
      tasks: [
        { id: 'b1', title: 'B1' },
        { id: 'b2', title: 'B2' },
      ],
    },
    { id: 'c', title: 'C' },
  ])

  const move = (
    from: TaskSpec,
    id: string,
    targetId: string,
    position: 'before' | 'after' | 'child',
  ): TaskSpec =>
    editorReducer(from, { type: 'moveTaskTo', id, targetId, position })

  it('対象の直前(兄弟)へ移動する', () => {
    const next = move(base, 'c', 'a', 'before')
    expect(shape(next.tasks)).toBe('c,a,b(b1,b2)')
  })

  it('対象の直後(兄弟)へ移動する', () => {
    const next = move(base, 'a', 'c', 'after')
    expect(shape(next.tasks)).toBe('b(b1,b2),c,a')
  })

  it('対象の子(末尾)へ移動してリペアレントする', () => {
    const next = move(base, 'a', 'b', 'child')
    expect(shape(next.tasks)).toBe('b(b1,b2,a),c')
  })

  it('別の親の子から別位置へ移動できる', () => {
    const next = move(base, 'b1', 'a', 'after')
    expect(shape(next.tasks)).toBe('a,b1,b(b2),c')
  })

  it('自分自身の子孫の中へは移動できない(無変更)', () => {
    const next = move(base, 'b', 'b1', 'child')
    expect(shape(next.tasks)).toBe('a,b(b1,b2),c')
    // 無変更のときは元の配列参照をそのまま返す
    expect(moveTaskTo(base.tasks, 'b', 'b1', 'child')).toBe(base.tasks)
  })

  it('自分自身への移動は無変更', () => {
    const next = move(base, 'a', 'a', 'before')
    expect(shape(next.tasks)).toBe('a,b(b1,b2),c')
    expect(moveTaskTo(base.tasks, 'a', 'a', 'before')).toBe(base.tasks)
  })

  it('depends 参照は移動後も保持される', () => {
    const withDeps = spec([
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B', depends: ['a'] },
      { id: 'c', title: 'C' },
    ])
    const next = move(withDeps, 'b', 'c', 'after')
    expect(shape(next.tasks)).toBe('a,c,b')
    expect(next.tasks.find((t) => t.id === 'b')?.depends).toEqual(['a'])
  })

  it('純粋関数 moveTaskTo は元の配列を破壊しない', () => {
    const tasks = base.tasks
    const before = shape(tasks)
    moveTaskTo(tasks, 'a', 'c', 'after')
    expect(shape(tasks)).toBe(before)
  })
})

describe('collectAncestors', () => {
  const tree: Task[] = [
    {
      id: 'a',
      title: 'A',
      tasks: [
        {
          id: 'a1',
          title: 'A1',
          tasks: [{ id: 'a1x', title: 'A1X' }],
        },
        { id: 'a2', title: 'A2' },
      ],
    },
    { id: 'b', title: 'B' },
  ]
  const flat = flattenTasks(tree)

  it('親〜ルートの id を集める', () => {
    expect(collectAncestors(flat, 'a1x')).toEqual(new Set(['a', 'a1']))
  })

  it('直下の子の祖先は親のみ', () => {
    expect(collectAncestors(flat, 'a2')).toEqual(new Set(['a']))
  })

  it('ルート要素に祖先はいない', () => {
    expect(collectAncestors(flat, 'a')).toEqual(new Set())
    expect(collectAncestors(flat, 'b')).toEqual(new Set())
  })

  it('存在しない id は空集合', () => {
    expect(collectAncestors(flat, 'zzz')).toEqual(new Set())
  })
})

describe('editorReducer: replaceSpec', () => {
  it('spec 全体を差し替える', () => {
    const base = spec([{ id: 'a', title: 'A' }])
    const next: TaskSpec = {
      taskspec: '1.0',
      info: { title: '新規' },
      tasks: [{ id: 'b', title: 'B' }],
    }
    const result = editorReducer(base, { type: 'replaceSpec', spec: next })
    expect(result).toBe(next)
  })
})

describe('editorReducer: info', () => {
  it('プロジェクトタイトルを設定・削除する', () => {
    const base = spec([])
    const withTitle = editorReducer(base, {
      type: 'setInfoTitle',
      title: 'テスト',
    })
    expect(withTitle.info?.title).toBe('テスト')
    const cleared = editorReducer(withTitle, {
      type: 'setInfoTitle',
      title: '',
    })
    expect(cleared.info).toBeUndefined()
  })

  it('複数編集の連鎖でツリーを組み立てられる', () => {
    const base = spec([{ id: 'a', title: 'A' }])
    const next = reduce(
      base,
      { type: 'addTask', task: { id: 'b', title: 'B' }, mode: 'root-append' },
      {
        type: 'addTask',
        task: { id: 'a1', title: 'A1' },
        mode: 'child',
        targetId: 'a',
      },
      { type: 'moveTask', id: 'b', direction: 'up' },
    )
    expect(shape(next.tasks)).toBe('b,a(a1)')
  })
})
