import type { BoardType, KBar, MinutePoint } from '../engine/types'
import { limitRatio, round2 } from '../engine/rules'

/**
 * 历史行情盲盒生成器
 *
 * 用"状态切换的几何随机游走"合成日 K：在震荡 / 趋势 / 极端三种市场状态间随机切换，
 * 涨跌幅被钳制在对应板块的涨跌停内，并保留偶发的封板日 —— 训练涨跌停撮合直觉。
 * 时间轴为合成序列（盲盒模式本就要求隐藏真实日期）。
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a)

/** Box-Muller 正态分布 */
function gauss() {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export interface BlindBoxMeta {
  /** 伪代码，仅用于板块识别，UI 中不展示完整代码 */
  code: string
  board: BoardType
  boardLabel: string
  limitPct: number
  /** 数据来源：合成 / 真实历史 CSV */
  source: 'synthetic' | 'real'
  /** 真实数据才有，结算揭晓时展示 */
  name?: string
  dateRange?: string
}

const BOARD_POOL: Array<{ prefix: string; board: BoardType; label: string }> = [
  { prefix: '600', board: 'MAIN', label: '沪市主板' },
  { prefix: '000', board: 'MAIN', label: '深市主板' },
  { prefix: '300', board: 'CHINEXT', label: '创业板' },
  { prefix: '688', board: 'STAR', label: '科创板' },
]

export function rollBlindBoxMeta(): BlindBoxMeta {
  const pick = BOARD_POOL[Math.floor(Math.random() * BOARD_POOL.length)]
  const code = pick.prefix + String(Math.floor(rand(100, 999)))
  return {
    code,
    board: pick.board,
    boardLabel: pick.label,
    limitPct: limitRatio(pick.board) * 100,
    source: 'synthetic',
  }
}

/** 合成时间纪元：盲盒模式下时间轴只用于排序，UI 一律以"第 N 日"展示 */
export const SYNTH_EPOCH = 1500000000

/**
 * 合成日 K —— 在随机游走基础上叠加 A 股特有结构，让"盘感"更可迁移：
 *   · 隔夜跳空：开盘价并非昨收，受趋势与昨日封板情绪影响（高开/低开/一字）
 *   · 连板延续：昨日涨停 → 今日大概率高开续强（情绪溢价）；跌停 → 续弱
 *   · 量价耦合：放量上攻 / 缩量阴跌，封板日成交剧烈放大（climactic volume）
 * 仍严格钳制在板块涨跌停内。
 */
export function genDailySeries(board: BoardType, n = 360): KBar[] {
  const bars: KBar[] = []
  const limit = limitRatio(board)
  const EPS = 1e-6
  let price = rand(6, 60)
  let drift = 0
  let vol = rand(0.012, 0.025)
  let volBase = rand(3e6, 7e6) // 成交量基准，随行情慢漂移
  let limitState = 0 // 昨日封板状态：+1 涨停 / -1 跌停 / 0 普通
  const baseTime = SYNTH_EPOCH

  for (let i = 0; i < n; i++) {
    // 状态切换：约 5% 概率进入新市场状态
    if (Math.random() < 0.05) {
      const regime = Math.random()
      if (regime < 0.35) { drift = rand(0.001, 0.012); vol = rand(0.015, 0.035) } // 上升趋势
      else if (regime < 0.65) { drift = rand(-0.012, -0.001); vol = rand(0.015, 0.04) } // 下跌趋势
      else { drift = 0; vol = rand(0.008, 0.018) } // 震荡
    }

    const prevClose = price
    const upCap = round2(prevClose * (1 + limit))
    const downCap = round2(prevClose * (1 - limit))

    // ── 隔夜跳空：趋势惯性 + 昨日封板情绪 ──────────────
    let gap = gauss() * vol * 0.5 + drift * 0.4
    if (limitState > 0) gap += rand(0.004, 0.03) // 涨停次日普遍高开
    else if (limitState < 0) gap -= rand(0.004, 0.03) // 跌停次日普遍低开
    gap = Math.max(-limit, Math.min(limit, gap))
    const open = round2(Math.min(upCap, Math.max(downCap, prevClose * (1 + gap))))

    // ── 当日收益：漂移 + 噪声 + 连板/连跌延续 + 偶发情绪日 ──
    let ret = drift + gauss() * vol
    if (limitState > 0 && Math.random() < 0.45) ret = rand(limit * 0.6, limit * 1.1) // 连板
    else if (limitState < 0 && Math.random() < 0.4) ret = -rand(limit * 0.6, limit * 1.1) // 连续跌停
    else if (Math.random() < 0.04) ret = Math.sign(ret || 1) * rand(limit * 0.7, limit * 1.2) // 情绪日
    ret = Math.max(-limit, Math.min(limit, ret))

    const close = round2(Math.max(0.5, prevClose * (1 + ret)))
    const sealedUp = close >= upCap - EPS
    const sealedDown = close <= downCap + EPS

    // ── 振幅：封板日近一字，普通日围绕开收价展开 ───────
    const span = prevClose * vol * rand(0.5, 1.6)
    const high = Math.min(
      upCap,
      sealedUp ? upCap : round2(Math.max(open, close) + span * rand(0.1, 0.7)),
    )
    const low = Math.max(
      downCap,
      sealedDown ? round2(Math.min(open, close)) : round2(Math.min(open, close) - span * rand(0.1, 0.7)),
    )

    // ── 量价耦合：放量上攻 / 缩量阴跌 / 封板剧烈放量 ────
    volBase = Math.max(1.5e6, Math.min(1.5e7, volBase * rand(0.9, 1.12)))
    const trendVol = ret >= 0 ? 1 + ret * 9 : 1 + Math.abs(ret) * 4
    const climactic = sealedUp || sealedDown ? rand(1.8, 3.4) : 1
    const volume = Math.round(volBase * trendVol * climactic * rand(0.75, 1.3))

    bars.push({ time: baseTime + i * 86400, open, high, low, close, volume })
    price = close
    limitState = sealedUp ? 1 : sealedDown ? -1 : 0
  }
  return bars
}

/**
 * 分时数据生成：240 个交易分钟（9:30-11:30 / 13:00-15:00），
 * Ornstein-Uhlenbeck 均值回复 + 随机冲击，黄线为累计成交额/成交量均价。
 */
export function genMinuteSeries(prevClose: number, board: BoardType): MinutePoint[] {
  const pts: MinutePoint[] = []
  const limit = limitRatio(board)
  let price = prevClose * (1 + gauss() * 0.004)
  let cumAmount = 0
  let cumVol = 0
  const theta = 0.02 // 回归强度
  let anchor = prevClose * (1 + rand(-0.01, 0.01)) // 当日重心，随大单冲击漂移

  for (let m = 0; m < 240; m++) {
    if (Math.random() < 0.02) anchor *= 1 + gauss() * 0.006 // 突发脉冲
    const noise = gauss() * prevClose * 0.0012
    price += theta * (anchor - price) + noise
    // 钳制在涨跌停内
    price = Math.min(prevClose * (1 + limit), Math.max(prevClose * (1 - limit), price))

    // 开盘 / 尾盘放量的 U 形成交量
    const session = m < 120 ? m / 120 : (m - 120) / 120
    const uShape = 1 + 2.2 * (Math.abs(session - 0.5) * 2) ** 2
    const volume = Math.round(uShape * rand(8e4, 3e5))

    cumAmount += price * volume
    cumVol += volume
    pts.push({
      minute: m,
      price: round2(price),
      avgPrice: round2(cumAmount / cumVol),
      volume,
    })
  }
  return pts
}

/** 把分钟序号映射为 HH:MM 显示（处理午间休市跳变） */
export function minuteLabel(m: number): string {
  const total = m < 120 ? 9 * 60 + 30 + m : 13 * 60 + (m - 120)
  const h = Math.floor(total / 60)
  const mm = total % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
