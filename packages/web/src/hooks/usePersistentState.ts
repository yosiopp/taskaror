import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

/**
 * 値が変わるたびに save で永続化される useState。初期値は load で復元する。
 * save にはモジュールレベルの安定な関数を渡すこと(毎レンダー別関数だと保存が毎回走る)。
 */
export function usePersistentState<T>(
  load: () => T,
  save: (value: T) => void,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(load)
  useEffect(() => {
    save(value)
  }, [value, save])
  return [value, setValue]
}
