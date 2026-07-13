/**
 * [ヘルプ] → [taskaror について] で開く情報ダイアログ。
 * アプリ名・バージョン(package.json 由来)・GitHub リポジトリへのリンクを表示する。
 * バージョン・リポジトリ URL は src/appInfo.ts を単一のソースとする。
 */
import { useEffect, useRef } from 'react'
import { APP_NAME, APP_VERSION, REPOSITORY_URL } from '../appInfo'

export interface AboutDialogProps {
  /** 閉じる */
  onClose: () => void
}

function AboutDialog({ onClose }: AboutDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null)

  // 開いたら閉じるボタンにフォーカスを移す(キーボードだけで閉じられるように)
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  // Esc で閉じる(モーダルなので画面全体で受ける)
  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        // 背景クリックで閉じる。カード内クリックは無視する
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="about-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-dialog-title"
      >
        <div className="task-dialog-head">
          <h2 id="about-dialog-title" className="task-dialog-title">
            {APP_NAME} について
          </h2>
          <button
            type="button"
            className="task-dialog-close"
            aria-label="閉じる"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="about-dialog-body">
          <p className="about-name">{APP_NAME}</p>
          <p className="about-version">バージョン {APP_VERSION}</p>
          <p className="about-desc">
            YAML ベースのタスク定義フォーマット TaskSpec
            を編集・検証・可視化する OSS(リファレンス実装)。
          </p>
          <a
            className="about-link"
            href={REPOSITORY_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub リポジトリを開く ↗
          </a>
        </div>

        <div className="task-dialog-foot">
          <button
            ref={closeRef}
            type="button"
            className="primary"
            onClick={onClose}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}

export default AboutDialog
