/**
 * クリティカルパス(プロジェクト終了日を決める、余裕 slack = 0 のタスク鎖)の導出。
 * React・DOM・ブラウザ API に依存しない純粋関数として実装し、将来の CLI からも再利用できる
 * ようにする。導出値は保存せず常にここで計算する(Single Source of Truth)。
 *
 * 前提・方針(CPM = Critical Path Method):
 * - 入力は schedule.ts の ScheduledTask ツリー。各タスクの最早開始(start)・最早終了(end)は
 *   スケジュール導出で確定済み(= 前向きパスは計算済み)なので、ここでは後ろ向きパスだけを行う。
 * - プロジェクト終了 = 全リーフタスクの最遅 end。
 * - 後ろ向きパスで各リーフの最遅終了(LF)を求め、slack = LF − 最早終了(営業日)= 0 の
 *   リーフをクリティカルとする。後続を持たないリーフは、その end がプロジェクト終了日と
 *   一致すれば slack 0(= クリティカルの終点)になる。
 * - 依存(depends・finish-to-start)の後続開始規則は schedule.ts に合わせる。
 *   先行が 0d マイルストーンなら同日開始(gap 0)、それ以外は翌営業日開始(gap 1)。
 * - サマリー(子を持つ親)は、配下にクリティカルなリーフを 1 つでも含むならクリティカルとする。
 *   depends の参照先がサマリーの場合は、その配下で最も遅く終わるリーフ(= サマリーの end を
 *   決めるリーフ)を先行として扱い、依存元がサマリーの場合は最も早く始まるリーフを後続とする。
 *
 * 既知の制限: 親(サマリー)自身の depends 伝播や、明示 start によるピン留めは後ろ向きパスで
 * 個別にはモデル化しておらず、スケジュール導出済みの start/end を素直に用いた CPM とする。
 * depends が主にリーフ間で完結する一般的なケースでは期待どおりに動く。
 */
import type { ScheduledTask } from './schedule'
import { businessDaysBetween, minDate, parseDate } from './date'

interface LeafNode {
  id: string
  /** 最早開始の営業日オーダ(1 始まりの整数) */
  esOrd: number
  /** 最早終了の営業日オーダ */
  efOrd: number
  /** efOrd − esOrd(最遅開始 = 最遅終了 − span を求めるのに使う) */
  span: number
}

/**
 * ScheduledTask ツリーからクリティカルなタスク id の集合を求める。
 * リーフを対象に slack を計算し、配下にクリティカルなリーフを含むサマリーも集合に含める。
 * タスクが 0 件なら空集合を返す。
 */
export function computeCriticalPath(scheduled: ScheduledTask[]): Set<string> {
  const critical = new Set<string>()

  // 全タスクを id 引きできるようにし、リーフを集める(depends 参照の解決に使う)
  const byId = new Map<string, ScheduledTask>()
  const leaves: ScheduledTask[] = []
  const collect = (nodes: ScheduledTask[]): void => {
    for (const node of nodes) {
      byId.set(node.task.id, node)
      if (node.children.length > 0) collect(node.children)
      else leaves.push(node)
    }
  }
  collect(scheduled)

  if (leaves.length === 0) return critical

  // 営業日オーダ(整数)への写像。origin = 全リーフの最早 start。
  // start / end はすべて営業日なので businessDaysBetween で 1 始まりの整数になる。
  let origin = parseDate(leaves[0].start)
  for (const leaf of leaves) origin = minDate(origin, parseDate(leaf.start))
  const ord = (date: string): number =>
    businessDaysBetween(origin, parseDate(date))

  const leafNodes = new Map<string, LeafNode>()
  for (const leaf of leaves) {
    const esOrd = ord(leaf.start)
    const efOrd = ord(leaf.end)
    leafNodes.set(leaf.task.id, {
      id: leaf.task.id,
      esOrd,
      efOrd,
      span: efOrd - esOrd,
    })
  }

  const projectEndOrd = Math.max(...[...leafNodes.values()].map((n) => n.efOrd))

  const efOrdOf = (id: string): number => leafNodes.get(id)?.efOrd ?? 0
  const esOrdOf = (id: string): number => leafNodes.get(id)?.esOrd ?? 0

  const descendantLeaves = (node: ScheduledTask): ScheduledTask[] =>
    node.children.length === 0
      ? [node]
      : node.children.flatMap(descendantLeaves)

  // depends 先(先行)としてのリーフ id。サマリーなら end を決める最遅リーフ。
  const predLeafIds = (node: ScheduledTask): string[] => {
    if (node.children.length === 0) return [node.task.id]
    const ids = descendantLeaves(node).map((l) => l.task.id)
    const maxEf = Math.max(...ids.map(efOrdOf))
    return ids.filter((id) => efOrdOf(id) === maxEf)
  }
  // depends 元(後続)としてのリーフ id。サマリーなら start を決める最早リーフ。
  const succLeafIds = (node: ScheduledTask): string[] => {
    if (node.children.length === 0) return [node.task.id]
    const ids = descendantLeaves(node).map((l) => l.task.id)
    const minEs = Math.min(...ids.map(esOrdOf))
    return ids.filter((id) => esOrdOf(id) === minEs)
  }

  // 後続辺: 先行リーフ id -> { 後続リーフ id, gap } の一覧
  const successors = new Map<string, { succId: string; gap: number }[]>()
  const addEdge = (predId: string, succId: string, gap: number): void => {
    if (predId === succId) return
    const list = successors.get(predId)
    if (list) list.push({ succId, gap })
    else successors.set(predId, [{ succId, gap }])
  }

  const buildEdges = (nodes: ScheduledTask[]): void => {
    for (const node of nodes) {
      const depends = node.task.depends
      if (depends && depends.length > 0) {
        const succIds = succLeafIds(node)
        for (const depId of depends) {
          const predNode = byId.get(depId)
          if (predNode === undefined) continue // 参照切れは validate 側で報告する
          const gap = predNode.isMilestone ? 0 : 1
          for (const predId of predLeafIds(predNode)) {
            for (const succId of succIds) addEdge(predId, succId, gap)
          }
        }
      }
      if (node.children.length > 0) buildEdges(node.children)
    }
  }
  buildEdges(scheduled)

  // 後ろ向きパス: 各リーフの最遅終了(LF)を求める(メモ化 + 循環フォールバック)
  const lfMemo = new Map<string, number>()
  const resolving = new Set<string>()
  const latestFinish = (id: string): number => {
    const cached = lfMemo.get(id)
    if (cached !== undefined) return cached
    if (resolving.has(id)) return projectEndOrd // 循環はプロジェクト終了で打ち切る
    resolving.add(id)
    const succs = successors.get(id)
    let lf = projectEndOrd
    if (succs !== undefined) {
      for (const { succId, gap } of succs) {
        const succNode = leafNodes.get(succId)
        if (succNode === undefined) continue
        // 後続の最遅開始(= LF − span)から先行の最遅終了を逆算する
        const ls = latestFinish(succId) - succNode.span
        lf = Math.min(lf, ls - gap)
      }
    }
    resolving.delete(id)
    lfMemo.set(id, lf)
    return lf
  }

  // slack = LF − 最早終了 が 0 のリーフをクリティカルにする
  for (const node of leafNodes.values()) {
    if (latestFinish(node.id) - node.efOrd <= 0) critical.add(node.id)
  }

  // サマリーは配下にクリティカルなリーフを含むならクリティカルにする
  const markSummary = (node: ScheduledTask): boolean => {
    if (node.children.length === 0) return critical.has(node.task.id)
    let anyCritical = false
    for (const child of node.children) {
      if (markSummary(child)) anyCritical = true
    }
    if (anyCritical) critical.add(node.task.id)
    return anyCritical
  }
  for (const root of scheduled) markSummary(root)

  return critical
}
