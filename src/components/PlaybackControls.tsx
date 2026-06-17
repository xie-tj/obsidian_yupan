import { type ReactNode, useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTradingStore } from '../store/useTradingStore'

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
      className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 font-mono text-xs tracking-wider backdrop-blur-md sm:px-3 sm:py-1
        ${disabled ? 'cursor-not-allowed opacity-35 ' : ''}${
          active
            ? 'border-transparent bg-neon-cyan/15 text-neon-cyan shadow-neon-cyan glow-cyan'
            : 'border-white/10 text-slate-300 hover:border-white/25'
        }`}
    >
      {children}
    </motion.button>
  )
}

function SpeedPicker({ speeds, current, onChange }: {
  speeds: Array<[string, number]>
  current: number
  onChange: (ms: number) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [open])

  const currentLabel = speeds.find(([, ms]) => ms === current)?.[0] ?? '1×'

  return (
    <div ref={ref} className="relative">
      <CtrlButton active={open} onClick={() => setOpen((v) => !v)}>
        {currentLabel} ▾
      </CtrlButton>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -4 }}
            transition={{ type: 'spring', stiffness: 500, damping: 28 }}
            className="absolute left-0 top-full z-50 mt-1.5 flex gap-1 rounded-xl border border-white/10 bg-obsidian-800/95 p-1 shadow-lg backdrop-blur-xl"
          >
            {speeds.map(([label, ms]) => (
              <motion.button
                key={label}
                whileTap={{ scale: 0.85 }}
                transition={springTap}
                onClick={() => { onChange(ms); setOpen(false) }}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1 font-mono text-xs tracking-wider transition-colors
                  ${current === ms
                    ? 'bg-neon-cyan/15 text-neon-cyan glow-cyan'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
              >
                {label}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
    <div id="tutorial-playback" className="flex items-center gap-2">
      <CtrlButton active={playing} onClick={() => setPlaying(!playing)} title="自动播放 / 暂停">
        {playing ? '⏸ 暂停' : '▶ 播放'}
      </CtrlButton>
      <span id="tutorial-step-btn">
        <CtrlButton onClick={step} title={mode === 'daily' ? '步进一个交易日' : '步进一分钟'}>
          ⏭ 步进
        </CtrlButton>
      </span>
      <SpeedPicker speeds={speeds} current={speed} onChange={setSpeed} />
      <CtrlButton onClick={onRestart} title="换一段新行情">
        ↻ 新盲盒
      </CtrlButton>
    </div>
  )
}
