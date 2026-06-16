import { AnimatePresence, motion } from 'framer-motion'
import { useTradingStore } from '../store/useTradingStore'
import { GlassPanel } from './GlassPanel'
import { minuteLabel } from '../core/data/generator'
import type { TradeRecord } from '../core/engine/types'

/** 交易流水：最新成交在顶部，逐条弹簧滑入，可滚动 */
export function TradeLog({ className = '' }: { className?: string }) {
  const account = useTradingStore((s) => s.account)
  const mode = useTradingStore((s) => s.mode)
  if (!account) return null

  const trades = [...account.trades].reverse()
  const timeLabel = (t: TradeRecord) =>
    mode === 'daily' ? `第${t.barIndex + 1}日` : minuteLabel(t.time)

  return (
    <GlassPanel className={`flex min-h-[7rem] flex-1 flex-col px-5 py-4 sm:min-h-[10rem] ${className}`} delay={0.24}>
      <h3 className="mb-2 shrink-0 font-mono text-[12px] tracking-[0.35em] text-neon-gold glow-gold">
        LOG · 交易流水
      </h3>

      {trades.length === 0 ? (
        <p className="text-[12px] text-slate-400">尚无成交 —— 买卖点会同步标记在 K 线上</p>
      ) : (
        <div className="min-h-0 max-h-72 flex-1 space-y-1.5 overflow-y-auto pr-1 xl:max-h-none">
          <AnimatePresence initial={false}>
            {trades.map((t) => {
              const isBuy = t.side === 'buy'
              const pnl = t.realizedPnl ?? 0
              return (
                <motion.div
                  key={t.id}
                  layout
                  initial={{ opacity: 0, x: -16, scale: 0.96 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                  className="flex items-baseline gap-2 rounded-lg border border-white/5 bg-black/20 px-2.5 py-1.5 font-mono text-[12px]"
                >
                  <span
                    className={`font-bold ${isBuy ? 'text-neon-orange' : 'text-neon-cyan'}`}
                    style={{ textShadow: `0 0 8px ${isBuy ? 'rgba(255,120,73,.6)' : 'rgba(34,230,255,.6)'}` }}
                  >
                    {isBuy ? 'B 买' : 'S 卖'}
                  </span>
                  <span className="text-slate-300">
                    {t.qty} 股 @ ¥{t.price.toFixed(2)}
                  </span>
                  <span className="text-[12px] text-slate-400">{timeLabel(t)}</span>
                  <span className="ml-auto">
                    {t.side === 'sell' ? (
                      <span className={pnl >= 0 ? 'text-neon-red' : 'text-neon-green'}>
                        {pnl >= 0 ? '+' : ''}
                        {pnl.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-[12px] text-slate-500">费 {t.fee.toFixed(2)}</span>
                    )}
                  </span>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </GlassPanel>
  )
}
