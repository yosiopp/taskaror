// spec ファイル読み込みの共通処理。validate / svg(および後続の lint)で共用する。
// ファイル読み込み → YAML パース(@taskaror/core の parseTaskSpec)までを担い、
// 失敗はすべて日本語メッセージ付きの ok: false として返す(throw しない)。
// web(App.tsx の loadFromText)と同じく、この後の検証は validateTaskSpec で行う。
import { readFileSync } from 'node:fs'
import { parseTaskSpec, TaskSpecError } from '@taskaror/core/taskspec'
import type { TaskSpec } from '@taskaror/core/types/taskspec'

/** spec ファイルの読み込み結果。失敗時は利用者向けの日本語メッセージを持つ */
export type SpecFileResult =
  { ok: true; spec: TaskSpec } | { ok: false; message: string }

/**
 * spec ファイルを読み込んで TaskSpec として返す。
 * 読み込み失敗・YAML パース失敗・TaskSpec としての前提違反
 * (バージョン不一致など)は ok: false とメッセージで返す。
 */
export function loadSpecFile(filePath: string): SpecFileResult {
  let source: string
  try {
    source = readFileSync(filePath, 'utf-8')
  } catch (err) {
    return { ok: false, message: describeReadError(err) }
  }
  try {
    return { ok: true, spec: parseTaskSpec(source) }
  } catch (err) {
    return { ok: false, message: describeParseError(err) }
  }
}

/** ファイル読み込みエラーを日本語メッセージにする */
function describeReadError(err: unknown): string {
  const code =
    err instanceof Error && 'code' in err
      ? (err as NodeJS.ErrnoException).code
      : undefined
  switch (code) {
    case 'ENOENT':
      return 'ファイルが見つかりません'
    case 'EACCES':
    case 'EPERM':
      return 'ファイルを読み取る権限がありません'
    case 'EISDIR':
      return 'ディレクトリは指定できません(ファイルを指定してください)'
    default:
      return `ファイルを読み込めません(${err instanceof Error ? err.message : String(err)})`
  }
}

/** パースエラー(YAML 構文・TaskSpec の前提違反)を日本語メッセージにする */
function describeParseError(err: unknown): string {
  // parseTaskSpec 由来のメッセージは元から日本語なのでそのまま使う
  if (err instanceof TaskSpecError) return err.message
  const firstLine = (err instanceof Error ? err.message : String(err)).split(
    '\n',
  )[0]
  const position = yamlErrorPosition(err)
  return position === null
    ? `YAML を解析できません: ${firstLine}`
    : `YAML を解析できません(${position}): ${firstLine}`
}

/**
 * yaml パッケージの YAMLError が持つ位置情報(linePos)を取り出す。
 * yaml を直接 import せずダックタイピングで判定する(cli は依存を持たない方針)。
 */
function yamlErrorPosition(err: unknown): string | null {
  if (!(err instanceof Error) || !('linePos' in err)) return null
  const linePos = (err as { linePos?: unknown }).linePos
  if (!Array.isArray(linePos) || linePos.length === 0) return null
  const first = linePos[0] as { line?: unknown; col?: unknown }
  if (typeof first.line !== 'number' || typeof first.col !== 'number') {
    return null
  }
  return `${first.line} 行 ${first.col} 列`
}
