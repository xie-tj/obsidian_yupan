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
  const mode = useTradingStore((s) => s.mode)
  const daily = useTradingStore((s) => s.daily)
  const account = useTradingStore((s) => s.account)
  const startDaily = useTradingStore((s) => s.startDaily)

  useEffect(() => {
    if (mode === 'daily' && !daily) {
      try { startDaily() } catch { setTimeout(startDaily, 500) }
    }
  }, [mode, daily, startDaily])

  // 自动播放心跳
  useEffect(() => {
    if (!daily?.playing) return
    const id = setInterval(() => useTradingStore.getState().step(), daily.speed)
    return () => clearInterval(id)
  }, [daily?.playing, daily?.speed])

  if (!daily || !account) return (
    <div className="flex h-[56dvh] items-center justify-center">
      <span className="animate-pulse font-mono text-sm text-slate-500">正在生成行情…</span>
    </div>
  )

  const i = daily.visibleCount - 1
  const last = daily.bars[i]
  const prev = i >= 1 ? daily.bars[i - 1] : null
  const chgPct = prev ? (last.close / prev.close - 1) * 100 : 0
  const up = chgPct >= 0

  return (
    <div className="flex min-h-[calc(100dvh_-_5.5rem)] flex-col gap-3 sm:gap-4 xl:grid xl:min-h-0 xl:h-full xl:grid-cols-[minmax(0,1fr)_22rem] xl:grid-rows-[minmax(0,1fr)]">
      {/* ── 主图舱（手机端吃掉首屏富余空间，桌面端随视口高度伸展）── */}
      <GlassPanel className="flex h-[56dvh] min-h-[22rem] shrink-0 flex-col gap-2 px-4 py-3 sm:gap-3 sm:px-5 sm:py-4 xl:h-auto xl:min-h-[34rem] xl:shrink">
        <header className="flex items-center gap-x-2 gap-y-1 sm:flex-wrap sm:gap-3">
          <h2 className="shrink-0 font-mono text-[11px] tracking-[0.16em] text-neon-cyan glow-cyan sm:text-[12px] sm:tracking-[0.35em]">
            <span className="hidden sm:inline">BLIND BOX · </span>日线盲盒
          </h2>
          <span className="shrink-0 rounded-md border border-neon-gold/40 px-1.5 py-0.5 font-mono text-[11px] text-neon-gold sm:px-2 sm:text-[12px]">
            {daily.meta.boardLabel} ±{daily.meta.limitPct}%
          </span>
          <span className="hidden rounded-md border border-white/10 px-2 py-0.5 font-mono text-[12px] text-slate-400 sm:inline-block">
            代码已隐藏 · 第 {daily.visibleCount} / {daily.bars.length} 个交易日
          </span>

          <span className="ml-auto flex shrink-0 items-baseline gap-1.5 font-mono sm:gap-2">
            <NumberTicker
              value={last.close}
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

        <div className="flex flex-wrap items-center gap-2">
          <PlaybackControls playing={daily.playing} speed={daily.speed} onRestart={startDaily} />
          {/* 指标配置为进阶功能：手机端首屏让位给图表，sm 及以上恢复 */}
          <div className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
          <div className="hidden items-center sm:flex">
            <IndicatorPanel />
          </div>
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
      <div className="flex min-h-0 flex-col gap-3 sm:gap-4">
        {/* 手机端：下单(左) + 资金(右) 同行；xl 用 contents 透明化，回到 资金→下单→流水 纵向流 */}
        <div className="grid grid-cols-[1fr_1.25fr] gap-3 xl:contents">
          <AccountPanel className="order-2 xl:order-none" />
          <TradeDock className="order-1 xl:order-none" disabled={daily.finished} />
        </div>
        <TradeLog />
      </div>

      <SettleModal open={daily.finished} onRestart={startDaily} />
    </div>
  )
}
