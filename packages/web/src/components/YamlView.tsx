/**
 * YAML テキストエディタビュー。
 * 現在の spec を serializeTaskSpec で YAML 文字列にして編集可能なテキストエリアに表示し、
 * 「適用」で parseTaskSpecDocument → validateTaskSpec を通してからモデルへ反映する。
 * パース/検証エラーは既存の LoadError バナー様式で分かりやすく表示し、エラー時は
 * モデルを変更せず編集テキストを保持する。
 *
 * 忠実性: 表示テキストはベース Document(baseDoc)を使って生成するため、未変更部分の
 * コメント・キー順・引用符スタイルが保たれる。「適用」時はユーザー入力テキストをそのまま
 * 新しいベース Document として親へ渡し、以後の GUI 編集の忠実性の基準にする。
 */
import { useState } from 'react'
import type { ChangeEvent } from 'react'
import type { Document } from 'yaml'
import { serializeTaskSpec } from '@taskaror/core/taskspec'
import { parseTaskSpecDocument } from '@taskaror/core/fidelity'
import { validateTaskSpec } from '@taskaror/core/validate'
import LoadErrorNotice from './LoadError'
import type { LoadError } from './LoadError'
import type { TaskSpec } from '@taskaror/core/types/taskspec'

export interface YamlViewProps {
  /** 現在の spec(表示・再生成の元) */
  spec: TaskSpec
  /** 忠実性のベース Document(未変更部分のコメント等を保持する元)。無ければ plain 出力 */
  baseDoc: Document | null
  /** 適用時にモデルへ反映する(spec と、新しいベースになる Document を渡す) */
  onApply: (spec: TaskSpec, doc: Document) => void
}

function YamlView({ spec, baseDoc, onApply }: YamlViewProps) {
  const [text, setText] = useState<string>(() =>
    serializeTaskSpec(spec, baseDoc),
  )
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
    if (!dirty) setText(serializeTaskSpec(spec, baseDoc))
  }

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setText(event.target.value)
    setDirty(true)
    if (error !== null) setError(null)
  }

  /** テキストをパース・検証し、問題なければモデルへ反映する。エラー時は保持する */
  const handleApply = (): void => {
    let parsed: { spec: TaskSpec; doc: Document }
    try {
      // 入力テキストから spec と、新しいベースになる Document の両方を得る
      parsed = parseTaskSpecDocument(text)
    } catch (thrown) {
      const message = thrown instanceof Error ? thrown.message : String(thrown)
      setError({ kind: 'parse', message })
      return
    }
    const issues = validateTaskSpec(parsed.spec)
    if (issues.length > 0) {
      setError({ kind: 'validation', issues })
      return
    }
    setError(null)
    setDirty(false)
    onApply(parsed.spec, parsed.doc)
  }

  /** 編集を破棄し、現在の spec からテキストを再生成する */
  const handleDiscard = (): void => {
    setText(serializeTaskSpec(spec, baseDoc))
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
            編集して「適用」でモデルへ反映します(未変更部分のコメント・キー順は保持されます)
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
