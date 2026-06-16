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
    <div className="flex min-h-[calc(100dvh_-_5.5rem)] flex-col gap-3 sm:gap-4 xl:grid xl:min-h-0 xl:h-full xl:grid-cols-[minmax(0,1fr)_22rem] xl:grid-rows-[minmax(0,1fr)]">
      <GlassPanel className="flex h-[56dvh] min-h-[22rem] shrink-0 flex-col gap-2 px-4 py-3 sm:gap-3 sm:px-5 sm:py-4 xl:h-auto xl:min-h-[34rem] xl:shrink">
        <header className="flex items-center gap-x-2 gap-y-1 sm:flex-wrap sm:gap-3">
          <h2 className="shrink-0 font-mono text-[11px] tracking-[0.16em] text-neon-violet sm:text-[12px] sm:tracking-[0.35em]">
            <span className="hidden sm:inline">INTRADAY · </span>分时训练
          </h2>
          <span className="shrink-0 rounded-md border border-neon-gold/40 px-1.5 py-0.5 font-mono text-[11px] text-neon-gold sm:px-2 sm:text-[12px]">
            {intraday.meta.boardLabel} ±{intraday.meta.limitPct}%
          </span>
          <span className="hidden rounded-md border border-white/10 px-2 py-0.5 font-mono text-[12px] text-slate-400 sm:inline-block">
            昨收 ¥{intraday.prevClose.toFixed(2)} · {minuteLabel(last.minute)}
          </span>

          <span className="ml-auto flex shrink-0 items-baseline gap-1.5 font-mono sm:gap-2">
            <NumberTicker
              value={last.price}
              prefix="¥"
              className={`text-lg font-bold sm:text-xl ${up ? 'text-neon-red glow-red' : 'text-neon-green glow-green'}`}
            />
            <NumberTicker
              value={chgPct}
              suffix="%"
              signed
              className={`text-xs sm:text-sm ${up ? 'text-neon-red' : 'text-neon-green'}`}
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

      <div className="flex min-h-0 flex-col gap-3 sm:gap-4">
        {/* 手机端：下单(左) + 资金(右) 同行；xl 用 contents 透明化，回到 资金→下单→流水 纵向流 */}
        <div className="grid grid-cols-[1fr_1.25fr] gap-3 xl:contents">
          <AccountPanel className="order-2 xl:order-none" />
          <TradeDock className="order-1 xl:order-none" disabled={intraday.finished} />
        </div>
        <TradeLog />
      </div>

      <SettleModal open={intraday.finished} onRestart={startIntraday} />
    </div>
  )
}
