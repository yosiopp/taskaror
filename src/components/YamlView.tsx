/**
 * YAML テキストエディタビュー。
 * 現在の spec を serializeTaskSpec で YAML 文字列にして編集可能なテキストエリアに表示し、
 * 「適用」で parseTaskSpec → validateTaskSpec を通してからモデルへ反映する。
 * パース/検証エラーは既存の LoadError バナー様式で分かりやすく表示し、エラー時は
 * モデルを変更せず編集テキストを保持する。
 *
 * 既知の制限: この round-trip は YAML のコメント・キー順・引用符スタイルを保持しない
 * (spec → 文字列に再生成するため)。忠実性の保持はフェーズ 6「読み込んだ YAML の
 * 忠実性」で別途対応する。
 */
import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { parseTaskSpec, serializeTaskSpec } from '../lib/taskspec'
import { validateTaskSpec } from '../lib/validate'
import LoadErrorNotice from './LoadError'
import type { LoadError } from './LoadError'
import type { TaskSpec } from '../types/taskspec'

export interface YamlViewProps {
  /** 現在の spec(表示・再生成の元) */
  spec: TaskSpec
  /** 適用時にモデルへ反映する(undo/redo 対応の replaceSpec を想定) */
  onApply: (spec: TaskSpec) => void
}

function YamlView({ spec, onApply }: YamlViewProps) {
  const [text, setText] = useState<string>(() => serializeTaskSpec(spec))
  // ユーザーが編集して未適用の状態か(dirty の間は spec の外部変更で上書きしない)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<LoadError | null>(null)
  // 直近にテキストへ反映した spec。参照の変化で「外部変更」を検知する
  const [syncedSpec, setSyncedSpec] = useState(spec)

  // spec が外部で変わったとき(undo/redo・ファイル読み込み・適用後の正規化など)、
  // 未編集なら追従してテキストを再生成する。dirty の間はユーザーの編集を尊重して
  // 上書きしない。effect ではなくレンダー中の調整で同期する(cascading render を避ける)。
  if (spec !== syncedSpec) {
    setSyncedSpec(spec)
    if (!dirty) setText(serializeTaskSpec(spec))
  }

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setText(event.target.value)
    setDirty(true)
    if (error !== null) setError(null)
  }

  /** テキストをパース・検証し、問題なければモデルへ反映する。エラー時は保持する */
  const handleApply = (): void => {
    let parsed: TaskSpec
    try {
      parsed = parseTaskSpec(text)
    } catch (thrown) {
      const message = thrown instanceof Error ? thrown.message : String(thrown)
      setError({ kind: 'parse', message })
      return
    }
    const issues = validateTaskSpec(parsed)
    if (issues.length > 0) {
      setError({ kind: 'validation', issues })
      return
    }
    setError(null)
    setDirty(false)
    onApply(parsed)
  }

  /** 編集を破棄し、現在の spec からテキストを再生成する */
  const handleDiscard = (): void => {
    setText(serializeTaskSpec(spec))
    setDirty(false)
    setError(null)
  }

  return (
    <div className="yaml-view">
      <div className="yaml-toolbar">
        <button
          type="button"
          className="primary"
          onClick={handleApply}
          disabled={!dirty}
        >
          適用
        </button>
        <button type="button" onClick={handleDiscard} disabled={!dirty}>
          破棄して再生成
        </button>
        {dirty ? (
          <span className="yaml-dirty">未適用の編集があります</span>
        ) : (
          <span className="yaml-hint">
            編集して「適用」でモデルへ反映します(コメント・キー順は保持されません)
          </span>
        )}
      </div>

      {error !== null ? (
        <LoadErrorNotice error={error} onClose={() => setError(null)} />
      ) : null}

      <textarea
        className="yaml-textarea"
        value={text}
        onChange={handleChange}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label="YAML エディタ"
      />
    </div>
  )
}

export default YamlView
