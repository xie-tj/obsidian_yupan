import { useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from 'framer-motion'

/**
 * 买入 / 卖出按钮 —— 弹簧物理 + 3D 悬浮反馈
 *
 *  - 指针在按钮上方移动时，按钮绕 X/Y 轴做弹簧跟随倾斜（perspective 3D）；
 *  - 高光点随指针滑动，模拟玻璃曲面反光；
 *  - 按下时整体下沉（spring stiffness 650），松开回弹带阻尼过冲；
 *  - 点击产生霓虹冲击波涟漪（AnimatePresence 管理进出场）。
 *
 * A 股配色约定：红涨绿跌 → 买入为霓虹红橙，卖出为霓虹青绿。
 */

const THEME = {
  buy: {
    label: '买入',
    en: 'LONG',
    base: 'rgba(255, 59, 77, 1)',
    soft: 'rgba(255, 59, 77, 0.16)',
    glow: '0 0 22px rgba(255,59,77,.55), 0 0 70px rgba(255,59,77,.22)',
    ring: 'rgba(255, 120, 73, 0.9)',
  },
  sell: {
    label: '卖出',
    en: 'SHORT',
    base: 'rgba(45, 255, 179, 1)',
    soft: 'rgba(45, 255, 179, 0.14)',
    glow: '0 0 22px rgba(45,255,179,.5), 0 0 70px rgba(45,255,179,.2)',
    ring: 'rgba(34, 230, 255, 0.9)',
  },
} as const

interface TradeButtonProps {
  side: 'buy' | 'sell'
  sub?: string
  disabled?: boolean
  onTrade: () => void
}

interface Ripple {
  id: number
  x: number
  y: number
}

let rippleId = 0

export function TradeButton({ side, sub, disabled, onTrade }: TradeButtonProps) {
  const theme = THEME[side]
  const ref = useRef<HTMLButtonElement>(null)
  const [ripples, setRipples] = useState<Ripple[]>([])

  // 指针位置（-0.5 .. 0.5），经弹簧后驱动 3D 倾斜
  const px = useMotionValue(0)
  const py = useMotionValue(0)
  const springCfg = { stiffness: 240, damping: 16, mass: 0.7 }
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [11, -11]), springCfg)
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-13, 13]), springCfg)
  // 曲面高光随指针游走
  const glowLeft = useTransform(px, [-0.5, 0.5], ['18%', '82%'])
  const glowTop = useTransform(py, [-0.5, 0.5], ['10%', '90%'])

  const handlePointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    px.set((e.clientX - rect.left) / rect.width - 0.5)
    py.set((e.clientY - rect.top) / rect.height - 0.5)
  }

  const handleLeave = () => {
    px.set(0)
    py.set(0)
  }

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (disabled) return
    const rect = ref.current?.getBoundingClientRect()
    if (rect) {
      const r: Ripple = { id: rippleId++, x: e.clientX - rect.left, y: e.clientY - rect.top }
      setRipples((rs) => [...rs.slice(-4), r])
      setTimeout(() => setRipples((rs) => rs.filter((x) => x.id !== r.id)), 700)
    }
    onTrade()
  }

  return (
    <div style={{ perspective: 700 }}>
      <motion.button
        ref={ref}
        onPointerMove={handlePointerMove}
        onPointerLeave={handleLeave}
        onClick={handleClick}
        disabled={disabled}
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
          background: `linear-gradient(150deg, ${theme.soft}, rgba(10,14,23,0.7))`,
          border: `1px solid ${theme.base.replace('1)', '0.45)')}`,
          boxShadow: disabled ? 'none' : theme.glow,
        }}
        whileHover={disabled ? undefined : { scale: 1.04 }}
        whileTap={disabled ? undefined : { scale: 0.91 }}
        // 全局禁用线性过渡：所有状态切换都走弹簧
        transition={{ type: 'spring', stiffness: 650, damping: 22, mass: 0.8 }}
        className={`relative w-full select-none overflow-hidden rounded-2xl px-4 py-3 text-left xl:px-6 xl:py-4
          backdrop-blur-md ${disabled ? 'opacity-35 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        {/* 指针跟随的曲面高光（screen 混合融入流体背景） */}
        <motion.span
          className="pointer-events-none absolute h-32 w-32 rounded-full"
          style={{
            left: glowLeft,
            top: glowTop,
            x: '-50%',
            y: '-50%',
            background: `radial-gradient(circle, ${theme.base.replace('1)', '0.28)')} 0%, transparent 70%)`,
            mixBlendMode: 'screen',
          }}
        />

        {/* 霓虹冲击波涟漪 */}
        <AnimatePresence>
          {ripples.map((r) => (
            <motion.span
              key={r.id}
              className="pointer-events-none absolute rounded-full"
              style={{
                left: r.x,
                top: r.y,
                x: '-50%',
                y: '-50%',
                border: `1.5px solid ${theme.ring}`,
                width: 24,
                height: 24,
              }}
              initial={{ scale: 0.4, opacity: 0.9 }}
              animate={{ scale: 7, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }} // custom cubic-bezier 出膛感
            />
          ))}
        </AnimatePresence>

        {/* 文字层抬升 30px，3D 倾斜时产生视差 */}
        <span
          className="relative flex flex-wrap items-baseline gap-x-3 gap-y-0.5"
          style={{ transform: 'translateZ(30px)' }}
        >
          <span
            className="text-xl font-bold tracking-widest xl:text-2xl"
            style={{ color: theme.base, textShadow: `0 0 14px ${theme.base.replace('1)', '0.8)')}` }}
          >
            {theme.label}
          </span>
          <span className="hidden font-mono text-[12px] tracking-[0.3em] text-slate-400 xl:inline">
            {theme.en}
          </span>
          {sub && <span className="ml-auto font-mono text-xs text-slate-300">{sub}</span>}
        </span>
      </motion.button>
    </div>
  )
}
