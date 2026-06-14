import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface GlassPanelProps {
  children: ReactNode
  className?: string
  /** 入场延迟，做面板级联弹入 */
  delay?: number
}

/** 玻璃拟物面板：弹簧入场（无线性过渡） */
export function GlassPanel({ children, className = '', delay = 0 }: GlassPanelProps) {
  return (
    <motion.section
      className={`glass ${className}`}
      initial={{ opacity: 0, y: 28, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 170, damping: 22, mass: 0.9, delay }}
    >
      {children}
    </motion.section>
  )
}
