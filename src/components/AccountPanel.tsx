import type { ReactNode } from 'react'
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

export function AccountPanel() {
  const account = useTradingStore((s) => s.account)
  if (!account) return null

  const { position } = account
  return (
    <GlassPanel className="px-5 py-4" delay={0.08}>
      <h3 className="mb-2 font-mono text-[12px] tracking-[0.35em] text-neon-cyan glow-cyan">
        ACCOUNT · 资金舱
      </h3>

      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs text-slate-400">总权益</span>
        <NumberTicker
          value={account.equity}
          prefix="¥"
          className="font-mono text-2xl font-bold text-slate-100"
        />
      </div>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-xs text-slate-400">累计收益率</span>
        <NumberTicker
          value={account.returnPct * 100}
          suffix="%"
          signed
          className={`font-mono text-lg font-semibold ${pnlClass(account.returnPct)}`}
        />
      </div>

      <div className="border-t border-white/5 pt-2">
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
