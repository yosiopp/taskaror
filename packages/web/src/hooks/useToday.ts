import { useEffect, useState } from 'react'
import { formatDate, today as localToday } from '@taskaror/core/date'

/** 次のローカル深夜(0 時)までのミリ秒。日跨ぎで「今日」を更新するタイマーに使う */
function msUntilNextLocalMidnight(): number {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return next.getTime() - now.getTime()
}

/**
 * 「今日」('YYYY-MM-DD')。今日線・スケジュールの基準日に使う。
 * 日付をまたいだら値を更新し、今日線・スケジュールを追従させる。
 * 次のローカル深夜に setTimeout を張り、発火したら today を更新して次の深夜を張り直す。
 * スリープ復帰やタブ復帰でタイマーがずれることがあるため、focus / visibilitychange でも
 * 今日を再評価する。setToday は関数更新なので、依存配列を空にしても値は陳腐化しない。
 */
export function useToday(): string {
  const [today, setToday] = useState<string>(() => formatDate(localToday()))

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const sync = (): void => {
      setToday((prev) => {
        const now = formatDate(localToday())
        return prev === now ? prev : now
      })
    }
    const scheduleNext = (): void => {
      // 深夜を確実に跨ぐよう少し余裕を足す
      timer = setTimeout(() => {
        sync()
        scheduleNext()
      }, msUntilNextLocalMidnight() + 1000)
    }
    scheduleNext()
    const handleVisibility = (): void => {
      if (document.visibilityState === 'visible') sync()
    }
    window.addEventListener('focus', sync)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      if (timer !== undefined) clearTimeout(timer)
      window.removeEventListener('focus', sync)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  return today
}
