import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  MAX_MA_LINES,
  MAX_SUB_PANES,
  MA_PALETTE,
  useIndicatorStore,
  type MainIndicator,
  type SubIndicator,
} from '../store/useIndicatorStore'

/**
 * 指标自定义面板
 *
 *  - 主图指标（互斥单选）：MA 均线组 / BOLL 布林带 / 无
 *      MA：增删（上限 6 条）、改周期、点击色点循环换色、单条显隐
 *      BOLL：周期 / 倍数
 *  - 副图指标（互斥单选）：无 / MACD / KDJ / RSI，参数实时可调
 *  - 全部配置经 zustand persist 持久化到 localStorage
 */

const MAIN_TABS: Array<[MainIndicator, string]> = [
  ['ma', 'MA'],
  ['ema', 'EMA'],
  ['boll', 'BOLL'],
  ['none', '无'],
]

const SUB_TABS: Array<[SubIndicator, string]> = [
  ['macd', 'MACD'],
  ['kdj', 'KDJ'],
  ['rsi', 'RSI'],
  ['wr', 'WR'],
  ['bias', 'BIAS'],
  ['cci', 'CCI'],
]

function NumInput({
  value,
  onChange,
  step = 1,
  width = 'w-14',
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  width?: string
}) {
  return (
    <input
      type="number"
      value={value}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`${width} rounded-md border border-white/10 bg-black/30 px-1.5 py-0.5 text-right
        font-mono text-xs text-slate-100 outline-none focus:border-neon-cyan/50`}
    />
  )
}

function FieldLabel({ children }: { children: string }) {
  return <span className="text-[12px] text-slate-500">{children}</span>
}

/** 互斥单选段控件：滑动霓虹胶囊 */
function Segmented<T extends string>({
  tabs,
  value,
  onChange,
  pillId,
  accent,
}: {
  tabs: Array<[T, string]>
  value: T
  onChange: (v: T) => void
  pillId: string
  accent: 'cyan' | 'violet'
}) {
  const on = accent === 'cyan' ? 'text-neon-cyan' : 'text-neon-violet'
  const pill =
    accent === 'cyan'
      ? 'border-neon-cyan/50 bg-cyan-400/10'
      : 'border-neon-violet/50 bg-violet-400/10'
  return (
    <div className="flex flex-wrap gap-1">
      {tabs.map(([key, label]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`relative rounded-lg px-2.5 py-1 font-mono text-[12px] ${
            value === key ? on : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          {value === key && (
            <motion.span
              layoutId={pillId}
              className={`absolute inset-0 rounded-lg border ${pill}`}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            />
          )}
          <span className="relative">{label}</span>
        </button>
      ))}
    </div>
  )
}

export function IndicatorPanel() {
  const [open, setOpen] = useState(false)
  const s = useIndicatorStore()

  return (
    <div className="relative">
      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.88 }}
        transition={{ type: 'spring', stiffness: 600, damping: 20 }}
        className={`rounded-xl border px-3 py-1.5 font-mono text-xs tracking-wider backdrop-blur-md
          ${
            open
              ? 'border-neon-violet/60 text-neon-violet shadow-[0_0_18px_rgba(157,107,255,.35)]'
              : 'border-white/10 text-slate-300 hover:border-white/25'
          }`}
      >
        ⚙ 指标
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            {/* 点击外部关闭 */}
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <motion.div
              className="glass absolute left-0 top-11 z-40 max-h-[78vh] w-[24rem] max-w-[calc(100vw-1.5rem)] overflow-y-auto px-4 py-3"
              initial={{ opacity: 0, y: -14, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            >
              {/* ── 主图指标（互斥单选） ───────────── */}
              <h4 className="mb-1.5 font-mono text-[12px] tracking-[0.3em] text-neon-cyan">
                主图指标
              </h4>
              <Segmented
                tabs={MAIN_TABS}
                value={s.main}
                onChange={s.setMain}
                pillId="main-pill"
                accent="cyan"
              />

              {(s.main === 'ma' || s.main === 'ema') && (
                <div className="mt-2">
                  <div className="mb-1 flex items-center justify-end">
                    <button
                      onClick={s.addMaLine}
                      disabled={s.maLines.length >= MAX_MA_LINES}
                      className="rounded-md border border-white/10 px-2 py-0.5 text-[12px] text-slate-400
                        hover:border-neon-cyan/40 hover:text-neon-cyan disabled:opacity-30"
                    >
                      + 添加均线
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {s.maLines.map((line) => (
                      <motion.div
                        key={line.id}
                        layout
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                        className="flex items-center gap-2"
                      >
                        <button
                          onClick={() => s.updateMaLine(line.id, { enabled: !line.enabled })}
                          className={`h-3.5 w-3.5 rounded-sm border transition-shadow ${
                            line.enabled
                              ? 'border-neon-cyan/70 bg-cyan-400/30 shadow-neon-cyan'
                              : 'border-white/20 bg-transparent'
                          }`}
                          title={line.enabled ? '隐藏' : '显示'}
                        />
                        <span className="font-mono text-xs text-slate-400">
                          {s.main === 'ema' ? 'EMA' : 'MA'}
                        </span>
                        <NumInput
                          value={line.period}
                          onChange={(v) => s.updateMaLine(line.id, { period: v })}
                        />
                        <button
                          onClick={() => {
                            const idx = MA_PALETTE.indexOf(line.color)
                            s.updateMaLine(line.id, {
                              color: MA_PALETTE[(idx + 1) % MA_PALETTE.length],
                            })
                          }}
                          className="h-4 w-4 rounded-full border border-white/20"
                          style={{ background: line.color, boxShadow: `0 0 8px ${line.color}88` }}
                          title="换色"
                        />
                        <span className="font-mono text-[12px]" style={{ color: line.color }}>
                          {line.color}
                        </span>
                        <button
                          onClick={() => s.removeMaLine(line.id)}
                          className="ml-auto px-1 text-xs text-slate-400 hover:text-neon-red"
                          title="删除"
                        >
                          ✕
                        </button>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {s.main === 'boll' && (
                <div className="mt-2 flex items-center gap-2">
                  <FieldLabel>周期</FieldLabel>
                  <NumInput value={s.boll.period} onChange={(v) => s.setBoll({ period: v })} />
                  <FieldLabel>倍数</FieldLabel>
                  <NumInput
                    value={s.boll.mult}
                    step={0.1}
                    onChange={(v) => s.setBoll({ mult: v })}
                    width="w-12"
                  />
                </div>
              )}

              {/* ── 副图窗格（数量可配 0~3，每格独立选指标）────── */}
              <div className="mt-3 border-t border-white/5 pt-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <h4 className="font-mono text-[12px] tracking-[0.3em] text-neon-violet">
                    副图指标 · {s.subs.length} 个窗格
                  </h4>
                  <button
                    onClick={s.addSubPane}
                    disabled={s.subs.length >= MAX_SUB_PANES}
                    className="rounded-md border border-white/10 px-2 py-0.5 text-[12px] text-slate-400
                      hover:border-neon-violet/40 hover:text-neon-violet disabled:opacity-30"
                  >
                    + 添加副图
                  </button>
                </div>

                {s.subs.length === 0 && (
                  <p className="text-[12px] text-slate-400">暂无副图，点击右上角「+ 添加副图」</p>
                )}
                <div className="space-y-1.5">
                  {s.subs.map((kind, i) => (
                    <motion.div
                      key={i}
                      layout
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                      className="flex items-center gap-2"
                    >
                      <span className="font-mono text-[12px] text-slate-500">副图{i + 1}</span>
                      <Segmented
                        tabs={SUB_TABS}
                        value={kind}
                        onChange={(k) => s.setSubAt(i, k)}
                        pillId={`sub-pill-${i}`}
                        accent="violet"
                      />
                      <button
                        onClick={() => s.removeSubPane(i)}
                        className="ml-auto px-1 text-xs text-slate-400 hover:text-neon-red"
                        title="删除该副图"
                      >
                        ✕
                      </button>
                    </motion.div>
                  ))}
                </div>

                {/* 参数区：按当前用到的指标类型显示（参数对同类副图全局共享） */}
                {s.subs.includes('macd') && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="w-9 font-mono text-[12px] text-slate-400">MACD</span>
                    <FieldLabel>快线</FieldLabel>
                    <NumInput value={s.macd.fast} onChange={(v) => s.setMacd({ fast: v })} />
                    <FieldLabel>慢线</FieldLabel>
                    <NumInput value={s.macd.slow} onChange={(v) => s.setMacd({ slow: v })} />
                    <FieldLabel>信号</FieldLabel>
                    <NumInput value={s.macd.signal} onChange={(v) => s.setMacd({ signal: v })} />
                  </div>
                )}
                {s.subs.includes('kdj') && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="w-9 font-mono text-[12px] text-slate-400">KDJ</span>
                    <FieldLabel>N</FieldLabel>
                    <NumInput value={s.kdj.n} onChange={(v) => s.setKdj({ n: v })} />
                    <FieldLabel>K平滑</FieldLabel>
                    <NumInput value={s.kdj.k} onChange={(v) => s.setKdj({ k: v })} />
                    <FieldLabel>D平滑</FieldLabel>
                    <NumInput value={s.kdj.d} onChange={(v) => s.setKdj({ d: v })} />
                  </div>
                )}
                {s.subs.includes('rsi') && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="w-9 font-mono text-[12px] text-slate-400">RSI</span>
                    <FieldLabel>周期</FieldLabel>
                    <NumInput value={s.rsi.period} onChange={(v) => s.setRsi({ period: v })} />
                    <span className="text-[12px] text-slate-400">参考线 30 / 50 / 70</span>
                  </div>
                )}
                {s.subs.includes('wr') && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="w-9 font-mono text-[12px] text-slate-400">WR</span>
                    <FieldLabel>周期</FieldLabel>
                    <NumInput value={s.wr.period} onChange={(v) => s.setWr({ period: v })} />
                    <span className="text-[12px] text-slate-400">超买 20 / 超卖 80</span>
                  </div>
                )}
                {s.subs.includes('bias') && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="w-9 font-mono text-[12px] text-slate-400">BIAS</span>
                    <FieldLabel>短</FieldLabel>
                    <NumInput value={s.bias.p1} onChange={(v) => s.setBias({ p1: v })} />
                    <FieldLabel>中</FieldLabel>
                    <NumInput value={s.bias.p2} onChange={(v) => s.setBias({ p2: v })} />
                    <FieldLabel>长</FieldLabel>
                    <NumInput value={s.bias.p3} onChange={(v) => s.setBias({ p3: v })} />
                  </div>
                )}
                {s.subs.includes('cci') && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="w-9 font-mono text-[12px] text-slate-400">CCI</span>
                    <FieldLabel>周期</FieldLabel>
                    <NumInput value={s.cci.period} onChange={(v) => s.setCci({ period: v })} />
                    <span className="text-[12px] text-slate-400">参考线 ±100</span>
                  </div>
                )}
              </div>

              <button
                onClick={s.resetAll}
                className="mt-3 w-full rounded-lg border border-white/10 py-1.5 font-mono text-[12px]
                  tracking-widest text-slate-400 hover:border-neon-cyan/40 hover:text-neon-cyan"
              >
                ↺ 恢复默认配置
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
