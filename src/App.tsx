import './App.css'
import sampleSource from '../examples/ecommerce.taskspec.yaml?raw'
import { flattenTasks, parseTaskSpec } from './lib/taskspec'

const spec = parseTaskSpec(sampleSource)
const rows = flattenTasks(spec.tasks)

function App() {
  return (
    <main className="app">
      <header className="app-header">
        <h1>taskaror</h1>
        <p>TaskSpec を編集・検証・可視化するガントチャートツール</p>
      </header>

      <section>
        <h2>{spec.info?.title ?? '無題のプロジェクト'}</h2>
        <p className="hint">
          <code>examples/ecommerce.taskspec.yaml</code>{' '}
          を読み込んだサンプル表示です。
        </p>
        <table className="task-table">
          <thead>
            <tr>
              <th>タスク</th>
              <th>見積</th>
              <th>担当</th>
              <th>依存</th>
              <th>進捗</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ task, depth }) => (
              <tr key={task.id}>
                <td style={{ paddingLeft: `${depth * 1.5 + 0.5}rem` }}>
                  {task.title}
                </td>
                <td>{task.estimate ?? '–'}</td>
                <td>{task.assignees?.join(', ') ?? '–'}</td>
                <td>{task.depends?.join(', ') ?? '–'}</td>
                <td>{task.progress != null ? `${task.progress}%` : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  )
}

export default App
