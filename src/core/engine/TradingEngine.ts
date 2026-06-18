import type {
  BoardType,
  FeeConfig,
  MarketCtx,
  OrderResult,
  Position,
  TradeRecord,
  TradeSide,
} from './types'
import { DEFAULT_FEES, buyCost, priceLimitOf, round2, sellProceeds } from './rules'

const EPS = 1e-6

export interface EngineOptions {
  initialCash: number
  board: BoardType
  isST?: boolean
  fees?: FeeConfig
  /** 初始底仓（用于分时 T+0 训练：昨日持仓今日可卖） */
  basePosition?: { qty: number; cost: number }
  /** T+0 模式（分时训练）：当日买入即可卖出，可无限次反复买卖；默认 false = T+1 */
  tPlus0?: boolean
}

/**
 * A 股模拟撮合引擎
 *
 * 核心规则：
 *  1. T+1 —— 今日买入的仓位记入 todayBuyQty，跨入新交易日（newTradingDay）才并入 sellableQty；
 *  2. 涨跌停 —— 委托价被钳制在 [跌停, 涨停]；最新价已封死涨停时买单排队视为不成交（封板无法买入），
 *     封死跌停时卖单同理；
 *  3. 交易成本 —— 买入收佣金+过户费，卖出收佣金+印花税+过户费，佣金有 5 元最低门槛。
 */
export class TradingEngine {
  cash: number
  readonly initialCash: number
  /** 期初总权益 = 初始现金 + 底仓成本，收益率以此为基准 */
  readonly initialEquity: number
  readonly board: BoardType
  readonly isST: boolean
  readonly fees: FeeConfig
  /** true = T+0（当日买入即可卖），false = T+1（次日解冻） */
  readonly tPlus0: boolean
  position: Position
  trades: TradeRecord[] = []
  realizedPnl = 0
  totalFees = 0
  private nextTradeId = 1

  constructor(opts: EngineOptions) {
    this.initialCash = opts.initialCash
    this.cash = opts.initialCash
    this.board = opts.board
    this.isST = opts.isST ?? false
    this.fees = opts.fees ?? DEFAULT_FEES
    this.tPlus0 = opts.tPlus0 ?? false
    const base = opts.basePosition
    this.initialEquity = opts.initialCash + (base ? base.qty * base.cost : 0)
    this.position = {
      totalQty: base?.qty ?? 0,
      sellableQty: base?.qty ?? 0, // 底仓视作昨日买入，今日即可卖出
      todayBuyQty: 0,
      avgCost: base?.cost ?? 0,
    }
  }

  /** 跨入新交易日：T+1 解冻 —— 今日买入全部转为可卖 */
  newTradingDay() {
    this.position.sellableQty = this.position.totalQty
    this.position.todayBuyQty = 0
  }

  /** 按最新价计算的总权益 */
  equity(price: number) {
    return round2(this.cash + this.position.totalQty * price)
  }

  /** 浮动盈亏（基于摊薄成本） */
  floatingPnl(price: number) {
    return round2((price - this.position.avgCost) * this.position.totalQty)
  }

  /**
   * 撮合检查：返回实际可成交价，或失败原因。
   * sealed = 最新价已触及该方向的停板（日线模式下以收盘封板近似"排队不成交"）
   */
  private matchPrice(side: TradeSide, ctx: MarketCtx): { fillPrice?: number; reason?: string } {
    const { up, down, ratio } = priceLimitOf(ctx.prevClose, this.board, this.isST)
    const pct = (ratio * 100).toFixed(0)
    const p = round2(ctx.price)

    if (side === 'buy') {
      if (p >= up - EPS) {
        return { reason: `已封死涨停 ${up.toFixed(2)}（±${pct}% 板），买单排队未能成交` }
      }
      return { fillPrice: Math.min(p, up) }
    }
    if (p <= down + EPS) {
      return { reason: `已封死跌停 ${down.toFixed(2)}（±${pct}% 板），卖单排队未能成交` }
    }
    return { fillPrice: Math.max(p, down) }
  }

  /** 买入（qty 必须为 100 股整数倍） */
  buy(qty: number, ctx: MarketCtx): OrderResult {
    if (qty <= 0 || qty % 100 !== 0) {
      return { ok: false, reason: '委托数量须为 100 股（1 手）的整数倍' }
    }
    const m = this.matchPrice('buy', ctx)
    if (!m.fillPrice) return { ok: false, reason: m.reason }

    const cost = buyCost(m.fillPrice, qty, this.fees)
    if (cost.total > this.cash + EPS) {
      return { ok: false, reason: `可用资金不足（需 ¥${cost.total.toFixed(2)}）` }
    }

    // 摊薄成本把手续费一并计入；内部保留全精度，避免成本基数漂移（展示层再取整）
    const pos = this.position
    const newTotal = pos.totalQty + qty
    pos.avgCost = (pos.avgCost * pos.totalQty + cost.total) / newTotal
    pos.totalQty = newTotal
    if (this.tPlus0) pos.sellableQty += qty // T+0：当日买入即可卖
    else pos.todayBuyQty += qty // T+1：今日买入次日解冻，不增加 sellableQty
    this.cash = round2(this.cash - cost.total)
    this.totalFees = round2(this.totalFees + cost.totalFee)

    const trade: TradeRecord = {
      id: this.nextTradeId++,
      side: 'buy',
      barIndex: ctx.barIndex,
      time: ctx.time,
      price: m.fillPrice,
      qty,
      fee: cost.totalFee,
    }
    this.trades.push(trade)
    return { ok: true, trade }
  }

  /** 卖出（受 T+1 可卖数量约束） */
  sell(qty: number, ctx: MarketCtx): OrderResult {
    if (qty <= 0 || qty % 100 !== 0) {
      return { ok: false, reason: '委托数量须为 100 股（1 手）的整数倍' }
    }
    const pos = this.position
    if (qty > pos.sellableQty) {
      return {
        ok: false,
        reason: `可卖数量不足：持仓 ${pos.totalQty} 股中 ${pos.todayBuyQty} 股为今日买入（T+1 次日解冻），当前可卖 ${pos.sellableQty} 股`,
      }
    }
    const m = this.matchPrice('sell', ctx)
    if (!m.fillPrice) return { ok: false, reason: m.reason }

    const proceeds = sellProceeds(m.fillPrice, qty, this.fees)
    const pnl = round2(proceeds.net - pos.avgCost * qty)

    pos.totalQty -= qty
    pos.sellableQty -= qty
    if (pos.totalQty === 0) pos.avgCost = 0
    this.cash = round2(this.cash + proceeds.net)
    this.realizedPnl = round2(this.realizedPnl + pnl)
    this.totalFees = round2(this.totalFees + proceeds.totalFee)

    const trade: TradeRecord = {
      id: this.nextTradeId++,
      side: 'sell',
      barIndex: ctx.barIndex,
      time: ctx.time,
      price: m.fillPrice,
      qty,
      fee: proceeds.totalFee,
      realizedPnl: pnl,
    }
    this.trades.push(trade)
    return { ok: true, trade }
  }

  /** 用全部可用资金能买到的最大手数 */
  maxBuyQty(price: number): number {
    if (price <= 0) return 0
    // 预留佣金与过户费的保守估计
    const budget = this.cash / (1 + this.fees.commissionRate + this.fees.transferFeeRate) - this.fees.minCommission
    return Math.max(0, Math.floor(budget / price / 100) * 100)
  }

  /** 序列化全部可变状态（中途存档用） */
  toJSON() {
    return {
      initialCash: this.initialCash,
      initialEquity: this.initialEquity,
      board: this.board,
      isST: this.isST,
      fees: this.fees,
      tPlus0: this.tPlus0,
      cash: this.cash,
      position: this.position,
      trades: this.trades,
      realizedPnl: this.realizedPnl,
      totalFees: this.totalFees,
      nextTradeId: this.nextTradeId,
    }
  }

  /** 从存档重建引擎（刷新续局） */
  static fromJSON(d: ReturnType<TradingEngine['toJSON']>): TradingEngine {
    const e = new TradingEngine({
      initialCash: d.initialCash,
      board: d.board,
      isST: d.isST,
      fees: d.fees,
      tPlus0: d.tPlus0,
    })
    ;(e as { initialEquity: number }).initialEquity = d.initialEquity
    e.cash = d.cash
    e.position = d.position
    e.trades = d.trades
    e.realizedPnl = d.realizedPnl
    e.totalFees = d.totalFees
    e.nextTradeId = d.nextTradeId
    return e
  }
}
