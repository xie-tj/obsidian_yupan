import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useTradingStore } from '../store/useTradingStore'

/** 播放 / 暂停 / 步进 / 倍速 —— 所有按钮交互均为弹簧反馈 */

const springTap = { type: 'spring', stiffness: 600, damping: 20 } as const

function CtrlButton({
  children,
  onClick,
  active = false,
  title,
  disabled = false,
}: {
  children: ReactNode
  onClick: () => void
  active?: boolean
  title?: string
  disabled?: boolean
}) {
  return (
    <motion.button
      onClick={onClick}
      title={title}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.08 }}
      whileTap={disabled ? undefined : { scale: 0.88 }}
      transition={springTap}
      className={`rounded-xl border px-3 py-1.5 font-mono text-xs tracking-wider backdrop-blur-md
        ${disabled ? 'cursor-not-allowed opacity-35 ' : ''}${
          active
            ? 'border-neon-cyan/60 text-neon-cyan shadow-neon-cyan glow-cyan'
            : 'border-white/10 text-slate-300 hover:border-white/25'
        }`}
    >
      {children}
    </motion.button>
  )
}

export function PlaybackControls({
  playing,
  speed,
  onRestart,
}: {
  playing: boolean
  speed: number
  onRestart: () => void
}) {
  const setPlaying = useTradingStore((s) => s.setPlaying)
  const setSpeed = useTradingStore((s) => s.setSpeed)
  const step = useTradingStore((s) => s.step)
  const mode = useTradingStore((s) => s.mode)

  const speeds: Array<[string, number]> =
    mode === 'daily'
      ? [
          ['0.5×', 1200],
          ['1×', 600],
          ['3×', 200],
        ]
      : [
          ['0.5×', 240],
          ['1×', 120],
          ['4×', 30],
        ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      <CtrlButton active={playing} onClick={() => setPlaying(!playing)} title="自动播放 / 暂停">
        {playing ? '⏸ 暂停' : '▶ 播放'}
      </CtrlButton>
      <CtrlButton onClick={step} title={mode === 'daily' ? '步进一个交易日' : '步进一分钟'}>
        ⏭ 步进
      </CtrlButton>
      <div className="mx-1 h-5 w-px bg-white/10" />
      {speeds.map(([label, ms]) => (
        <CtrlButton key={label} active={speed === ms} onClick={() => setSpeed(ms)}>
          {label}
        </CtrlButton>
      ))}
      <div className="mx-1 h-5 w-px bg-white/10" />
      <CtrlButton onClick={onRestart} title="换一段新行情">
        ↻ 新盲盒
      </CtrlButton>
    </div>
  )
}
