/**
 * ファイル読み込み(パース・検証)に失敗したときのエラー通知バナー。
 * パースエラーは 1 件のメッセージを、検証エラーはパス付きの一覧を表示する。
 * 閉じるボタンでバナーを消せる(既存の編集内容はそのまま残る)。
 */
import type { ValidationIssue } from '@taskaror/core/validate'

export type LoadError =
  | { kind: 'parse'; message: string }
  | { kind: 'validation'; issues: ValidationIssue[] }

export interface LoadErrorNoticeProps {
  error: LoadError
  onClose: () => void
}

function LoadErrorNotice({ error, onClose }: LoadErrorNoticeProps) {
  return (
    <div className="load-error" role="alert">
      <div className="load-error-head">
        <strong>
          {error.kind === 'parse'
            ? 'ファイルを読み込めませんでした'
            : 'ファイルの内容が TaskSpec として不正です'}
        </strong>
        <button
          type="button"
          className="load-error-close"
          aria-label="閉じる"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      {error.kind === 'parse' ? (
        <p className="load-error-message">{error.message}</p>
      ) : (
        <ul className="load-error-list">
          {error.issues.map((issue, index) => (
            <li key={`${issue.path}-${index}`}>
              <code className="load-error-path">{issue.path}</code>
              <span className="load-error-text">{issue.message}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="load-error-hint">
        読み込みは中止しました。編集中の内容はそのまま残っています。
      </p>
    </div>
  )
}

export default LoadErrorNotice
