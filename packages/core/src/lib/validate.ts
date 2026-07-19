import Ajv2020 from 'ajv/dist/2020'
import type { ErrorObject, ValidateFunction } from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import schema from '../../../../schema/1.0/taskspec.schema.json'
import type { TaskSpec } from '../types/taskspec'
import { collectTaskNodes } from './taskspec'
import type { TaskNode } from './taskspec'

/**
 * 検証で見つかった 1 件の問題。
 * path は YAML ドキュメント上の位置(例: `tasks[0].estimate`)、
 * message は日本語の説明文。
 */
export interface ValidationIssue {
  path: string
  message: string
}

let validator: ValidateFunction | null = null

function getValidator(): ValidateFunction {
  if (validator === null) {
    const ajv = new Ajv2020({ allErrors: true })
    addFormats(ajv)
    validator = ajv.compile(schema)
  }
  return validator
}

/**
 * JSON Schema(schema/1.0/taskspec.schema.json)による検証を行い、
 * Ajv のエラーを日本語メッセージ+ドキュメント上のパスに変換して返す。
 * 問題がなければ空配列を返す。
 */
export function validateSchema(data: unknown): ValidationIssue[] {
  const validate = getValidator()
  if (validate(data)) return []
  return (validate.errors ?? []).map(describeSchemaError)
}

/**
 * スキーマでは表現できない構造検証(id の重複・depends の参照先・依存の循環)。
 * 型として妥当な TaskSpec を前提とする。将来の CLI validator でもそのまま再利用する。
 */
export function validateStructure(spec: TaskSpec): ValidationIssue[] {
  const nodes = collectTaskNodes(spec.tasks)
  return [
    ...checkDuplicateIds(nodes),
    ...checkDependencyRefs(nodes),
    ...checkDependencyCycles(nodes),
  ]
}

/**
 * スキーマ検証と構造検証をまとめて実行する。
 * スキーマ検証で問題が見つかった場合、構造は前提を満たさないため
 * その時点のエラーだけを返す。
 */
export function validateTaskSpec(data: unknown): ValidationIssue[] {
  const schemaIssues = validateSchema(data)
  if (schemaIssues.length > 0) return schemaIssues
  return validateStructure(data as TaskSpec)
}

// --- Ajv エラーの日本語化 ---

function describeSchemaError(error: ErrorObject): ValidationIssue {
  const path = pointerToPath(error.instancePath)
  const params = error.params as Record<string, unknown>

  switch (error.keyword) {
    case 'required':
      return {
        path: joinPath(path, String(params.missingProperty)),
        message: `${String(params.missingProperty)} は必須です`,
      }
    case 'additionalProperties':
      return {
        path: joinPath(path, String(params.additionalProperty)),
        message: `許可されていないプロパティです: ${String(params.additionalProperty)}`,
      }
    case 'type':
      return {
        path,
        message: `型が正しくありません(期待: ${String(params.type)})`,
      }
    case 'const':
      return {
        path,
        message: `値は ${JSON.stringify(params.allowedValue)} である必要があります`,
      }
    case 'pattern':
      return { path, message: patternMessage(error.instancePath) }
    case 'format':
      return {
        path,
        message:
          params.format === 'date'
            ? '日付の形式が正しくありません(YYYY-MM-DD)'
            : `形式が正しくありません(${String(params.format)})`,
      }
    case 'minLength':
      return {
        path,
        message:
          params.limit === 1
            ? '空文字は指定できません'
            : `${String(params.limit)} 文字以上で指定してください`,
      }
    case 'minimum':
      return {
        path,
        message: `${String(params.limit)} 以上である必要があります`,
      }
    case 'maximum':
      return {
        path,
        message: `${String(params.limit)} 以下である必要があります`,
      }
    case 'uniqueItems':
      return { path, message: '重複した要素が含まれています' }
    default:
      return { path, message: error.message ?? '不正な値です' }
  }
}

/** pattern 違反はフィールドごとに具体的な説明を返す */
function patternMessage(instancePath: string): string {
  const field = instancePath.split('/').pop()
  if (field === 'estimate') {
    return '見積工数の形式が正しくありません(整数部 4 桁までの数値 + h/d。例: "1.5d", "4h")'
  }
  if (field === 'id') {
    return 'id は英字で始まり、以降は英数字・ドット・ハイフン・アンダースコアのみ使用できます'
  }
  return '値の形式が正しくありません'
}

/** JSON Pointer(例: /tasks/0/estimate)を読みやすいパス(tasks[0].estimate)に変換 */
function pointerToPath(pointer: string): string {
  if (pointer === '') return '(ルート)'
  let path = ''
  for (const raw of pointer.split('/').slice(1)) {
    const segment = raw.replace(/~1/g, '/').replace(/~0/g, '~')
    path = /^\d+$/.test(segment)
      ? `${path}[${segment}]`
      : path === ''
        ? segment
        : `${path}.${segment}`
  }
  return path
}

function joinPath(base: string, key: string): string {
  if (base === '(ルート)') return key
  return `${base}.${key}`
}

// --- 構造検証 ---
// タスクの平坦化(位置パス付き)は taskspec.ts の collectTaskNodes を共用する
// (ancestorIds はここでは使わない)。

function checkDuplicateIds(nodes: TaskNode[]): ValidationIssue[] {
  const seen = new Set<string>()
  const issues: ValidationIssue[] = []
  for (const { task, path } of nodes) {
    if (seen.has(task.id)) {
      issues.push({
        path: `${path}.id`,
        message: `id "${task.id}" が重複しています(全タスクでユニークにしてください)`,
      })
    } else {
      seen.add(task.id)
    }
  }
  return issues
}

function checkDependencyRefs(nodes: TaskNode[]): ValidationIssue[] {
  const ids = new Set(nodes.map((n) => n.task.id))
  const issues: ValidationIssue[] = []
  for (const { task, path } of nodes) {
    task.depends?.forEach((dep, index) => {
      if (!ids.has(dep)) {
        issues.push({
          path: `${path}.depends[${index}]`,
          message: `依存先のタスク "${dep}" が見つかりません`,
        })
      }
    })
  }
  return issues
}

function checkDependencyCycles(nodes: TaskNode[]): ValidationIssue[] {
  const ids = new Set(nodes.map((n) => n.task.id))
  const firstPath = new Map<string, string>()
  const graph = new Map<string, Set<string>>()
  for (const { task, path } of nodes) {
    if (!firstPath.has(task.id)) firstPath.set(task.id, path)
    const edges = graph.get(task.id) ?? new Set<string>()
    for (const dep of task.depends ?? []) {
      // 存在しない依存先は checkDependencyRefs 側で報告するため無視する
      if (ids.has(dep)) edges.add(dep)
    }
    graph.set(task.id, edges)
  }

  const issues: ValidationIssue[] = []
  const reported = new Set<string>()
  const state = new Map<string, 'visiting' | 'done'>()
  const stack: string[] = []

  const visit = (id: string): void => {
    state.set(id, 'visiting')
    stack.push(id)
    for (const next of graph.get(id) ?? []) {
      const s = state.get(next)
      if (s === undefined) {
        visit(next)
      } else if (s === 'visiting') {
        const cycle = stack.slice(stack.indexOf(next))
        const key = cycleKey(cycle)
        if (!reported.has(key)) {
          reported.add(key)
          issues.push({
            path: firstPath.get(cycle[0]) ?? 'tasks',
            message: `依存関係が循環しています: ${[...cycle, cycle[0]].join(' → ')}`,
          })
        }
      }
    }
    stack.pop()
    state.set(id, 'done')
  }

  for (const id of graph.keys()) {
    if (!state.has(id)) visit(id)
  }
  return issues
}

/** 回転しても同じ循環を同一視するための正規化キー */
function cycleKey(cycle: string[]): string {
  let min = 0
  for (let i = 1; i < cycle.length; i++) {
    if (cycle[i] < cycle[min]) min = i
  }
  return [...cycle.slice(min), ...cycle.slice(0, min)].join('→')
}
