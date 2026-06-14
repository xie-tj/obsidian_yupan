import type { BoardType, FeeConfig } from './types'

export const round2 = (v: number) => Math.round(v * 100) / 100

/** 默认费率：佣金万 2.5（最低 5 元）、印花税 0.05%（卖出）、过户费 0.001%（双向） */
export const DEFAULT_FEES: FeeConfig = {
  commissionRate: 0.00025,
  minCommission: 5,
  stampTaxRate: 0.0005,
  transferFeeRate: 0.00001,
}

/** 根据证券代码识别板块 */
export function detectBoard(code: string): BoardType {
  if (code.startsWith('688') || code.startsWith('689')) return 'STAR' // 科创板
  if (code.startsWith('300') || code.startsWith('301')) return 'CHINEXT' // 创业板
  if (code.startsWith('8') || code.startsWith('43') || code.startsWith('92')) return 'BSE' // 北交所
  return 'MAIN' // 沪深主板 60xxxx / 00xxxx
}

/** 涨跌停幅度：主板 10%，创业板/科创板 20%，北交所 30%，ST 股 5%（主板） */
export function limitRatio(board: BoardType, isST = false): number {
  if (isST && board === 'MAIN') return 0.05
  switch (board) {
    case 'CHINEXT':
    case 'STAR':
      return 0.2
    case 'BSE':
      return 0.3
    default:
      return 0.1
  }
}

/** 计算当日涨跌停价（交易所规则：基于昨收，四舍五入到分） */
export function priceLimitOf(prevClose: number, board: BoardType, isST = false) {
  const r = limitRatio(board, isST)
  return {
    up: round2(prevClose * (1 + r)),
    down: round2(prevClose * (1 - r)),
    ratio: r,
  }
}

/** 买入成本拆解：成交金额 + 佣金（最低 5 元）+ 过户费 */
export function buyCost(price: number, qty: number, fees: FeeConfig) {
  const amount = round2(price * qty)
  const commission = round2(Math.max(amount * fees.commissionRate, fees.minCommission))
  const transferFee = round2(amount * fees.transferFeeRate)
  return { amount, commission, transferFee, totalFee: round2(commission + transferFee), total: round2(amount + commission + transferFee) }
}

/** 卖出净得拆解：成交金额 - 佣金 - 印花税 - 过户费 */
export function sellProceeds(price: number, qty: number, fees: FeeConfig) {
  const amount = round2(price * qty)
  const commission = round2(Math.max(amount * fees.commissionRate, fees.minCommission))
  const stampTax = round2(amount * fees.stampTaxRate)
  const transferFee = round2(amount * fees.transferFeeRate)
  const totalFee = round2(commission + stampTax + transferFee)
  return { amount, commission, stampTax, transferFee, totalFee, net: round2(amount - totalFee) }
}
