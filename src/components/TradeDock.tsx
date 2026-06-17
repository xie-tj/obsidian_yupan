import { motion } from 'framer-motion'
import { TradeButton } from './TradeButton'
import { GlassPanel } from './GlassPanel'
import { useTradingStore } from '../store/useTradingStore'
import { useOrderStore } from '../store/useOrderStore'

/**
 * 下单舱
 *
 * 默认「全仓进出」：点买入直接满仓、点卖出直接清仓——快速复盘时无需调手数（配 B/S 快捷键）。
 * 可切「手动手数」精确控制仓位。
 */
export function TradeDock({
  disabled,
  className = '',
}: {
  disabled?: boolean
  className?: string
}) {
  const buy = useTradingStore((s) => s.buy)
  const sell = useTradingStore((s) => s.sell)
  const buyMax = useTradingStore((s) => s.buyMax)
  const sellAll = useTradingStore((s) => s.sellAll)
  const maxBuyQty = useTradingStore((s) => s.maxBuyQty)
  const account = useTradingStore((s) => s.account)

  const fullPosition = useOrderStore((s) => s.fullPosition)
  const setFullPosition = useOrderStore((s) => s.setFullPosition)
  const lots = useOrderStore((s) => s.lots)
  const setLots = useOrderStore((s) => s.setLots)

  const qty = lots * 100
  const sellable = account?.position.sellableQty ?? 0
  const maxBuy = maxBuyQty()

  const presets: Array<[string, () => number]> = [
    ['1手', () => 1],
    ['10手', () => 10],
    ['半仓', () => Math.max(1, Math.floor(maxBuy / 200))],
    ['满仓', () => Math.max(1, Math.floor(maxBuy / 100))],
  ]

  return (
    <GlassPanel className={`px-3 py-3 xl:px-5 xl:py-4 ${className}`} delay={0.16}>
      <div className="mb-3 flex flex-col items-start gap-2 xl:flex-row xl:items-center xl:justify-between">
        <h3 className="font-mono text-[12px] tracking-[0.12em] text-neon-violet xl:tracking-[0.35em]">
          EXECUTE · 下单舱
        </h3>
        {/* 全仓 ⇄ 手动 模式切换 */}
        <div className="flex rounded-lg border border-white/10 bg-black/25 p-0.5">
          {([
            ['full', '全仓进出', '全仓'],
            ['manual', '手动手数', '手动'],
          ] as const).map(([key, label, short]) => {
            const active = (key === 'full') === fullPosition
            return (
              <button
                key={key}
                onClick={() => setFullPosition(key === 'full')}
                className="relative whitespace-nowrap rounded-md px-2.5 py-1 font-mono text-[12px]"
              >
                {active && (
                  <motion.span
                    layoutId="order-mode-pill"
                    className="absolute inset-0 rounded-md border border-neon-violet/50 bg-violet-400/10"
                    transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  />
                )}
                <span className={`relative ${active ? 'text-neon-violet' : 'text-slate-400'}`}>
                  <span className="xl:hidden">{short}</span>
                  <span className="hidden xl:inline">{label}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 手数选择：仅手动模式 */}
      {!fullPosition && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">数量</span>
          <input
            type="number"
            min={1}
            value={lots}
            onChange={(e) => setLots(Number(e.target.value))}
            className="w-20 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-right font-mono text-sm
              text-slate-100 outline-none focus:border-neon-cyan/50"
          />
          <span className="text-xs text-slate-500">手（{qty} 股）</span>
          <div className="ml-auto flex gap-1">
            {presets.map(([label, fn]) => (
              <motion.button
                key={label}
                whileTap={{ scale: 0.85 }}
                transition={{ type: 'spring', stiffness: 600, damping: 18 }}
                onClick={() => setLots(fn())}
                className="rounded-md border border-white/10 px-2 py-0.5 text-[12px] text-slate-400 hover:border-neon-cyan/40 hover:text-neon-cyan"
              >
                {label}
              </motion.button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-2 xl:gap-3">
        <div id="tutorial-buy">
          <TradeButton
            side="buy"
            disabled={disabled || maxBuy < 100}
            sub={fullPosition ? `满仓 ${maxBuy} 股` : `可买 ${maxBuy} 股`}
            onTrade={() => (fullPosition ? buyMax() : buy(qty))}
          />
        </div>
        <div id="tutorial-sell">
          <TradeButton
            side="sell"
            disabled={disabled || sellable < 100}
            sub={fullPosition ? `清仓 ${sellable} 股` : `可卖 ${sellable} 股`}
            onTrade={() => (fullPosition ? sellAll() : sell(qty))}
          />
        </div>
      </div>

      <p className="mt-3 hidden text-[12px] leading-relaxed text-slate-500 sm:block">
        {fullPosition
          ? '全仓模式：买入即满仓、卖出即清仓 · 快捷键 B 买 / S 卖'
          : 'T+1：今日买入次日才可卖出 · 封死涨/跌停时对应方向委托不会成交'}
        {' · '}费用 = 佣金万2.5（最低5元）+ 卖出印花税0.05% + 过户费0.001%
      </p>
    </GlassPanel>
  )
}
