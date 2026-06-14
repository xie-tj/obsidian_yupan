/** A股板块类型 —— 决定涨跌停幅度 */
export type BoardType = 'MAIN' | 'CHINEXT' | 'STAR' | 'BSE'

export interface FeeConfig {
  /** 佣金费率（双向收取），默认万 2.5 */
  commissionRate: number
  /** 单笔最低佣金（元） */
  minCommission: number
  /** 印花税（仅卖出收取），现行 0.05% */
  stampTaxRate: number
  /** 过户费（双向，按成交金额），现行 0.001% */
  transferFeeRate: number
}

export interface KBar {
  /** 自合成的时间戳（秒）。盲盒模式下真实日期被隐藏 */
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface MinutePoint {
  /** 0..239：上午 9:30-11:30 共 120 分钟 + 下午 13:00-15:00 共 120 分钟 */
  minute: number
  price: number
  /** 当日均价线（黄线），累计成交额 / 累计成交量 */
  avgPrice: number
  volume: number
}

export interface Position {
  totalQty: number
  /** T+1：当前可卖数量（不含今日买入） */
  sellableQty: number
  /** 今日买入、明日才解冻的数量 */
  todayBuyQty: number
  /** 摊薄成本（含手续费） */
  avgCost: number
}

export type TradeSide = 'buy' | 'sell'

export interface TradeRecord {
  id: number
  side: TradeSide
  /** 成交所在的 bar 序号（日线模式）或分钟序号（分时模式） */
  barIndex: number
  time: number
  price: number
  qty: number
  /** 该笔交易的全部费用合计 */
  fee: number
  /** 卖出时的已实现盈亏（买入为 undefined） */
  realizedPnl?: number
}

export interface OrderResult {
  ok: boolean
  reason?: string
  trade?: TradeRecord
}

/** 撮合上下文：当前可见的最新行情 */
export interface MarketCtx {
  /** 委托参考价（最新价） */
  price: number
  /** 昨收 —— 涨跌停的计算基准 */
  prevClose: number
  barIndex: number
  time: number
}
