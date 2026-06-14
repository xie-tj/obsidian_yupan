import type { BoardType, KBar } from '../engine/types'
import { detectBoard, limitRatio } from '../engine/rules'
import { SYNTH_EPOCH, type BlindBoxMeta } from './generator'

/**
 * 真实历史数据源（自带 CSV）
 *
 * 放在 public/data/ 下：
 *   manifest.json  —— [{ "file": "600519.csv", "name": "贵州茅台", "code": "600519" }, ...]
 *   <file>.csv     —— 表头 date,open,high,low,close,volume，按时间升序
 *
 * 盲盒原则：真实日期/名称/代码在盘中一律隐藏，时间轴仍映射为"第 N 个交易日"，
 * 仅在结算揭晓时披露 name + 日期区间。manifest 缺失或为空 → 回退到合成行情。
 */

interface ManifestEntry {
  file: string
  name: string
  code: string
}

function labelOf(code: string, board: BoardType): string {
  if (board === 'CHINEXT') return '创业板'
  if (board === 'STAR') return '科创板'
  if (board === 'BSE') return '北交所'
  return code.startsWith('6') ? '沪市主板' : '深市主板'
}

/** 解析 OHLCV CSV；时间轴用合成纪元（盲盒隐藏真实日期），返回真实日期区间供揭晓 */
function parseCsv(text: string): { bars: KBar[]; dateRange: string } {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.split(','))
    .filter((c) => c.length >= 6)
  if (!rows.length) return { bars: [], dateRange: '' }

  // 首行若非数字则视为表头
  const start = Number.isFinite(Number(rows[0][1])) ? 0 : 1
  const bars: KBar[] = []
  let firstDate = ''
  let lastDate = ''
  for (let i = start; i < rows.length; i++) {
    const [date, o, h, l, c, v] = rows[i]
    const open = Number(o)
    const high = Number(h)
    const low = Number(l)
    const close = Number(c)
    const volume = Number(v) || 0
    if (![open, high, low, close].every(Number.isFinite)) continue
    if (!firstDate) firstDate = date
    lastDate = date
    bars.push({
      time: SYNTH_EPOCH + bars.length * 86400,
      open,
      high,
      low,
      close,
      volume,
    })
  }
  const dateRange = firstDate && lastDate ? `${firstDate} ~ ${lastDate}` : ''
  return { bars, dateRange }
}

/**
 * 尝试加载一段随机真实历史日线。无 manifest / 为空 / 数据过短 / 解析失败 → 返回 null。
 * 要求 ≥200 根以保证预热 160 根后仍有足够可交易区间。
 */
export async function loadDailyDataset(): Promise<{ bars: KBar[]; meta: BlindBoxMeta } | null> {
  try {
    const base = import.meta.env.BASE_URL || '/'
    const res = await fetch(`${base}data/manifest.json`, { cache: 'no-cache' })
    if (!res.ok) return null
    const list = (await res.json()) as ManifestEntry[]
    if (!Array.isArray(list) || list.length === 0) return null

    const pick = list[Math.floor(Math.random() * list.length)]
    const csvRes = await fetch(`${base}data/${pick.file}`, { cache: 'no-cache' })
    if (!csvRes.ok) return null
    const { bars, dateRange } = parseCsv(await csvRes.text())
    if (bars.length < 200) return null // 需 > 预热 160 根 + 一段可交易区间

    const board = detectBoard(pick.code)
    return {
      bars,
      meta: {
        code: pick.code,
        board,
        boardLabel: labelOf(pick.code, board),
        limitPct: limitRatio(board) * 100,
        source: 'real',
        name: pick.name,
        dateRange,
      },
    }
  } catch {
    return null
  }
}
