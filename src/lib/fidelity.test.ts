import { describe, expect, it } from 'vitest'
import type { Task, TaskSpec } from '../types/taskspec'
import { TaskSpecError, serializeTaskSpec } from './taskspec'
import { parseTaskSpecDocument } from './fidelity'

/** コメント・引用符スタイル・キー順・空行を含むベース YAML */
const BASE = `taskspec: '1.0'

info:
  title: ECサイト構築

tasks:
  - id: design
    title: 設計
    tasks:
      - id: api
        title: API設計
        estimate: 1.5d
        assignees:
          - tanaka
        progress: 50
      # DB のコメント
      - id: db
        title: DB設計
        estimate: 4h

  - id: implementation
    title: 実装
    depends:
      - design
    x-ticket: DEV-123
`

/** ベース YAML を読み込み、編集用 spec のディープコピーとベース Document を返す */
function load(source = BASE): {
  spec: TaskSpec
  doc: ReturnType<typeof parseTaskSpecDocument>['doc']
} {
  const { spec, doc } = parseTaskSpecDocument(source)
  return { spec: structuredClone(spec), doc }
}

/** 全階層から id で 1 タスクを探す(テスト用) */
function findTask(tasks: Task[], id: string): Task {
  for (const task of tasks) {
    if (task.id === id) return task
    if (task.tasks) {
      const found = tryFind(task.tasks, id)
      if (found) return found
    }
  }
  throw new Error(`task not found: ${id}`)
}
function tryFind(tasks: Task[], id: string): Task | undefined {
  for (const task of tasks) {
    if (task.id === id) return task
    if (task.tasks) {
      const found = tryFind(task.tasks, id)
      if (found) return found
    }
  }
  return undefined
}

describe('parseTaskSpecDocument', () => {
  it('spec とベース Document の両方を返す', () => {
    const { spec, doc } = parseTaskSpecDocument(BASE)
    expect(spec.info?.title).toBe('ECサイト構築')
    expect(findTask(spec.tasks, 'api').estimate).toBe('1.5d')
    // Document はコメントを保持している
    expect(doc.toString()).toContain('# DB のコメント')
  })

  it('検証エラーは parseTaskSpec と同じく TaskSpecError を投げる', () => {
    expect(() => parseTaskSpecDocument('taskspec: "2.0"\ntasks: []\n')).toThrow(
      TaskSpecError,
    )
    expect(() => parseTaskSpecDocument('tasks: []\n')).toThrow(TaskSpecError)
  })
})

describe('serializeTaskSpec(baseDoc なし)', () => {
  it('baseDoc を渡さなければ従来どおり plain stringify する', () => {
    const spec: TaskSpec = {
      taskspec: '1.0',
      tasks: [{ id: 'a', title: 'タスクA' }],
    }
    // コメントも引用符スタイルも持たない素の出力
    expect(serializeTaskSpec(spec)).toBe(
      'taskspec: "1.0"\ntasks:\n  - id: a\n    title: タスクA\n',
    )
  })
})

describe('serializeTaskSpec(忠実性)', () => {
  it('未変更部分のコメント・引用符スタイル・キー順を保ち、変更値を反映する', () => {
    const { spec, doc } = load()
    findTask(spec.tasks, 'api').title = '外部API設計'
    findTask(spec.tasks, 'api').estimate = '2d'

    const out = serializeTaskSpec(spec, doc)

    // 変更が反映される
    expect(out).toContain('title: 外部API設計')
    expect(out).toContain('estimate: 2d')
    // 未変更部分のコメントが残る
    expect(out).toContain('# DB のコメント')
    // 未変更フィールドの引用符スタイルが保たれる(taskspec は単一引用符のまま)
    expect(out).toContain("taskspec: '1.0'")
    // 未変更フィールドのキー順が保たれる(api の後に assignees→progress)
    const apiBlock = out.slice(out.indexOf('id: api'))
    expect(apiBlock.indexOf('assignees')).toBeLessThan(
      apiBlock.indexOf('progress'),
    )
  })

  it('変更していないタスクは元の表現のまま(idempotent)', () => {
    const { spec, doc } = load()
    // 何も編集しない
    const out = serializeTaskSpec(spec, doc)
    expect(out).toBe(BASE)
  })

  it('タスクを並び替えても非先頭タスクのコメントが id に追従する', () => {
    const { spec, doc } = load()
    // design の子(api, db)を入れ替える。db は「# DB のコメント」を持つ
    const design = findTask(spec.tasks, 'design')
    const children = design.tasks!
    design.tasks = [children[1], children[0]] // db, api

    const out = serializeTaskSpec(spec, doc)

    const dbIndex = out.indexOf('id: db')
    const apiIndex = out.indexOf('id: api')
    // 並び替えが反映される(db が先)
    expect(dbIndex).toBeLessThan(apiIndex)
    // db のコメントが db ノードに追従する(db の直前に移動している)
    const commentIndex = out.indexOf('# DB のコメント')
    expect(commentIndex).toBeGreaterThan(0)
    expect(commentIndex).toBeLessThan(dbIndex)
    // コメントと db の間に他のタスクを挟まない(直前に付いている)
    expect(out.slice(commentIndex, dbIndex)).not.toContain('id:')
  })

  it('フィールドの追加が反映される(未変更部分は保持)', () => {
    const { spec, doc } = load()
    findTask(spec.tasks, 'db').assignees = ['sato']

    const out = serializeTaskSpec(spec, doc)

    expect(out).toContain('- sato')
    // 追加しても他のコメント・スタイルは保たれる
    expect(out).toContain('# DB のコメント')
    expect(out).toContain("taskspec: '1.0'")
  })

  it('フィールドの削除が反映される', () => {
    const { spec, doc } = load()
    delete findTask(spec.tasks, 'api').progress

    const out = serializeTaskSpec(spec, doc)

    expect(out).not.toContain('progress: 50')
    // 兄弟の estimate 等は残る
    expect(out).toContain('estimate: 1.5d')
  })

  it('配列フィールドの変更が反映される', () => {
    const { spec, doc } = load()
    findTask(spec.tasks, 'api').assignees = ['tanaka', 'suzuki']

    const out = serializeTaskSpec(spec, doc)

    expect(out).toContain('- tanaka')
    expect(out).toContain('- suzuki')
  })

  it('新規タスクを追加できる(既存のコメント等は保持)', () => {
    const { spec, doc } = load()
    const created: Task = { id: 'infra', title: 'インフラ', estimate: '3d' }
    spec.tasks.push(created)

    const out = serializeTaskSpec(spec, doc)

    expect(out).toContain('id: infra')
    expect(out).toContain('title: インフラ')
    expect(out).toContain('estimate: 3d')
    // 既存のコメントは保たれる
    expect(out).toContain('# DB のコメント')
    // 追加した spec は再パースして等価に読み戻せる
    expect(parseTaskSpecDocument(out).spec).toEqual(spec)
  })

  it('タスクを削除できる(残りのコメント等は保持)', () => {
    const { spec, doc } = load()
    // implementation を削除。design の depends 先ではないので単純削除
    spec.tasks = spec.tasks.filter((t) => t.id !== 'implementation')

    const out = serializeTaskSpec(spec, doc)

    expect(out).not.toContain('id: implementation')
    expect(out).not.toContain('x-ticket: DEV-123')
    // 残りは保たれる
    expect(out).toContain('# DB のコメント')
    expect(out).toContain('id: design')
  })

  it('子タスクを削除して親から tasks キーが消える', () => {
    const { spec, doc } = load()
    delete findTask(spec.tasks, 'design').tasks

    const out = serializeTaskSpec(spec, doc)

    expect(out).not.toContain('id: api')
    expect(out).not.toContain('id: db')
    expect(out).toContain('id: design')
    // design 直下の tasks キーは消える
    const { spec: reparsed } = parseTaskSpecDocument(out)
    expect(findTask(reparsed.tasks, 'design').tasks).toBeUndefined()
  })

  it('info.title の変更が反映され、コメント等は保持される', () => {
    const { spec, doc } = load()
    spec.info = { title: '在庫管理システム' }

    const out = serializeTaskSpec(spec, doc)

    expect(out).toContain('title: 在庫管理システム')
    expect(out).not.toContain('title: ECサイト構築')
    expect(out).toContain('# DB のコメント')
  })

  it('info を削除すると info キーが消える', () => {
    const { spec, doc } = load()
    delete spec.info

    const out = serializeTaskSpec(spec, doc)

    expect(out).not.toContain('info:')
    expect(out).not.toContain('ECサイト構築')
    // tasks 側は保たれる
    expect(out).toContain('# DB のコメント')
  })

  it('x- 拡張フィールドの変更が反映される', () => {
    const { spec, doc } = load()
    findTask(spec.tasks, 'implementation')['x-ticket'] = 'DEV-999'

    const out = serializeTaskSpec(spec, doc)

    expect(out).toContain('x-ticket: DEV-999')
    expect(out).not.toContain('DEV-123')
  })

  it('インデント(階層変更)しても id のコメントが追従する', () => {
    const { spec, doc } = load()
    // db を design の子から取り出し、api の子にする(db はコメント付き)
    const design = findTask(spec.tasks, 'design')
    const api = findTask(spec.tasks, 'api')
    const db = findTask(spec.tasks, 'db')
    design.tasks = design.tasks!.filter((t) => t.id !== 'db')
    api.tasks = [db]

    const out = serializeTaskSpec(spec, doc)

    // db は api の子に移動し、コメントも一緒に移動する
    const apiIndex = out.indexOf('id: api')
    const dbIndex = out.indexOf('id: db')
    const commentIndex = out.indexOf('# DB のコメント')
    expect(dbIndex).toBeGreaterThan(apiIndex)
    expect(commentIndex).toBeGreaterThan(apiIndex)
    expect(commentIndex).toBeLessThan(dbIndex)
    // 再パースして構造が編集後 spec と一致する
    expect(parseTaskSpecDocument(out).spec).toEqual(spec)
  })
})
