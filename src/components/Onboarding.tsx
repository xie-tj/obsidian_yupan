import { useEffect, useRef, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTutorialStore } from '../store/useTutorialStore'
import { useTradingStore } from '../store/useTradingStore'

interface StepDef {
  target?: string
  title: string
  desc: string
  action: 'click' | 'step' | 'buy' | 'sell'
  need?: number
}

const STEPS: StepDef[] = [
  {
    title: '欢迎进入 OBSIDIAN · 驭盘',
    desc: '接下来用 1 分钟，带你完成第一笔模拟交易。\n隐藏股票身份，纯凭走势做决策——这就是「盲盒训练」。',
    action: 'click',
  },
  {
    target: 'tutorial-chart',
    title: '这是 K 线走势图',
    desc: '一段隐藏身份的日 K 线行情。红涨绿跌，每根 K 线 = 一个交易日。结算时才揭晓是哪只股票。',
    action: 'click',
  },
  {
    target: 'tutorial-step-btn',
    title: '推进行情',
    desc: '点击「步进」推进一根 K 线。试试连续点 3 次，观察走势变化！',
    action: 'step',
    need: 3,
  },
  {
    target: 'tutorial-buy',
    title: '买入建仓',
    desc: '觉得时机不错？点击「买入」满仓建仓！\n默认全仓模式：一键买入最大可买数量。',
    action: 'buy',
  },
  {
    target: 'tutorial-step-btn',
    title: 'T+1 规则',
    desc: 'A 股规则：今天买入的股票，明天才能卖出。\n点击「步进」推进一天，解冻你的持仓。',
    action: 'step',
    need: 1,
  },
  {
    target: 'tutorial-sell',
    title: '卖出获利',
    desc: '持仓已解冻！点击「卖出」清仓，落袋为安。\n观察交易流水里的盈亏记录。',
    action: 'sell',
  },
  {
    title: '恭喜，你已掌握基本操作！',
    desc: '继续推进行情直到结束，会看到完整的结算报告——\n对比你的收益 vs 买入持有 vs 理论最佳。\n\n点击「播放」自动推进，或用「步进」逐根分析。\n快捷键：空格 播放 · → 步进 · B 买 · S 卖 · N 新盲盒',
    action: 'click',
  },
]

function useTargetRect(targetId?: string, step?: number) {
  const [rect, setRect] = useState<DOMRect | null>(null)

  const update = useCallback(() => {
    if (!targetId) { setRect(null); return }
    const el = document.getElementById(targetId)
    if (el) setRect(el.getBoundingClientRect())
    else setRect(null)
  }, [targetId])

  useEffect(() => {
    if (targetId) {
      const el = document.getElementById(targetId)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    const t = setTimeout(update, 350)
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    const id = setInterval(update, 400)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      clearInterval(id)
    }
  }, [update, step, targetId])

  return rect
}

function SpotlightOverlay({ rect }: { rect: DOMRect | null }) {
  if (!rect) return null
  const pad = 8
  return (
    <motion.div
      className="pointer-events-none fixed z-[55]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        left: rect.left - pad,
        top: rect.top - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
        borderRadius: 16,
        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6), 0 0 24px 4px rgba(34, 230, 255, 0.15)',
      }}
    />
  )
}

function Tooltip({
  rect,
  step,
  stepDef,
  actionCount,
  onNext,
  onSkip,
}: {
  rect: DOMRect | null
  step: number
  stepDef: StepDef
  actionCount: number
  onNext: () => void
  onSkip: () => void
}) {
  const isCenter = !stepDef.target
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
  const isActionStep = stepDef.action !== 'click'
  const remaining = (stepDef.need ?? 1) - actionCount

  let pos: React.CSSProperties
  if (isCenter && isMobile) {
    pos = { left: 12, right: 12, top: '50%', transform: 'translateY(-50%)' }
  } else if (isCenter) {
    pos = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
  } else if (isMobile) {
    pos = {
      left: 8,
      right: 8,
      bottom: 16,
    }
  } else if (rect) {
    const largeTarget = rect.height > window.innerHeight * 0.4
    if (largeTarget) {
      pos = {
        left: rect.left + rect.width / 2 - 176,
        top: Math.min(rect.bottom - 220, window.innerHeight - 240),
      }
    } else {
      const below = rect.bottom + 16
      const above = rect.top - 16
      const fitsBelow = below + 200 < window.innerHeight
      const clampLeft = Math.max(12, Math.min(rect.left, window.innerWidth - 380))
      pos = fitsBelow
        ? { left: clampLeft, top: below }
        : { left: clampLeft, bottom: Math.max(12, window.innerHeight - above) }
    }
  } else {
    pos = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
  }

  const isLast = step === STEPS.length
  const btnLabel = isLast ? '完成教程 →' : isActionStep ? undefined : '下一步 →'
  const progressLabel = isActionStep && remaining > 0
    ? stepDef.action === 'step' ? `还需步进 ${remaining} 次` : '等待操作…'
    : undefined

  return (
    <motion.div
      className="fixed z-[56] w-[calc(100%-16px)] max-w-[22rem] sm:w-auto"
      style={pos}
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
    >
      <div className="glass px-5 py-4 shadow-2xl" style={{ borderColor: 'rgba(34, 230, 255, 0.3)' }}>
        <div className="mb-1 flex items-center justify-between">
          <span className="font-mono text-[11px] tracking-[0.2em] text-neon-cyan/70">
            {step} / {STEPS.length}
          </span>
          <button
            onClick={onSkip}
            className="font-mono text-[11px] tracking-wider text-slate-500 transition-colors hover:text-slate-300"
          >
            跳过教程
          </button>
        </div>

        <h3 className="mb-1.5 font-mono text-sm font-semibold text-slate-100">
          {stepDef.title}
        </h3>
        <p className="whitespace-pre-line text-[13px] leading-relaxed text-slate-400">
          {stepDef.desc}
        </p>

        {progressLabel && (
          <p className="mt-2 animate-pulse font-mono text-xs text-neon-cyan">
            {progressLabel}
          </p>
        )}

        {btnLabel && (
          <motion.button
            onClick={onNext}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 550, damping: 20 }}
            className="mt-3 w-full rounded-xl border border-neon-cyan/50 py-2.5 font-mono text-sm tracking-[0.2em]
              text-neon-cyan shadow-neon-cyan glow-cyan"
          >
            {btnLabel}
          </motion.button>
        )}
      </div>
    </motion.div>
  )
}

export function Onboarding() {
  const step = useTutorialStore((s) => s.step)
  const actionCount = useTutorialStore((s) => s.actionCount)
  const next = useTutorialStore((s) => s.next)
  const tick = useTutorialStore((s) => s.tick)
  const finish = useTutorialStore((s) => s.finish)

  const stepDef = step > 0 ? STEPS[step - 1] : null
  const rect = useTargetRect(stepDef?.target, step)

  const prevVisibleCount = useRef<number | null>(null)
  const prevTradesLen = useRef<number | null>(null)

  useEffect(() => {
    if (!step || !stepDef) return

    const unsub = useTradingStore.subscribe((state) => {
      const currentStep = useTutorialStore.getState().step
      const def = currentStep > 0 ? STEPS[currentStep - 1] : null
      if (!def) return

      const vc = state.daily?.visibleCount ?? 0
      const tLen = state.account?.trades.length ?? 0

      if (def.action === 'step') {
        if (prevVisibleCount.current !== null && vc > prevVisibleCount.current) {
          const { actionCount: ac, tick: doTick, next: doNext } = useTutorialStore.getState()
          doTick()
          if (ac + 1 >= (def.need ?? 1)) {
            doNext()
          }
        }
        prevVisibleCount.current = vc
      } else if (def.action === 'buy') {
        if (prevTradesLen.current !== null && tLen > prevTradesLen.current) {
          const lastTrade = state.account?.trades[tLen - 1]
          if (lastTrade?.side === 'buy') {
            useTutorialStore.getState().next()
          }
        }
        prevTradesLen.current = tLen
      } else if (def.action === 'sell') {
        if (prevTradesLen.current !== null && tLen > prevTradesLen.current) {
          const lastTrade = state.account?.trades[tLen - 1]
          if (lastTrade?.side === 'sell') {
            useTutorialStore.getState().next()
          }
        }
        prevTradesLen.current = tLen
      }
    })

    const state = useTradingStore.getState()
    prevVisibleCount.current = state.daily?.visibleCount ?? 0
    prevTradesLen.current = state.account?.trades.length ?? 0

    return unsub
  }, [step, stepDef])

  useEffect(() => {
    if (!stepDef?.target) return
    const el = document.getElementById(stepDef.target)
    if (el) {
      el.classList.add('tutorial-spotlight-target')
      return () => el.classList.remove('tutorial-spotlight-target')
    }
  }, [stepDef?.target])

  if (!step || !stepDef) return null

  const isCenter = !stepDef.target

  return (
    <AnimatePresence mode="wait">
      <motion.div key={step}>
        {isCenter && (
          <motion.div
            className="fixed inset-0 z-[54] bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}

        <SpotlightOverlay rect={rect} />

        <Tooltip
          rect={rect}
          step={step}
          stepDef={stepDef}
          actionCount={actionCount}
          onNext={step >= STEPS.length ? finish : next}
          onSkip={finish}
        />
      </motion.div>
    </AnimatePresence>
  )
}
