import { useEffect } from 'react'
import { useTradingStore } from '../store/useTradingStore'
import { TimeShareChart } from '../charts/TimeShareChart'
import { GlassPanel } from '../components/GlassPanel'
import { AccountPanel } from '../components/AccountPanel'
import { TradeDock } from '../components/TradeDock'
import { PlaybackControls } from '../components/PlaybackControls'
import { SettleModal } from '../components/SettleModal'
import { NumberTicker } from '../components/NumberTicker'
import { TradeLog } from '../components/TradeLog'
import { minuteLabel } from '../core/data/generator'

/**
 * 模块二 · 单日分时训练
 *
 * 还原 9:30-11:30 / 13:00-15:00 交易时段的分时推演。
 * 开局自带"昨日底仓"（已解冻可卖）→ 可练日内 T+0 做差价：
 * 先卖后买 / 先买后卖均可，但当日新买入部分依旧 T+1 冻结。
 */
export function IntradayTraining() {
  const intraday = useTradingStore((s) => s.intraday)
  const account = useTradingStore((s) => s.account)
  const startIntraday = useTradingStore((s) => s.startIntraday)

  useEffect(() => {
    if (!intraday) startIntraday()
  }, [intraday, startIntraday])

  useEffect(() => {
    if (!intraday?.playing) return
    const id = setInterval(() => useTradingStore.getState().step(), intraday.speed)
    return () => clearInterval(id)
  }, [intraday?.playing, intraday?.speed])

  if (!intraday || !account) return null

  const last = intraday.points[intraday.visibleCount - 1]
  const chgPct = (last.price / intraday.prevClose - 1) * 100
  const up = chgPct >= 0

  return (
    <div className="grid h-full grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] xl:grid-rows-[minmax(0,1fr)]">
      <GlassPanel className="flex min-h-[34rem] flex-col gap-3 px-5 py-4">
        <header className="flex flex-wrap items-center gap-3">
          <h2 className="font-mono text-[12px] tracking-[0.35em] text-neon-violet">
            INTRADAY · 分时 T+0 训练
          </h2>
          <span className="rounded-md border border-neon-gold/40 px-2 py-0.5 font-mono text-[12px] text-neon-gold">
            {intraday.meta.boardLabel} ±{intraday.meta.limitPct}%
          </span>
          <span className="rounded-md border border-white/10 px-2 py-0.5 font-mono text-[12px] text-slate-400">
            昨收 ¥{intraday.prevClose.toFixed(2)} · {minuteLabel(last.minute)}
          </span>

          <span className="ml-auto flex items-baseline gap-2 font-mono">
            <NumberTicker
              value={last.price}
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

        <PlaybackControls playing={intraday.playing} speed={intraday.speed} onRestart={startIntraday} />

        <div className="min-h-0 flex-1">
          <TimeShareChart
            points={intraday.points}
            visibleCount={intraday.visibleCount}
            prevClose={intraday.prevClose}
            board={intraday.meta.board}
            trades={account.trades}
          />
        </div>
      </GlassPanel>

      <div className="flex min-h-0 flex-col gap-4">
        <AccountPanel />
        <TradeDock disabled={intraday.finished} />
        <TradeLog />
      </div>

      <SettleModal open={intraday.finished} onRestart={startIntraday} />
    </div>
  )
}
