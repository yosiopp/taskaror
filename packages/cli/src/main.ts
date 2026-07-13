// taskaror CLI のエントリポイント。
// ディスパッチ本体はテストできるように cli.ts に分離している。
import { runCli } from './cli'

runCli(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code
  },
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  },
)
