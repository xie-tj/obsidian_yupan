import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Mode } from './useTradingStore'

/** 一局结束后的战绩快照（持久化，用于"历次成绩留存 / 是否进步"） */
export interface SessionRecord {
  id: string
  ts: number // 完成时刻（真实时间戳，用于展示日期）
  mode: Mode
  boardLabel: string
  periodLabel: string
  returnPct: number
  /** 买入持有基准收益率 */
  benchmarkPct: number
  /** 是否跑赢基准 */
  beatBenchmark: boolean
  /** 本段理论最佳（买在起点、卖在最高）收益率 */
  maxFavorablePct: number
  trades: number
  winRate: number
}

interface HistoryStore {
  records: SessionRecord[]
  add: (r: Omit<SessionRecord, 'id' | 'ts'>) => void
  clear: () => void
}

const MAX_RECORDS = 100
let rid = 0

export const useHistoryStore = create<HistoryStore>()(
  persist(
    (set) => ({
      records: [],
      add: (r) =>
        set((s) => {
          const rec: SessionRecord = {
            ...r,
            id: `${Date.now().toString(36)}-${rid++}`,
            ts: Date.now(),
          }
          return { records: [...s.records, rec].slice(-MAX_RECORDS) }
        }),
      clear: () => set({ records: [] }),
    }),
    { name: 'obsidian-session-history', version: 1 },
  ),
)

/** 派生统计：总局数、胜率、跑赢基准率、平均收益、是否处于上升趋势 */
export function summarize(records: SessionRecord[]) {
  const n = records.length
  if (n === 0) {
    return { n: 0, avgReturn: 0, beatRate: 0, winSessions: 0, improving: false, best: 0 }
  }
  const avgReturn = records.reduce((a, r) => a + r.returnPct, 0) / n
  const beatRate = records.filter((r) => r.beatBenchmark).length / n
  const winSessions = records.filter((r) => r.returnPct > 0).length
  const best = Math.max(...records.map((r) => r.returnPct))
  // 后半程平均收益 > 前半程 → 视为在进步
  let improving = false
  if (n >= 4) {
    const mid = Math.floor(n / 2)
    const early = records.slice(0, mid)
    const late = records.slice(mid)
    const avg = (arr: SessionRecord[]) => arr.reduce((a, r) => a + r.returnPct, 0) / arr.length
    improving = avg(late) > avg(early)
  }
  return { n, avgReturn, beatRate, winSessions, improving, best }
}
