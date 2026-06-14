import type { KBar } from '../engine/types'

/**
 * 技术指标纯计算层 —— 与图表/UI 零耦合
 *
 * 所有函数返回与输入等长、按索引对齐的数组，窗口未满处以 NaN 占位
 * （图表层将 NaN 映射为 whitespace 点，线条自然留白）。
 * 指标在第 i 根仅使用 ≤ i 的数据，对全序列预计算不会向可见窗口泄露未来信息。
 */

const NA = Number.NaN

/** 简单移动平均（滑动窗口 O(n)） */
export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NA)
  if (period <= 0) return out
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

/** 指数移动平均，alpha = 2/(period+1)，首值用 values[0] 起种 */
export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NA)
  if (!values.length || period <= 0) return out
  const alpha = 2 / (period + 1)
  let prev = values[0]
  out[0] = prev
  for (let i = 1; i < values.length; i++) {
    prev = alpha * values[i] + (1 - alpha) * prev
    out[i] = prev
  }
  return out
}

export interface MacdResult {
  dif: number[]
  dea: number[]
  /** A股软件惯例：MACD 柱 = 2 × (DIF − DEA) */
  hist: number[]
}

export function macd(closes: number[], fast = 12, slow = 26, signal = 9): MacdResult {
  const ef = ema(closes, fast)
  const es = ema(closes, slow)
  const dif = closes.map((_, i) => ef[i] - es[i])
  const dea = ema(dif, signal)
  const hist = dif.map((v, i) => 2 * (v - dea[i]))
  return { dif, dea, hist }
}

export interface KdjResult {
  k: number[]
  d: number[]
  j: number[]
}

/**
 * KDJ（中国式 SMA 平滑：K = (RSV + (M-1)·K') / M）
 * 前 n-1 根用可得窗口计算（与主流行情软件一致），K/D 初值 50。
 */
export function kdj(
  bars: Array<Pick<KBar, 'high' | 'low' | 'close'>>,
  n = 9,
  kSmooth = 3,
  dSmooth = 3,
): KdjResult {
  const len = bars.length
  const k = new Array<number>(len).fill(NA)
  const d = new Array<number>(len).fill(NA)
  const j = new Array<number>(len).fill(NA)
  let prevK = 50
  let prevD = 50
  for (let i = 0; i < len; i++) {
    let hi = -Infinity
    let lo = Infinity
    for (let w = Math.max(0, i - n + 1); w <= i; w++) {
      hi = Math.max(hi, bars[w].high)
      lo = Math.min(lo, bars[w].low)
    }
    const rsv = hi === lo ? 50 : ((bars[i].close - lo) / (hi - lo)) * 100
    prevK = (rsv + (kSmooth - 1) * prevK) / kSmooth
    prevD = (prevK + (dSmooth - 1) * prevD) / dSmooth
    k[i] = prevK
    d[i] = prevD
    j[i] = 3 * prevK - 2 * prevD
  }
  return { k, d, j }
}

/** RSI（Wilder 平滑），前 period 根为 NaN */
export function rsi(closes: number[], period = 14): number[] {
  const out = new Array<number>(closes.length).fill(NA)
  if (closes.length <= period || period <= 0) return out
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1]
    avgGain += Math.max(ch, 0)
    avgLoss += Math.max(-ch, 0)
  }
  avgGain /= period
  avgLoss /= period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + Math.max(ch, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-ch, 0)) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

/** 威廉指标 W%R：(HHV(n) − C) / (HHV(n) − LLV(n)) × 100，0~100，80/20 为超卖/超买带 */
export function wr(
  bars: Array<Pick<KBar, 'high' | 'low' | 'close'>>,
  period = 14,
): number[] {
  const out = new Array<number>(bars.length).fill(NA)
  for (let i = 0; i < bars.length; i++) {
    let hi = -Infinity
    let lo = Infinity
    for (let w = Math.max(0, i - period + 1); w <= i; w++) {
      hi = Math.max(hi, bars[w].high)
      lo = Math.min(lo, bars[w].low)
    }
    out[i] = hi === lo ? 50 : ((hi - bars[i].close) / (hi - lo)) * 100
  }
  return out
}

/** 乖离率 BIAS：(C − MA(n)) / MA(n) × 100 */
export function bias(closes: number[], period: number): number[] {
  const m = sma(closes, period)
  return closes.map((c, i) => (Number.isFinite(m[i]) && m[i] !== 0 ? ((c - m[i]) / m[i]) * 100 : NA))
}

/** 顺势指标 CCI：(TP − SMA(TP,n)) / (0.015 × 平均绝对偏差)，±100 为常用阈值 */
export function cci(
  bars: Array<Pick<KBar, 'high' | 'low' | 'close'>>,
  period = 14,
): number[] {
  const tp = bars.map((b) => (b.high + b.low + b.close) / 3)
  const matp = sma(tp, period)
  const out = new Array<number>(bars.length).fill(NA)
  for (let i = period - 1; i < bars.length; i++) {
    let md = 0
    for (let w = i - period + 1; w <= i; w++) md += Math.abs(tp[w] - matp[i])
    md /= period
    out[i] = md === 0 ? 0 : (tp[i] - matp[i]) / (0.015 * md)
  }
  return out
}

export interface BollResult {
  mid: number[]
  upper: number[]
  lower: number[]
}

/** 布林带：中轨 SMA(n)，上下轨 ±mult×总体标准差 */
export function boll(closes: number[], period = 20, mult = 2): BollResult {
  const mid = sma(closes, period)
  const upper = new Array<number>(closes.length).fill(NA)
  const lower = new Array<number>(closes.length).fill(NA)
  for (let i = period - 1; i < closes.length; i++) {
    let variance = 0
    for (let w = i - period + 1; w <= i; w++) {
      variance += (closes[w] - mid[i]) ** 2
    }
    const std = Math.sqrt(variance / period)
    upper[i] = mid[i] + mult * std
    lower[i] = mid[i] - mult * std
  }
  return { mid, upper, lower }
}
