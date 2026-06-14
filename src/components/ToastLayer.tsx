import { AnimatePresence, motion } from 'framer-motion'
import { useTradingStore } from '../store/useTradingStore'

/** 成交回报 / 废单提示：底部弹簧浮层 */
export function ToastLayer() {
  const toasts = useTradingStore((s) => s.toasts)
  const dismiss = useTradingStore((s) => s.dismissToast)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 36, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            onClick={() => dismiss(t.id)}
            className={`pointer-events-auto cursor-pointer rounded-xl border px-4 py-2 font-mono text-xs backdrop-blur-xl
              ${
                t.kind === 'ok'
                  ? 'border-neon-cyan/40 bg-cyan-950/40 text-neon-cyan shadow-neon-cyan'
                  : 'border-neon-red/40 bg-red-950/40 text-neon-red shadow-neon-red'
              }`}
          >
            {t.kind === 'ok' ? '◈ ' : '⚠ '}
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
