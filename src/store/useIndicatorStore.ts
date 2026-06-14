import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** 主图均线配置：可增删、改周期、换色、单独开关 */
export interface MaLineConfig {
  id: string
  period: number
  color: string
  enabled: boolean
}

/** 主图指标互斥单选：MA / EMA 均线组（共用均线列表）/ BOLL 布林带 / 无 */
export type MainIndicator = 'ma' | 'ema' | 'boll' | 'none'
/** 副图指标类型（每个副图窗格选其一） */
export type SubIndicator = 'macd' | 'kdj' | 'rsi' | 'wr' | 'bias' | 'cci'

export interface MacdParams {
  fast: number
  slow: number
  signal: number
}
export interface KdjParams {
  n: number
  k: number
  d: number
}
export interface RsiParams {
  period: number
}
export interface WrParams {
  period: number
}
export interface BiasParams {
  p1: number
  p2: number
  p3: number
}
export interface CciParams {
  period: number
}
export interface BollParams {
  period: number
  mult: number
}

interface IndicatorStore {
  main: MainIndicator
  maLines: MaLineConfig[]
  boll: BollParams
  /** 副图窗格列表：数组长度即副图数量（0 ~ MAX_SUB_PANES），每项为该窗格的指标 */
  subs: SubIndicator[]
  macd: MacdParams
  kdj: KdjParams
  rsi: RsiParams
  wr: WrParams
  bias: BiasParams
  cci: CciParams
  setMain: (m: MainIndicator) => void
  addMaLine: () => void
  removeMaLine: (id: string) => void
  updateMaLine: (id: string, patch: Partial<Omit<MaLineConfig, 'id'>>) => void
  setBoll: (patch: Partial<BollParams>) => void
  addSubPane: () => void
  removeSubPane: (index: number) => void
  setSubAt: (index: number, kind: SubIndicator) => void
  setMacd: (patch: Partial<MacdParams>) => void
  setKdj: (patch: Partial<KdjParams>) => void
  setRsi: (patch: Partial<RsiParams>) => void
  setWr: (patch: Partial<WrParams>) => void
  setBias: (patch: Partial<BiasParams>) => void
  setCci: (patch: Partial<CciParams>) => void
  resetAll: () => void
}

/** 霓虹色板：新增均线时按序取色 */
export const MA_PALETTE = [
  '#f5f8ff', // 白
  '#ffd166', // 金
  '#ff5ecf', // 霓虹粉
  '#22e6ff', // 青
  '#9d6bff', // 紫
  '#2dffb3', // 绿
  '#ff7849', // 橙
]

export const MAX_MA_LINES = 6
export const MAX_SUB_PANES = 4
export const SUB_KINDS: SubIndicator[] = ['macd', 'kdj', 'rsi', 'wr', 'bias', 'cci']

const clampPeriod = (v: number) => Math.max(1, Math.min(250, Math.floor(v) || 1))

let uid = 0
const newId = () => `ma-${Date.now().toString(36)}-${uid++}`

const DEFAULTS = {
  main: 'ma' as MainIndicator,
  maLines: [
    { id: 'ma-default-5', period: 5, color: MA_PALETTE[0], enabled: true },
    { id: 'ma-default-10', period: 10, color: MA_PALETTE[1], enabled: true },
    { id: 'ma-default-20', period: 20, color: MA_PALETTE[2], enabled: true },
    { id: 'ma-default-60', period: 60, color: MA_PALETTE[3], enabled: true },
  ] as MaLineConfig[],
  boll: { period: 20, mult: 2 },
  subs: ['macd'] as SubIndicator[],
  macd: { fast: 12, slow: 26, signal: 9 },
  kdj: { n: 9, k: 3, d: 3 },
  rsi: { period: 14 },
  wr: { period: 14 },
  bias: { p1: 6, p2: 12, p3: 24 },
  cci: { period: 14 },
}

export const useIndicatorStore = create<IndicatorStore>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      setMain: (main) => set({ main }),

      addMaLine: () =>
        set((s) => {
          if (s.maLines.length >= MAX_MA_LINES) return s
          const color = MA_PALETTE[s.maLines.length % MA_PALETTE.length]
          return { maLines: [...s.maLines, { id: newId(), period: 30, color, enabled: true }] }
        }),

      removeMaLine: (id) => set((s) => ({ maLines: s.maLines.filter((l) => l.id !== id) })),

      updateMaLine: (id, patch) =>
        set((s) => ({
          maLines: s.maLines.map((l) =>
            l.id === id
              ? { ...l, ...patch, ...(patch.period !== undefined ? { period: clampPeriod(patch.period) } : {}) }
              : l,
          ),
        })),

      setBoll: (patch) =>
        set((s) => ({
          boll: {
            period: patch.period !== undefined ? clampPeriod(patch.period) : s.boll.period,
            mult: patch.mult !== undefined ? Math.max(0.5, Math.min(4, patch.mult || 2)) : s.boll.mult,
          },
        })),

      /** 新增副图：优先选一个尚未使用的指标 */
      addSubPane: () =>
        set((s) => {
          if (s.subs.length >= MAX_SUB_PANES) return s
          const unused = SUB_KINDS.find((k) => !s.subs.includes(k))
          return { subs: [...s.subs, unused ?? 'macd'] }
        }),

      removeSubPane: (index) => set((s) => ({ subs: s.subs.filter((_, i) => i !== index) })),

      setSubAt: (index, kind) =>
        set((s) => ({ subs: s.subs.map((k, i) => (i === index ? kind : k)) })),

      setMacd: (patch) =>
        set((s) => ({
          macd: {
            fast: clampPeriod(patch.fast ?? s.macd.fast),
            slow: clampPeriod(patch.slow ?? s.macd.slow),
            signal: clampPeriod(patch.signal ?? s.macd.signal),
          },
        })),
      setKdj: (patch) =>
        set((s) => ({
          kdj: {
            n: clampPeriod(patch.n ?? s.kdj.n),
            k: clampPeriod(patch.k ?? s.kdj.k),
            d: clampPeriod(patch.d ?? s.kdj.d),
          },
        })),
      setRsi: (patch) => set((s) => ({ rsi: { period: clampPeriod(patch.period ?? s.rsi.period) } })),
      setWr: (patch) => set((s) => ({ wr: { period: clampPeriod(patch.period ?? s.wr.period) } })),
      setBias: (patch) =>
        set((s) => ({
          bias: {
            p1: clampPeriod(patch.p1 ?? s.bias.p1),
            p2: clampPeriod(patch.p2 ?? s.bias.p2),
            p3: clampPeriod(patch.p3 ?? s.bias.p3),
          },
        })),
      setCci: (patch) => set((s) => ({ cci: { period: clampPeriod(patch.period ?? s.cci.period) } })),

      resetAll: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'obsidian-indicator-config',
      version: 3,
      // 链式迁移：v1 boll.enabled → v2 main 单选 → v3 sub 单值升级为 subs 数组
      migrate: (persisted: unknown, version: number) => {
        let s = persisted as Record<string, any>
        if (!s) return s
        if (version < 2) {
          s = {
            ...s,
            main: s.boll?.enabled ? 'boll' : 'ma',
            boll: { period: s.boll?.period ?? 20, mult: s.boll?.mult ?? 2 },
          }
        }
        if (version < 3) {
          const { sub, ...rest } = s
          s = { ...rest, subs: sub && sub !== 'none' ? [sub] : [] }
        }
        return s
      },
    },
  ),
)
