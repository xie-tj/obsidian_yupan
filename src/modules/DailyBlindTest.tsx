import { useEffect } from 'react'
import { useTradingStore } from '../store/useTradingStore'
import { KLineChart } from '../charts/KLineChart'
import { GlassPanel } from '../components/GlassPanel'
import { AccountPanel } from '../components/AccountPanel'
import { TradeDock } from '../components/TradeDock'
import { PlaybackControls } from '../components/PlaybackControls'
import { SettleModal } from '../components/SettleModal'
import { NumberTicker } from '../components/NumberTicker'
import { IndicatorPanel } from '../components/IndicatorPanel'
import { TradeLog } from '../components/TradeLog'

/**
 * 模块一 · 日线盲盒训练
 *
 * 随机加载一段合成历史日 K，隐藏名称 / 代码 / 日期（仅暴露板块 → 涨跌停规则需要），
 * 自动播放 / 暂停 / 步进推演，每根新 K 线 = 跨一个交易日（触发 T+1 解冻）。
 */
export function DailyBlindTest() {
  const daily = useTradingStore((s) => s.daily)
  const account = useTradingStore((s) => s.account)
  const startDaily = useTradingStore((s) => s.startDaily)

  // 首次进入自动开局
  useEffect(() => {
    if (!daily) startDaily()
  }, [daily, startDaily])

  // 自动播放心跳
  useEffect(() => {
    if (!daily?.playing) return
    const id = setInterval(() => useTradingStore.getState().step(), daily.speed)
    return () => clearInterval(id)
  }, [daily?.playing, daily?.speed])

  if (!daily || !account) return null

  const i = daily.visibleCount - 1
  const last = daily.bars[i]
  const prev = i >= 1 ? daily.bars[i - 1] : null
  const chgPct = prev ? (last.close / prev.close - 1) * 100 : 0
  const up = chgPct >= 0

  return (
    <div className="grid h-full grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] xl:grid-rows-[minmax(0,1fr)]">
      {/* ── 主图舱（xl 下随视口高度伸展，图表区吃掉全部富余空间）── */}
      <GlassPanel className="flex min-h-[34rem] flex-col gap-3 px-5 py-4">
        <header className="flex flex-wrap items-center gap-3">
          <h2 className="font-mono text-[12px] tracking-[0.35em] text-neon-cyan glow-cyan">
            BLIND BOX · 日线盲盒
          </h2>
          <span className="rounded-md border border-neon-gold/40 px-2 py-0.5 font-mono text-[12px] text-neon-gold">
            {daily.meta.boardLabel} ±{daily.meta.limitPct}%
          </span>
          <span className="rounded-md border border-white/10 px-2 py-0.5 font-mono text-[12px] text-slate-400">
            代码已隐藏 · 第 {daily.visibleCount} / {daily.bars.length} 个交易日
          </span>

          <span className="ml-auto flex items-baseline gap-2 font-mono">
            <NumberTicker
              value={last.close}
              prefix="¥"
              className={`text-xl font-bold ${up ? 'text-neon-red glow-red' : 'text-neon-green glow-green'}`}
            />
            <NumberTicker
              value={chgPct}
              suffix="%"
              signed
              className={`text-sm ${up ? 'text-neon-red' : 'text-neon-green'}`}
            />
          </span>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <PlaybackControls playing={daily.playing} speed={daily.speed} onRestart={startDaily} />
          <div className="mx-1 h-5 w-px bg-white/10" />
          <IndicatorPanel />
        </div>

        <div className="min-h-0 flex-1">
          <KLineChart
            bars={daily.bars}
            visibleCount={daily.visibleCount}
            trades={account.trades}
            board={daily.meta.board}
          />
        </div>
      </GlassPanel>

      {/* ── 右侧资金 / 下单 / 流水 ─────────────────── */}
      <div className="flex min-h-0 flex-col gap-4">
        <AccountPanel />
        <TradeDock disabled={daily.finished} />
        <TradeLog />
      </div>

      <SettleModal open={daily.finished} onRestart={startDaily} />
    </div>
  )
}
