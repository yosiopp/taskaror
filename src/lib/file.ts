/**
 * ファイル入出力にまつわる純粋関数(ブラウザ非依存)。
 * 実際のダウンロード・localStorage・ファイル読み込みは UI 層で行い、
 * ここには「空 spec の生成」「ダウンロード名の導出」だけを置く。
 */
import type { TaskSpec } from '../types/taskspec'
import { TASKSPEC_VERSION } from '../types/taskspec'

/** ダウンロード名の拡張子部分 */
const FILE_EXTENSION = '.taskspec.yaml'

/** info.title が空のときに使う既定のファイル名(拡張子を除く) */
export const DEFAULT_FILE_BASENAME = 'taskspec'

/** ファイル名の長さ上限(拡張子を除く) */
const MAX_BASENAME_LENGTH = 100

/** 新規作成の初期状態となる空の TaskSpec を生成する */
export function emptyTaskSpec(): TaskSpec {
  return { taskspec: TASKSPEC_VERSION, tasks: [] }
}

/**
 * 文字列をファイル名に使える形へ整える。
 * OS でファイル名に使えない文字・制御文字を除き、空白は - にまとめる。
 * 整形の結果が空になった場合は空文字を返す(呼び出し側で既定名にフォールバックする)。
 */
export function sanitizeFileBaseName(name: string): string {
  const cleaned = name
    .replace(/\p{Cc}/gu, '') // 制御文字は除去
    .replace(/[\\/:*?"<>|]/g, '-') // ファイル名に使えない文字は - に置換
    .replace(/\s+/g, '-') // 空白は - にまとめる
    .replace(/-+/g, '-') // 連続する - は 1 つに
    .slice(0, MAX_BASENAME_LENGTH)
  // 先頭・末尾の . と - を取り除く(隠しファイル化や見栄えの悪さを避ける)
  return cleaned.replace(/^[.-]+|[.-]+$/g, '')
}

/**
 * spec のダウンロード用ファイル名 `<name>.taskspec.yaml` を導出する。
 * name は info.title から作り、使えない・空の場合は既定名 taskspec を使う。
 */
export function taskSpecFileName(spec: TaskSpec): string {
  const base = sanitizeFileBaseName(spec.info?.title ?? '')
  return `${base || DEFAULT_FILE_BASENAME}${FILE_EXTENSION}`
}
