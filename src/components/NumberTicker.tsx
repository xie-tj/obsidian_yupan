import { useEffect } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'framer-motion'

interface NumberTickerProps {
  value: number
  decimals?: number
  prefix?: string
  suffix?: string
  /** 正数自动加 + 号（盈亏展示） */
  signed?: boolean
  className?: string
}

/** 盈亏 / 资金数字滚动：弹簧插值而非线性补间，带轻微过冲的"呼吸落点" */
export function NumberTicker({
  value,
  decimals = 2,
  prefix = '',
  suffix = '',
  signed = false,
  className,
}: NumberTickerProps) {
  const mv = useMotionValue(value)

  useEffect(() => {
    const controls = animate(mv, value, { type: 'spring', stiffness: 95, damping: 24, mass: 0.9 })
    return () => controls.stop()
  }, [value, mv])

  const text = useTransform(mv, (v) => {
    const sign = signed && v > 0 ? '+' : ''
    return `${prefix}${sign}${v.toLocaleString('zh-CN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}${suffix}`
  })

  return <motion.span className={className}>{text}</motion.span>
}
