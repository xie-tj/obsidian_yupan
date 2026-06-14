import { AnimatePresence, motion } from 'framer-motion'

/**
 * 首次引导：解决"功能藏得太深"——把训练目标 + 全部交互一次讲清。
 * 首访自动弹出（localStorage 标记），顶栏「?」可随时重开。
 */

const STEPS: Array<{ icon: string; title: string; desc: string }> = [
  {
    icon: '◐',
    title: '盲盒复盘',
    desc: '隐藏代码、名称、日期，只给你走势——消除主观偏见，纯凭盘面练买卖。走完一局才揭晓身份。',
  },
  {
    icon: '▶',
    title: '推进行情',
    desc: '播放 / 暂停自动走，步进逐根推进。日线一根=一个交易日，分时一格=一分钟。快捷键：空格 播放，→ 步进。',
  },
  {
    icon: '◈',
    title: '全真下单',
    desc: '默认「全仓进出」：点买入即满仓、卖出即清仓，快捷键 B 买 / S 卖，快速复盘无需调手数。严格遵循 T+1、主板±10% 创业科创±20% 涨跌停，精算佣金+印花税+过户费。',
  },
  {
    icon: '⚙',
    title: '自定义指标',
    desc: '点控件栏「⚙ 指标」：主图选 MA / EMA / BOLL，副图可加 0~4 个窗格，每格从 MACD/KDJ/RSI/WR/BIAS/CCI 中选，参数全可调。',
  },
  {
    icon: '◎',
    title: '复盘闭环',
    desc: '结算时对比你的收益 vs 买入持有 vs 理论最佳，并留存历次战绩、追踪你是否在进步。',
  },
]

export function Onboarding({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="glass max-h-[90vh] w-full max-w-[34rem] overflow-y-auto px-6 py-7 sm:px-8"
            initial={{ scale: 0.85, y: 40, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-mono text-lg font-bold tracking-[0.15em] text-slate-100">
              欢迎进入 <span className="text-neon-cyan glow-cyan">OBSIDIAN · 驭盘</span>
            </h2>
            <p className="mb-5 mt-1 text-sm text-slate-400">A 股模拟交易与复盘训练舱 · 30 秒上手</p>

            <div className="space-y-3">
              {STEPS.map((s, i) => (
                <motion.div
                  key={s.title}
                  className="flex gap-3"
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 26, delay: 0.08 + i * 0.07 }}
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neon-cyan/30 bg-cyan-400/5 text-neon-cyan">
                    {s.icon}
                  </span>
                  <div>
                    <p className="font-mono text-sm font-semibold text-slate-100">{s.title}</p>
                    <p className="text-sm leading-relaxed text-slate-400">{s.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.button
              onClick={onClose}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 550, damping: 20 }}
              className="mt-6 w-full rounded-xl border border-neon-cyan/50 py-3 font-mono text-sm tracking-[0.3em]
                text-neon-cyan shadow-neon-cyan glow-cyan"
            >
              开始训练 →
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
