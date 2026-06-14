import { create } from 'zustand'
import { TradingEngine } from '../core/engine/TradingEngine'
import type { KBar, MarketCtx, MinutePoint, Position, TradeRecord } from '../core/engine/types'
import {
  genDailySeries,
  genMinuteSeries,
  rollBlindBoxMeta,
  type BlindBoxMeta,
} from '../core/data/generator'
import { useHistoryStore } from './useHistoryStore'
import { loadDailyDataset } from '../core/data/source'

export type Mode = 'daily' | 'intraday'

/** 一局收尾时的揭晓数据：用户成绩 vs 买入持有基准 vs 理论最佳 */
export interface SessionResult {
  returnPct: number
  /** 买入持有基准（开局买入、持有到结束） */
  benchmarkPct: number
  /** 本段理论最佳（买在起点、卖在最高收盘） */
  maxFavorablePct: number
  beatBenchmark: boolean
  trades: number
  winRate: number
  realizedPnl: number
  totalFees: number
  equity: number
  boardLabel: string
  periodLabel: string
  /** 数据来源 + 真实数据的揭晓信息 */
  source: 'synthetic' | 'real'
  name?: string
  dateRange?: string
}

export interface AccountSnap {
  cash: number
  equity: number
  floatPnl: number
  /** 总权益相对初始资金的收益率 */
  returnPct: number
  realizedPnl: number
  totalFees: number
  position: Position
  trades: TradeRecord[]
}

/** 3D 流体的情绪目标值：FluidBackground 每帧向其阻尼趋近 */
export interface FluidTarget {
  /** 0 = 平稳盈利的青蓝色，1 = 大幅回撤的赤橙色 */
  mood: number
  /** 0..1 行情波动剧烈程度 → 流体激荡强度 */
  turbulence: number
}

export interface Toast {
  id: number
  kind: 'ok' | 'err'
  text: string
}

interface DailySession {
  meta: BlindBoxMeta
  bars: KBar[]
  visibleCount: number
  playing: boolean
  /** 每根 K 线推进间隔（ms） */
  speed: number
  finished: boolean
  /** 收尾揭晓数据，finished 时填充 */
  result?: SessionResult
}

interface IntradaySession {
  meta: BlindBoxMeta
  prevClose: number
  points: MinutePoint[]
  visibleCount: number
  playing: boolean
  speed: number
  finished: boolean
  result?: SessionResult
}

interface TradingStore {
  mode: Mode
  daily: DailySession | null
  intraday: IntradaySession | null
  account: AccountSnap | null
  fluid: FluidTarget
  toasts: Toast[]
  setMode: (m: Mode) => void
  startDaily: () => void
  startIntraday: () => void
  setPlaying: (p: boolean) => void
  setSpeed: (ms: number) => void
  step: () => void
  buy: (qty: number) => void
  sell: (qty: number) => void
  /** 全仓买入：用全部可用资金 */
  buyMax: () => void
  /** 全仓卖出：清掉全部可卖持仓（受 T+1 约束） */
  sellAll: () => void
  maxBuyQty: () => number
  dismissToast: (id: number) => void
}

const INITIAL_CASH_DAILY = 1_000_000
const INITIAL_CASH_INTRADAY = 300_000
const DAILY_WARMUP = 160 // 盲盒先展示 160 根历史 K 线（够宽屏铺满左侧）再开始推进

let engine: TradingEngine | null = null
let toastId = 1
let startToken = 0 // 开局竞态令牌：异步真实数据回来时若已有更新开局则丢弃

function snapshot(eng: TradingEngine, price: number): AccountSnap {
  return {
    cash: eng.cash,
    equity: eng.equity(price),
    floatPnl: eng.floatingPnl(price),
    returnPct: (eng.equity(price) - eng.initialEquity) / eng.initialEquity,
    realizedPnl: eng.realizedPnl,
    totalFees: eng.totalFees,
    position: { ...eng.position },
    trades: [...eng.trades],
  }
}

/** 由账户收益与近期波动推导流体情绪 */
function deriveFluid(returnPct: number, recentReturns: number[]): FluidTarget {
  // 收益 +5% → 完全青蓝；回撤 -5% → 完全赤橙
  const mood = Math.min(1, Math.max(0, 0.5 - returnPct * 10))
  const mean = recentReturns.reduce((a, b) => a + b, 0) / Math.max(1, recentReturns.length)
  const variance =
    recentReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, recentReturns.length)
  const turbulence = Math.min(1, Math.max(0.08, Math.sqrt(variance) * 45))
  return { mood, turbulence }
}

function recentBarReturns(bars: KBar[], upto: number, win = 20): number[] {
  const out: number[] = []
  for (let i = Math.max(1, upto - win); i < upto; i++) {
    out.push(bars[i].close / bars[i - 1].close - 1)
  }
  return out
}

function recentMinuteReturns(pts: MinutePoint[], upto: number, win = 30): number[] {
  const out: number[] = []
  for (let i = Math.max(1, upto - win); i < upto; i++) {
    out.push(pts[i].price / pts[i - 1].price - 1)
  }
  return out
}

function winRateOf(trades: TradeRecord[]): number {
  const sells = trades.filter((t) => t.side === 'sell')
  if (!sells.length) return 0
  return sells.filter((t) => (t.realizedPnl ?? 0) > 0).length / sells.length
}

/** 日线一局收尾：买入持有基准 = 开局首根可交易收盘 → 末根收盘；理论最佳 = 区间最高收盘 */
function buildDailyResult(d: DailySession, acc: AccountSnap): SessionResult {
  const entry = d.bars[DAILY_WARMUP - 1].close
  const end = d.bars[d.bars.length - 1].close
  let maxClose = entry
  for (let i = DAILY_WARMUP - 1; i < d.bars.length; i++) maxClose = Math.max(maxClose, d.bars[i].close)
  const benchmarkPct = end / entry - 1
  return {
    returnPct: acc.returnPct,
    benchmarkPct,
    maxFavorablePct: maxClose / entry - 1,
    beatBenchmark: acc.returnPct >= benchmarkPct,
    trades: acc.trades.length,
    winRate: winRateOf(acc.trades),
    realizedPnl: acc.realizedPnl,
    totalFees: acc.totalFees,
    equity: acc.equity,
    boardLabel: d.meta.boardLabel,
    periodLabel: `${d.bars.length - DAILY_WARMUP + 1} 个交易日`,
    source: d.meta.source,
    name: d.meta.name,
    dateRange: d.meta.dateRange,
  }
}

/** 分时一局收尾：基准 = 底仓持有到收盘（昨收→收盘）；理论最佳 = 日内最高价 */
function buildIntradayResult(t: IntradaySession, acc: AccountSnap): SessionResult {
  const end = t.points[t.points.length - 1].price
  let maxPrice = t.prevClose
  for (const p of t.points) maxPrice = Math.max(maxPrice, p.price)
  const benchmarkPct = end / t.prevClose - 1
  return {
    returnPct: acc.returnPct,
    benchmarkPct,
    maxFavorablePct: maxPrice / t.prevClose - 1,
    beatBenchmark: acc.returnPct >= benchmarkPct,
    trades: acc.trades.length,
    winRate: winRateOf(acc.trades),
    realizedPnl: acc.realizedPnl,
    totalFees: acc.totalFees,
    equity: acc.equity,
    boardLabel: t.meta.boardLabel,
    periodLabel: '单日 · 240 分钟',
    source: t.meta.source,
    name: t.meta.name,
    dateRange: t.meta.dateRange,
  }
}

function recordToHistory(mode: Mode, r: SessionResult) {
  useHistoryStore.getState().add({
    mode,
    boardLabel: r.boardLabel,
    periodLabel: r.periodLabel,
    returnPct: r.returnPct,
    benchmarkPct: r.benchmarkPct,
    beatBenchmark: r.beatBenchmark,
    maxFavorablePct: r.maxFavorablePct,
    trades: r.trades,
    winRate: r.winRate,
  })
}

// ── 中途存档：刷新后续上当前这一局（引擎 + 行情 + 进度）──────────
const SESSION_KEY = 'obsidian-active-session'

interface SessionSnapshot {
  v: number
  mode: Mode
  engine: ReturnType<TradingEngine['toJSON']>
  session: DailySession | IntradaySession
}

function loadSnapshot(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const snap = JSON.parse(raw) as SessionSnapshot
    if (!snap || snap.v !== 1 || !snap.session || !snap.engine) return null
    if (snap.session.finished) return null // 已结束的局不续，直接开新局
    const sess = snap.session as DailySession & IntradaySession
    if (typeof sess.visibleCount !== 'number') return null
    if (snap.mode === 'daily' && (!Array.isArray(sess.bars) || sess.bars.length < 2)) return null
    if (snap.mode === 'intraday' && (!Array.isArray(sess.points) || sess.points.length < 1)) return null
    return snap
  } catch {
    return null
  }
}

export const useTradingStore = create<TradingStore>((set, get) => {
  const pushToast = (kind: Toast['kind'], text: string) => {
    const t: Toast = { id: toastId++, kind, text }
    set((s) => ({ toasts: [...s.toasts.slice(-3), t] }))
    setTimeout(() => get().dismissToast(t.id), 3600)
  }

  /** 当前模式下最新可见行情的撮合上下文 */
  const currentCtx = (): MarketCtx | null => {
    const s = get()
    if (s.mode === 'daily' && s.daily) {
      const { bars, visibleCount } = s.daily
      const i = visibleCount - 1
      if (i < 1) return null
      return { price: bars[i].close, prevClose: bars[i - 1].close, barIndex: i, time: bars[i].time }
    }
    if (s.mode === 'intraday' && s.intraday) {
      const { points, visibleCount, prevClose } = s.intraday
      const i = visibleCount - 1
      if (i < 0) return null
      return { price: points[i].price, prevClose, barIndex: i, time: points[i].minute }
    }
    return null
  }

  // 存档（节流，避免快速播放时每帧写盘）/ 清档
  let lastSaveTs = 0
  const saveSession = (force = false) => {
    if (!engine) return
    const s = get()
    const session = s.mode === 'daily' ? s.daily : s.intraday
    if (!session) return
    const now = Date.now()
    if (!force && now - lastSaveTs < 250) return
    lastSaveTs = now
    try {
      const snap: SessionSnapshot = {
        v: 1,
        mode: s.mode,
        engine: engine.toJSON(),
        session: { ...session, playing: false }, // 续局默认暂停
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify(snap))
    } catch {
      /* 配额满或隐私模式：忽略，不影响交易 */
    }
  }
  const clearSession = () => {
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      /* ignore */
    }
  }

  const refresh = () => {
    const s = get()
    const ctx = currentCtx()
    if (!engine || !ctx) return
    const acc = snapshot(engine, ctx.price)
    const rets =
      s.mode === 'daily' && s.daily
        ? recentBarReturns(s.daily.bars, s.daily.visibleCount)
        : s.intraday
          ? recentMinuteReturns(s.intraday.points, s.intraday.visibleCount)
          : []
    set({ account: acc, fluid: deriveFluid(acc.returnPct, rets) })
    saveSession()
  }

  // 续局：有未完成存档则重建引擎并恢复行情/进度，否则正常空开局
  const restored = loadSnapshot()
  let initMode: Mode = 'daily'
  let initDaily: DailySession | null = null
  let initIntraday: IntradaySession | null = null
  let initAccount: AccountSnap | null = null
  let initFluid: FluidTarget = { mood: 0.35, turbulence: 0.15 }
  if (restored) {
    try {
      engine = TradingEngine.fromJSON(restored.engine)
      initMode = restored.mode
      const sess = restored.session as DailySession & IntradaySession
      const i = sess.visibleCount - 1
      const price = restored.mode === 'daily' ? sess.bars[i].close : sess.points[i].price
      initAccount = snapshot(engine, price)
      initFluid = deriveFluid(initAccount.returnPct, [])
      if (restored.mode === 'daily') initDaily = restored.session as DailySession
      else initIntraday = restored.session as IntradaySession
    } catch {
      engine = null
      initMode = 'daily'
      initDaily = null
      initIntraday = null
      initAccount = null
    }
  }

  return {
    mode: initMode,
    daily: initDaily,
    intraday: initIntraday,
    account: initAccount,
    fluid: initFluid,
    toasts: [],

    // 引擎实例与当前模式绑定：切换模式即开新一局，避免两套行情共用一个引擎
    setMode: (mode) => {
      if (mode === get().mode) return
      if (mode === 'daily') get().startDaily()
      else get().startIntraday()
    },

    startDaily: () => {
      // 先用合成行情瞬时开局（保证响应），同时异步尝试真实历史数据，成功则无缝替换
      const token = ++startToken
      const meta = rollBlindBoxMeta()
      const bars = genDailySeries(meta.board)
      engine = new TradingEngine({ initialCash: INITIAL_CASH_DAILY, board: meta.board })
      set({
        mode: 'daily',
        daily: { meta, bars, visibleCount: DAILY_WARMUP, playing: false, speed: 600, finished: false },
      })
      refresh()
      saveSession(true)

      void loadDailyDataset().then((real) => {
        // 仅当用户仍停留在这一局（无新开局 / 未切换模式 / 未开始操作）时才替换
        const s = get()
        if (!real || token !== startToken || s.mode !== 'daily') return
        if (s.daily && (s.daily.visibleCount !== DAILY_WARMUP || s.daily.finished)) return
        engine = new TradingEngine({ initialCash: INITIAL_CASH_DAILY, board: real.meta.board })
        set({
          mode: 'daily',
          daily: {
            meta: real.meta,
            bars: real.bars,
            visibleCount: DAILY_WARMUP,
            playing: false,
            speed: 600,
            finished: false,
          },
        })
        refresh()
        saveSession(true)
      })
    },

    startIntraday: () => {
      const meta = rollBlindBoxMeta()
      const prevClose = Math.round((6 + Math.random() * 40) * 100) / 100
      const points = genMinuteSeries(prevClose, meta.board)
      // 底仓 = 昨日已持有、今日可卖 → 训练日内 T+0（先卖后买 / 先买后卖做差价）
      const baseQty = Math.max(100, Math.floor(INITIAL_CASH_INTRADAY / prevClose / 200) * 100)
      engine = new TradingEngine({
        initialCash: INITIAL_CASH_INTRADAY,
        board: meta.board,
        basePosition: { qty: baseQty, cost: prevClose },
      })
      set({
        mode: 'intraday',
        intraday: { meta, prevClose, points, visibleCount: 1, playing: true, speed: 120, finished: false },
      })
      refresh()
      saveSession(true)
    },

    setPlaying: (playing) => {
      const s = get()
      if (s.mode === 'daily' && s.daily) set({ daily: { ...s.daily, playing } })
      if (s.mode === 'intraday' && s.intraday) set({ intraday: { ...s.intraday, playing } })
    },

    setSpeed: (speed) => {
      const s = get()
      if (s.mode === 'daily' && s.daily) set({ daily: { ...s.daily, speed } })
      if (s.mode === 'intraday' && s.intraday) set({ intraday: { ...s.intraday, speed } })
    },

    /** 推进一格：日线模式 = 跨一个交易日（触发 T+1 解冻），分时模式 = 推进一分钟 */
    step: () => {
      const s = get()
      if (s.mode === 'daily' && s.daily && !s.daily.finished) {
        const d = s.daily
        if (d.visibleCount >= d.bars.length) {
          const acc = get().account
          const result = acc ? buildDailyResult(d, acc) : undefined
          set({ daily: { ...d, playing: false, finished: true, result } })
          if (result) recordToHistory('daily', result)
          clearSession() // 本局结束，清档（已结束的局不续）
          return
        }
        engine?.newTradingDay() // 新的一天：昨日买入解冻
        set({ daily: { ...d, visibleCount: d.visibleCount + 1 } })
        refresh()
      } else if (s.mode === 'intraday' && s.intraday && !s.intraday.finished) {
        const t = s.intraday
        if (t.visibleCount >= t.points.length) {
          const acc = get().account
          const result = acc ? buildIntradayResult(t, acc) : undefined
          set({ intraday: { ...t, playing: false, finished: true, result } })
          if (result) recordToHistory('intraday', result)
          clearSession()
          return
        }
        set({ intraday: { ...t, visibleCount: t.visibleCount + 1 } })
        refresh()
      }
    },

    buy: (qty) => {
      const ctx = currentCtx()
      if (!engine || !ctx) return
      const r = engine.buy(qty, ctx)
      if (r.ok && r.trade) {
        pushToast('ok', `买入成交 ${r.trade.qty} 股 @ ¥${r.trade.price.toFixed(2)}（费用 ¥${r.trade.fee.toFixed(2)}）`)
      } else {
        pushToast('err', r.reason ?? '买入失败')
      }
      refresh()
    },

    sell: (qty) => {
      const ctx = currentCtx()
      if (!engine || !ctx) return
      const r = engine.sell(qty, ctx)
      if (r.ok && r.trade) {
        const pnl = r.trade.realizedPnl ?? 0
        pushToast(
          'ok',
          `卖出成交 ${r.trade.qty} 股 @ ¥${r.trade.price.toFixed(2)}，落袋 ${pnl >= 0 ? '+' : ''}¥${pnl.toFixed(2)}`,
        )
      } else {
        pushToast('err', r.reason ?? '卖出失败')
      }
      refresh()
    },

    buyMax: () => {
      const ctx = currentCtx()
      if (!engine || !ctx) return
      const qty = engine.maxBuyQty(ctx.price)
      if (qty < 100) {
        pushToast('err', '可用资金不足，无法满仓买入')
        return
      }
      get().buy(qty)
    },

    sellAll: () => {
      if (!engine) return
      const qty = engine.position.sellableQty
      if (qty < 100) {
        pushToast(
          'err',
          engine.position.totalQty > 0
            ? '持仓为今日买入，T+1 次日才可卖出'
            : '当前无可卖持仓',
        )
        return
      }
      get().sell(qty)
    },

    maxBuyQty: () => {
      const ctx = currentCtx()
      if (!engine || !ctx) return 0
      return engine.maxBuyQty(ctx.price)
    },

    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  }
})
