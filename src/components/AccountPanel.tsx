import { useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useTradingStore } from '../store/useTradingStore'
import { NumberTicker } from './NumberTicker'
import { GlassPanel } from './GlassPanel'

/** A 股配色：盈利红、亏损绿 */
const pnlClass = (v: number) =>
  v > 0 ? 'text-neon-red glow-red' : v < 0 ? 'text-neon-green glow-green' : 'text-slate-300'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <span className="text-xs tracking-wider text-slate-400">{label}</span>
      <span className="font-mono text-sm">{children}</span>
    </div>
  )
}

export function AccountPanel({ className = '' }: { className?: string }) {
  const account = useTradingStore((s) => s.account)
  const [showDetail, setShowDetail] = useState(false)
  if (!account) return null

  const { position } = account
  return (
    <GlassPanel className={`px-3 py-3 xl:px-5 xl:py-4 ${className}`} delay={0.08}>
      <h3 className="mb-1.5 font-mono text-[12px] tracking-[0.12em] text-neon-cyan glow-cyan sm:mb-2 xl:tracking-[0.35em]">
        ACCOUNT · 资金舱
      </h3>

      <div className="mb-1 flex flex-col xl:flex-row xl:items-baseline xl:justify-between">
        <span className="text-xs text-slate-400">总权益</span>
        <NumberTicker
          value={account.equity}
          prefix="¥"
          className="font-mono text-xl font-bold text-slate-100 xl:text-2xl"
        />
      </div>
      <div className="mb-2 flex items-baseline justify-between sm:mb-3">
        <span className="text-xs text-slate-400">累计收益率</span>
        <NumberTicker
          value={account.returnPct * 100}
          suffix="%"
          signed
          className={`font-mono text-lg font-semibold ${pnlClass(account.returnPct)}`}
        />
      </div>

      {/* 手机端：盈亏明细默认折叠，点按展开；桌面端（xl）恒展开、不显示此开关 */}
      <motion.button
        type="button"
        onClick={() => setShowDetail((v) => !v)}
        whileTap={{ scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 600, damping: 20 }}
        aria-expanded={showDetail}
        className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 py-1.5
          font-mono text-[12px] tracking-wider text-slate-400 hover:border-neon-cyan/40 hover:text-neon-cyan xl:hidden"
      >
        {showDetail ? '收起明细 ▴' : '展开盈亏明细 ▾'}
      </motion.button>

      <div
        className={`${showDetail ? 'grid' : 'hidden'} grid-cols-2 gap-x-4 border-t border-white/5 pt-2 xl:block`}
      >
        <Row label="可用资金">
          <NumberTicker value={account.cash} prefix="¥" className="text-slate-200" />
        </Row>
        <Row label="持仓 / 可卖">
          <span className="text-slate-200">
            {position.totalQty}
            <span className="text-slate-500"> / </span>
            <span className="text-neon-cyan">{position.sellableQty}</span>
            {position.todayBuyQty > 0 && (
              <span className="ml-1 text-[12px] text-neon-gold glow-gold">
                T+1 冻结 {position.todayBuyQty}
              </span>
            )}
          </span>
        </Row>
        <Row label="摊薄成本">
          <span className="text-slate-200">
            {position.avgCost > 0 ? `¥${position.avgCost.toFixed(2)}` : '—'}
          </span>
        </Row>
        <Row label="浮动盈亏">
          <NumberTicker
            value={account.floatPnl}
            prefix="¥"
            signed
            className={pnlClass(account.floatPnl)}
          />
        </Row>
        <Row label="已实现盈亏">
          <NumberTicker
            value={account.realizedPnl}
            prefix="¥"
            signed
            className={pnlClass(account.realizedPnl)}
          />
        </Row>
        <Row label="累计费用">
          <NumberTicker value={account.totalFees} prefix="¥" className="text-slate-400" />
        </Row>
      </div>
    </GlassPanel>
  )
}
