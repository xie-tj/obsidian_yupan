import { Suspense, lazy, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { DailyBlindTest } from './modules/DailyBlindTest'
import { IntradayTraining } from './modules/IntradayTraining'
import { ToastLayer } from './components/ToastLayer'
import { Onboarding } from './components/Onboarding'
import { useTradingStore, type Mode } from './store/useTradingStore'
import { useOrderStore } from './store/useOrderStore'

// Three.js 流体背景纯装饰，从首屏关键路径懒加载（~600KB 不阻塞首次绘制）
const FluidBackground = lazy(() =>
  import('./three/FluidBackground').then((m) => ({ default: m.FluidBackground })),
)

/** 流体加载前 / 无 WebGL 时的静态星云占位：暗夜基调 + 霓虹氛围，无黑屏闪烁 */
const STATIC_NEBULA =
  'radial-gradient(60rem 40rem at 18% 8%, rgba(20,120,160,0.16), transparent 60%),' +
  'radial-gradient(50rem 36rem at 85% 90%, rgba(150,60,30,0.10), transparent 65%),' +
  'radial-gradient(40rem 30rem at 70% 25%, rgba(34,230,255,0.05), transparent 60%), #05070d'

const ONBOARDED_KEY = 'obsidian-onboarded'

/**
 * 全局快捷键：空格 播放/暂停 · → / . 步进 · N 新盲盒 · B 买入 · S 卖出
 * （输入框聚焦时不触发；B/S 按下单舱当前模式决定满仓还是手动手数）
 */
function usePlaybackHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      const s = useTradingStore.getState()
      const session = s.mode === 'daily' ? s.daily : s.intraday
      if (!session) return
      if (e.code === 'Space') {
        e.preventDefault()
        if (!session.finished) s.setPlaying(!session.playing)
      } else if (e.key === 'ArrowRight' || e.key === '.') {
        e.preventDefault()
        s.step()
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        s.mode === 'daily' ? s.startDaily() : s.startIntraday()
      } else if (e.key === 'b' || e.key === 'B') {
        if (session.finished) return
        e.preventDefault()
        const o = useOrderStore.getState()
        o.fullPosition ? s.buyMax() : s.buy(o.lots * 100)
      } else if (e.key === 's' || e.key === 'S') {
        if (session.finished) return
        e.preventDefault()
        const o = useOrderStore.getState()
        o.fullPosition ? s.sellAll() : s.sell(o.lots * 100)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/**
 * 层级融合（Z 轴方案）：
 *   z-0   <FluidBackground/> —— 固定全屏 WebGL 流体 + screen 混合的扫描网格
 *   z-10  主内容层 —— 玻璃面板 backdrop-filter 实时折射下方流体
 *   z-50  Toast / 结算弹窗
 */

const TABS: Array<{ key: Mode; label: string; en: string }> = [
  { key: 'daily', label: '日线盲盒', en: 'BLIND BOX' },
  { key: 'intraday', label: '分时训练', en: 'INTRADAY' },
]

export default function App() {
  const mode = useTradingStore((s) => s.mode)
  const setMode = useTradingStore((s) => s.setMode)
  const [showGuide, setShowGuide] = useState(false)

  usePlaybackHotkeys()

  // 首访自动弹引导（localStorage 标记一次）
  useEffect(() => {
    if (!localStorage.getItem(ONBOARDED_KEY)) setShowGuide(true)
  }, [])

  const closeGuide = () => {
    setShowGuide(false)
    localStorage.setItem(ONBOARDED_KEY, '1')
  }

  return (
    <div className="relative min-h-screen">
      <Suspense fallback={<div className="fixed inset-0 z-0" style={{ background: STATIC_NEBULA }} />}>
        <FluidBackground />
      </Suspense>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[100rem] flex-col px-4 py-5 lg:px-8">
        {/* ── 顶栏 ─────────────────────────────── */}
        <motion.header
          className="mb-5 flex shrink-0 flex-wrap items-center gap-6"
          initial={{ opacity: 0, y: -24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 160, damping: 20 }}
        >
          <h1 className="flex items-baseline gap-3">
            <span className="font-mono text-xl font-bold tracking-[0.2em] text-slate-100">
              OBSIDIAN<span className="text-neon-cyan glow-cyan">·驭盘</span>
            </span>
            <span className="hidden font-mono text-[12px] tracking-[0.3em] text-slate-500 sm:inline">
              A-SHARE SIMULATION DECK
            </span>
          </h1>

          {/* 模式切换：滑动霓虹胶囊（layoutId 弹簧位移） */}
          <nav className="flex rounded-2xl border border-white/10 bg-black/25 p-1 backdrop-blur-xl">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setMode(t.key)}
                className="relative rounded-xl px-5 py-2 font-mono text-xs tracking-widest"
              >
                {mode === t.key && (
                  <motion.span
                    layoutId="tab-pill"
                    className="absolute inset-0 rounded-xl border border-neon-cyan/50 bg-cyan-400/10 shadow-neon-cyan"
                    transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  />
                )}
                <span
                  className={`relative ${
                    mode === t.key ? 'text-neon-cyan glow-cyan' : 'text-slate-400'
                  }`}
                >
                  {t.label} <span className="opacity-50">{t.en}</span>
                </span>
              </button>
            ))}
          </nav>

          {/* 右侧：规则摘要 + 快捷键提示 + 重开引导 */}
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden text-right font-mono leading-tight lg:block">
              <div className="text-[12px] text-slate-400">
                T+1 · 主板±10% / 创业·科创±20% · 全真结算
              </div>
              <div className="text-[12px] text-slate-500">空格播放 · → 步进 · B/S 买卖 · N 新盲盒</div>
            </div>
            <motion.button
              onClick={() => setShowGuide(true)}
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 600, damping: 18 }}
              title="使用说明"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 font-mono text-sm text-slate-300 hover:border-neon-cyan/50 hover:text-neon-cyan"
            >
              ?
            </motion.button>
          </div>
        </motion.header>

        {/* ── 模块切换：弹簧进出场 ─────────────────── */}
        <AnimatePresence mode="wait">
          <motion.main
            key={mode}
            className="min-h-0 flex-1"
            initial={{ opacity: 0, y: 32, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 200, damping: 24, mass: 0.9 }}
          >
            {mode === 'daily' ? <DailyBlindTest /> : <IntradayTraining />}
          </motion.main>
        </AnimatePresence>
      </div>

      <ToastLayer />
      <Onboarding open={showGuide} onClose={closeGuide} />
    </div>
  )
}
