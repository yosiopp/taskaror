/**
 * 読み込んだ YAML の忠実性(コメント・キー順・引用符スタイルの保持)を担うモジュール。
 * React/ブラウザ非依存の純粋 TypeScript。
 *
 * 方針: 編集モデル(reducer)はプレーンオブジェクトのまま扱い、忠実性はシリアライズ層
 * だけで実現する。読み込み時に「編集用のプレーンオブジェクト(spec)」と「コメント等を
 * 保持した元 Document(doc)」の両方を保持し、保存/YAML ビュー生成時に spec を doc の
 * クローンへ差分適用(reconcile)して stringify する。これにより変更していない部分の
 * コメント・引用符スタイル・キー順が保たれる。
 *
 * TaskSpec は形が小さく既知なので、汎用の YAML 差分ではなく専用の reconcile を実装する。
 * tasks は「id で元 Document のノードと突き合わせる」ことで、並び替え・インデント/
 * アウトデントされても同じ id に紐づくコメント等が保たれる。
 *
 * 忠実性の限界(原理的に完全ではない点):
 * - 値が変わったスカラーは元ノードの引用符スタイルを可能な限り引き継ぐが、配列・オブジェクト
 *   のフィールドは変更時にノードごと作り直すため、要素単位の引用符スタイル/コメントは失われる。
 * - ブロックシーケンスの「先頭要素の直前コメント」は yaml では要素ではなくシーケンス側に
 *   付くため、先頭タスクの直前コメントは並び替えても先頭位置に留まる(要素には追従しない)。
 * - 元 Document に存在しなかった info/tasks キーを新規追加する場合、挿入位置は末尾になる。
 */
import { isMap, isScalar, isSeq, parseDocument } from 'yaml'
import type { Document, YAMLMap, YAMLSeq } from 'yaml'
import type { Task, TaskSpec } from '../types/taskspec'
import { parseTaskSpec } from './taskspec'

/**
 * YAML 文字列を「編集用のプレーンオブジェクト(spec)」と「コメント等を保持した元
 * Document(doc)」の両方として読み込む。検証(バージョン・tasks 配列)は parseTaskSpec を
 * 流用するため、不正な入力では parseTaskSpec と同じ TaskSpecError を投げる。
 */
export function parseTaskSpecDocument(source: string): {
  spec: TaskSpec
  doc: Document
} {
  // 先に parseTaskSpec で検証する(構文/構造が不正ならここで throw する)。
  const spec = parseTaskSpec(source)
  // 検証を通った時点で構文は妥当なので、parseDocument は忠実な Document を返す。
  const doc = parseDocument(source)
  return { spec, doc }
}

/**
 * 編集後の spec を、クローン済みのベース Document(doc)へ差分適用する(破壊的)。
 * doc は呼び出し側で clone 済みであることを前提とする(元 Document は変更しない)。
 */
export function reconcileDocument(doc: Document, spec: TaskSpec): void {
  const root = doc.contents
  if (!isMap(root)) {
    // ルートがマップでない(空/異常)場合は差分適用できない。
    // 呼び出し側(serializeTaskSpec)で plain stringify にフォールバックする想定。
    return
  }
  // ベース Document 全体のタスクノードを id で引ける索引を作る。tasks は階層をまたいで
  // id で突き合わせるため、並び替えだけでなくインデント/アウトデント(別の親への移動)でも
  // 同じ id のノード(コメント等)を再利用できる。id はタスク全体で一意である前提。
  const nodeById = new Map<string, YAMLMap>()
  indexTaskNodes(root.get('tasks'), nodeById)

  // taskspec など(info/tasks 以外)のスカラーを更新する。
  reconcileFields(doc, root, toRecord(spec), ROOT_SPECIAL_KEYS)

  // info: 消えていれば削除、あれば title 等を reconcile、元に無ければ新規追加する。
  if (spec.info === undefined) {
    if (root.has('info')) root.delete('info')
  } else {
    const infoNode = root.get('info')
    if (isMap(infoNode)) {
      reconcileFields(doc, infoNode, toRecord(spec.info), EMPTY_KEYS)
    } else {
      root.set('info', doc.createNode(spec.info))
    }
  }

  // tasks: id 突き合わせで再構成する。
  reconcileTasks(doc, root, spec.tasks, nodeById)
}

/** ベース Document のタスクノードを id → ノードで索引する(階層を再帰的にたどる)。 */
function indexTaskNodes(seq: unknown, into: Map<string, YAMLMap>): void {
  if (!isSeq(seq)) return
  for (const item of seq.items) {
    if (isMap(item)) {
      const id = item.get('id')
      // 同じ id が複数あるのは不正だが、防御的に最初のものを採用する。
      if (typeof id === 'string' && !into.has(id)) into.set(id, item)
      indexTaskNodes(item.get('tasks'), into)
    }
  }
}

const ROOT_SPECIAL_KEYS: ReadonlySet<string> = new Set(['info', 'tasks'])
const TASK_SPECIAL_KEYS: ReadonlySet<string> = new Set(['tasks'])
const EMPTY_KEYS: ReadonlySet<string> = new Set()

/**
 * map のスカラー/配列フィールドを obj に一致させる(special のキーは別処理のため対象外)。
 * 値が変わっていないフィールドはベースのノード(引用符スタイル・コメント)をそのまま残す。
 */
function reconcileFields(
  doc: Document,
  map: YAMLMap,
  obj: Record<string, unknown>,
  special: ReadonlySet<string>,
): void {
  // obj に存在しないキーを削除する(special は触らない)。
  for (const key of mapKeys(map)) {
    if (special.has(key)) continue
    if (!(key in obj)) map.delete(key)
  }
  // obj のキーを追加・更新する。
  for (const [key, value] of Object.entries(obj)) {
    if (special.has(key)) continue
    if (value === undefined) {
      map.delete(key)
      continue
    }
    // 値が変わっていなければベースのノードをそのまま残す(引用符スタイル等の保持)。
    if (map.has(key) && deepEqual(currentFieldValue(map, key), value)) continue
    setField(doc, map, key, value)
  }
}

/**
 * parentMap の tasks を desired(編集後のタスク配列)に合わせて再構成する。
 * nodeById(ベース Document 全体の id 索引)で既存ノードを突き合わせ、desired の順序で
 * 並べ替える。既存 id は reconcile して再利用(コメント等を保持)、新規 id はノードを生成、
 * desired に無い id は結果に含めない(= 取り除く)。別の親へ移動した id も索引から
 * 再利用されるため、インデント/アウトデントでもコメントが追従する。
 */
function reconcileTasks(
  doc: Document,
  parentMap: YAMLMap,
  desired: Task[] | undefined,
  nodeById: Map<string, YAMLMap>,
): void {
  const tasks = desired ?? []
  if (tasks.length === 0) {
    if (parentMap.has('tasks')) parentMap.delete('tasks')
    return
  }
  // desired の順序で、既存ノードは再利用(reconcile)・新規は生成する。
  const nextItems: unknown[] = tasks.map((task) => {
    const existing = nodeById.get(task.id)
    if (existing) {
      reconcileTaskMap(doc, existing, task, nodeById)
      return existing
    }
    return doc.createNode(task)
  })
  const raw = parentMap.get('tasks')
  let seq: YAMLSeq
  if (isSeq(raw)) {
    seq = raw
  } else {
    // ベースに tasks が無い/シーケンスでない場合は空のブロックシーケンスを作る
    // (要素は既存ノードを含みうるので createNode(tasks) では作り直さない)。
    seq = doc.createNode([]) as YAMLSeq
    seq.flow = false
    parentMap.set('tasks', seq)
  }
  seq.items = nextItems as typeof seq.items
}

/** 1 タスク分の map を task に合わせて更新する(フィールド → 子 tasks の順)。 */
function reconcileTaskMap(
  doc: Document,
  map: YAMLMap,
  task: Task,
  nodeById: Map<string, YAMLMap>,
): void {
  reconcileFields(doc, map, toRecord(task), TASK_SPECIAL_KEYS)
  reconcileTasks(doc, map, task.tasks, nodeById)
}

/**
 * map の key に値を設定する。
 * 既存がスカラーで新値もプリミティブなら、元ノード(引用符スタイル・コメント)を保ったまま
 * 値だけ差し替える。それ以外(新規キー・型変更・配列/オブジェクト)はノードを作り直す。
 */
function setField(
  doc: Document,
  map: YAMLMap,
  key: string,
  value: unknown,
): void {
  const prev = map.get(key, true)
  if (isScalar(prev) && isPrimitive(value)) {
    prev.value = value
    return
  }
  map.set(key, doc.createNode(value))
}

/** map の(スカラー)キー一覧を JS 文字列で返す。 */
function mapKeys(map: YAMLMap): string[] {
  const keys: string[] = []
  for (const pair of map.items) {
    const k = pair.key
    if (isScalar(k) && typeof k.value === 'string') keys.push(k.value)
    else if (typeof k === 'string') keys.push(k)
  }
  return keys
}

/** map[key] の現在値を比較用の JS 値へ変換する(スカラーは値、コレクションは JSON 化)。 */
function currentFieldValue(map: YAMLMap, key: string): unknown {
  const raw = map.get(key)
  if (
    raw !== null &&
    typeof raw === 'object' &&
    'toJSON' in raw &&
    typeof (raw as { toJSON: unknown }).toJSON === 'function'
  ) {
    return (raw as { toJSON: () => unknown }).toJSON()
  }
  return raw
}

/** null / プリミティブ(オブジェクト・関数でない)か。 */
function isPrimitive(value: unknown): boolean {
  return (
    value === null || (typeof value !== 'object' && typeof value !== 'function')
  )
}

/** JSON 相当の値の深い等価判定(未変更フィールドの検出に使う)。 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false
  const aArr = Array.isArray(a)
  const bArr = Array.isArray(b)
  if (aArr || bArr) {
    if (!aArr || !bArr || a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }
  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const ak = Object.keys(ao)
  const bk = Object.keys(bo)
  if (ak.length !== bk.length) return false
  return ak.every((k) => k in bo && deepEqual(ao[k], bo[k]))
}

/** 型付きオブジェクトを reconcile 用の Record として扱う(実体は変えない)。 */
function toRecord(value: object): Record<string, unknown> {
  return value as Record<string, unknown>
}
