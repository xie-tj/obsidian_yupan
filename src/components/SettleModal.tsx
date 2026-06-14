import { AnimatePresence, motion } from 'framer-motion'
import { useTradingStore } from '../store/useTradingStore'
import { useHistoryStore, summarize } from '../store/useHistoryStore'
import { NumberTicker } from './NumberTicker'

/** A股：盈红亏绿 */
const pnlColor = (v: number) => (v >= 0 ? 'text-neon-red' : 'text-neon-green')
const pct = (v: number, signed = true) =>
  `${signed && v > 0 ? '+' : ''}${(v * 100).toFixed(2)}%`

/** 收益对比条：以三者绝对值最大者为满格 */
function CompareBar({
  label,
  value,
  scale,
  color,
  bold,
}: {
  label: string
  value: number
  scale: number
  color: string
  bold?: boolean
}) {
  const w = scale > 0 ? Math.min(100, (Math.abs(value) / scale) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <span className={`w-20 shrink-0 text-xs ${bold ? 'text-slate-100' : 'text-slate-400'}`}>
        {label}
      </span>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: color, boxShadow: `0 0 10px ${color}` }}
          initial={{ width: 0 }}
          animate={{ width: `${w}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20, delay: 0.15 }}
        />
      </div>
      <span className={`w-16 shrink-0 text-right font-mono text-xs ${bold ? 'font-bold' : ''}`} style={{ color }}>
        {pct(value)}
      </span>
    </div>
  )
}

/** 历史收益 sparkline（最近 N 局，含零基准线） */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const W = 232
  const H = 38
  const max = Math.max(...values.map(Math.abs), 0.01)
  const x = (i: number) => (i / (values.length - 1)) * W
  const y = (v: number) => H / 2 - (v / max) * (H / 2 - 3)
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const last = values[values.length - 1]
  return (
    <svg width={W} height={H} className="overflow-visible">
      <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="rgba(160,180,210,0.18)" strokeDasharray="3 3" />
      <path d={d} fill="none" stroke="rgba(34,230,255,0.85)" strokeWidth={1.5} />
      <circle cx={x(values.length - 1)} cy={y(last)} r={2.6} fill={last >= 0 ? '#ff3b4d' : '#2dffb3'} />
    </svg>
  )
}

export function SettleModal({ open, onRestart }: { open: boolean; onRestart: () => void }) {
  const mode = useTradingStore((s) => s.mode)
  const result = useTradingStore((s) => (s.mode === 'daily' ? s.daily?.result : s.intraday?.result))
  const records = useHistoryStore((s) => s.records)

  if (!result) return null

  const profitable = result.returnPct >= 0
  const scale = Math.max(
    Math.abs(result.returnPct),
    Math.abs(result.benchmarkPct),
    Math.abs(result.maxFavorablePct),
    0.001,
  )
  const excess = result.returnPct - result.benchmarkPct
  const stats = summarize(records)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="glass max-h-[92vh] w-full max-w-[30rem] overflow-y-auto px-6 py-7 sm:px-8"
            initial={{ scale: 0.7, y: 60, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.85, y: 30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 19, mass: 1.05 }}
          >
            <h2
              className={`mb-1 font-mono text-xs tracking-[0.4em] ${
                profitable ? 'text-neon-cyan glow-cyan' : 'text-neon-orange'
              }`}
            >
              SESSION SETTLED · 本局复盘
            </h2>

            <div className="mb-1 flex items-baseline gap-3">
              <NumberTicker
                value={result.returnPct * 100}
                suffix="%"
                signed
                className={`font-mono text-5xl font-bold ${profitable ? 'text-neon-red glow-red' : 'text-neon-green glow-green'}`}
              />
              <span className="text-sm text-slate-400">总收益率</span>
            </div>

            {/* 揭晓：盲盒身份 + 跑赢/跑输基准 */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-neon-gold/40 px-2 py-0.5 font-mono text-xs text-neon-gold">
                {result.source === 'real'
                  ? `揭晓 · ${result.name ?? '真实个股'} · ${result.boardLabel}${result.dateRange ? ' · ' + result.dateRange : ''}`
                  : `揭晓 · 合成行情 · ${result.boardLabel} · ${result.periodLabel}`}
              </span>
              <span
                className={`rounded-md border px-2 py-0.5 font-mono text-xs ${
                  excess >= 0
                    ? 'border-neon-red/50 text-neon-red'
                    : 'border-neon-green/50 text-neon-green'
                }`}
              >
                {excess >= 0 ? '跑赢基准' : '跑输基准'} {pct(excess)}
              </span>
            </div>

            {/* 三方收益对比 */}
            <div className="mb-4 space-y-2 border-t border-white/10 pt-4">
              <CompareBar
                label="你的操作"
                value={result.returnPct}
                scale={scale}
                color={profitable ? '#ff3b4d' : '#2dffb3'}
                bold
              />
              <CompareBar label="买入持有" value={result.benchmarkPct} scale={scale} color="#22e6ff" />
              <CompareBar label="理论最佳" value={result.maxFavorablePct} scale={scale} color="#ffd166" />
            </div>

            {/* 明细 */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-white/10 pt-4 text-sm">
              <div>
                <p className="text-xs tracking-wider text-slate-400">期末权益</p>
                <p className="font-mono text-slate-100">¥{result.equity.toLocaleString('zh-CN')}</p>
              </div>
              <div>
                <p className="text-xs tracking-wider text-slate-400">已实现盈亏</p>
                <p className={`font-mono ${pnlColor(result.realizedPnl)}`}>
                  {result.realizedPnl >= 0 ? '+' : ''}¥{result.realizedPnl.toLocaleString('zh-CN')}
                </p>
              </div>
              <div>
                <p className="text-xs tracking-wider text-slate-400">交易次数</p>
                <p className="font-mono text-slate-100">{result.trades}</p>
              </div>
              <div>
                <p className="text-xs tracking-wider text-slate-400">卖出胜率</p>
                <p className="font-mono text-slate-100">{(result.winRate * 100).toFixed(0)}%</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs tracking-wider text-slate-400">交易成本合计</p>
                <p className="font-mono text-neon-gold">¥{result.totalFees.toFixed(2)}</p>
              </div>
            </div>

            {/* 历史战绩 + 走势 */}
            <div className="mt-4 border-t border-white/10 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs tracking-[0.3em] text-neon-cyan">训练战绩</span>
                {stats.n >= 4 && (
                  <span className={`text-xs ${stats.improving ? 'text-neon-red' : 'text-slate-400'}`}>
                    {stats.improving ? '↗ 状态上行' : '— 持平'}
                  </span>
                )}
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="grid grid-cols-2 gap-x-5 gap-y-1.5 text-xs">
                  <span className="text-slate-400">
                    已训练 <b className="font-mono text-slate-100">{stats.n}</b> 局
                  </span>
                  <span className="text-slate-400">
                    平均{' '}
                    <b className={`font-mono ${pnlColor(stats.avgReturn)}`}>{pct(stats.avgReturn)}</b>
                  </span>
                  <span className="text-slate-400">
                    跑赢基准 <b className="font-mono text-neon-cyan">{(stats.beatRate * 100).toFixed(0)}%</b>
                  </span>
                  <span className="text-slate-400">
                    最佳 <b className="font-mono text-neon-red">{pct(stats.best)}</b>
                  </span>
                </div>
                <Sparkline values={records.slice(-12).map((r) => r.returnPct)} />
              </div>
            </div>

            <motion.button
              onClick={onRestart}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 550, damping: 20 }}
              className="mt-6 w-full rounded-xl border border-neon-cyan/50 py-3 font-mono text-sm tracking-[0.3em]
                text-neon-cyan shadow-neon-cyan glow-cyan"
            >
              ↻ 再开一局盲盒
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
