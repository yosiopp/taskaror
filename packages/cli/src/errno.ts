// Node.js のシステムエラー(errno 付き Error)の判定。
// serve の応答分岐と spec ファイル読み込みのエラー分類で共有する。

/** NodeJS.ErrnoException(code を持つ Error)か */
export function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err
}
