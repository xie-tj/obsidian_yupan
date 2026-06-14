import { useEffect, useRef } from 'react'
import type { BoardType, MinutePoint, TradeRecord } from '../core/engine/types'
import { priceLimitOf } from '../core/engine/rules'
import { minuteLabel } from '../core/data/generator'

/**
 * 分时图（纯 Canvas 手绘）
 *
 *  - 白线 = 现价，黄线 = 当日均价；
 *  - 线头带"心电图"式动态光斑：持续 rAF 渲染，呼吸脉冲 + 尾迹辉光；
 *  - 还原 9:30-11:30 / 13:00-15:00 双时段（午休在 x 轴上无缝拼接，中点画分隔）；
 *  - 纵轴左侧价格 / 右侧涨跌幅，A 股红涨绿跌；
 *  - 买卖点以霓虹三角实时标注。
 */

interface TimeShareChartProps {
  points: MinutePoint[]
  visibleCount: number
  prevClose: number
  board: BoardType
  trades: TradeRecord[]
  className?: string
}

const UP = 'rgba(255, 80, 95, 1)'
const DOWN = 'rgba(45, 255, 179, 1)'

export function TimeShareChart({
  points,
  visibleCount,
  prevClose,
  board,
  trades,
  className,
}: TimeShareChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // rAF 闭包里始终读取最新 props
  const stateRef = useRef({ points, visibleCount, prevClose, board, trades })
  stateRef.current = { points, visibleCount, prevClose, board, trades }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr))
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr))
    })
    ro.observe(canvas)

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      const { points, visibleCount, prevClose, board, trades } = stateRef.current
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const W = canvas.width / dpr
      const H = canvas.height / dpr
      if (W < 10 || H < 10) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)

      const padL = 56
      const padR = 56
      const padT = 14
      const volH = H * 0.16 // 底部成交量区
      const priceH = H - padT - volH - 26
      const plotW = W - padL - padR

      const visible = points.slice(0, Math.max(1, visibleCount))
      const last = visible[visible.length - 1]

      // 纵轴范围：围绕昨收对称，至少 ±1.5%，被涨跌停限幅
      const { ratio } = priceLimitOf(prevClose, board)
      let maxDev = 0.015
      for (const p of visible) {
        maxDev = Math.max(maxDev, Math.abs(p.price / prevClose - 1), Math.abs(p.avgPrice / prevClose - 1))
      }
      maxDev = Math.min(ratio, maxDev * 1.15)

      const xOf = (m: number) => padL + (m / 239) * plotW
      const yOf = (price: number) =>
        padT + priceH / 2 - ((price / prevClose - 1) / maxDev) * (priceH / 2)

      // ── 网格与坐标 ──────────────────────────────
      ctx.font = '10px "JetBrains Mono", monospace'
      ctx.textBaseline = 'middle'
      const rows = 4 // 上下各 4 格
      for (let r = -rows; r <= rows; r++) {
        const dev = (maxDev * r) / rows
        const y = yOf(prevClose * (1 + dev))
        ctx.strokeStyle = r === 0 ? 'rgba(160,180,220,0.22)' : 'rgba(110,150,220,0.07)'
        ctx.setLineDash(r === 0 ? [4, 4] : [])
        ctx.beginPath()
        ctx.moveTo(padL, y)
        ctx.lineTo(W - padR, y)
        ctx.stroke()
        ctx.setLineDash([])
        // 左：价格；右：涨跌幅（红涨绿跌）
        ctx.fillStyle = dev > 0 ? UP : dev < 0 ? DOWN : 'rgba(180,195,220,0.8)'
        ctx.textAlign = 'right'
        ctx.fillText((prevClose * (1 + dev)).toFixed(2), padL - 6, y)
        ctx.textAlign = 'left'
        ctx.fillText(`${(dev * 100).toFixed(2)}%`, W - padR + 6, y)
      }

      // 午休分隔 + 时间刻度
      const timeMarks: Array<[number, string]> = [
        [0, '09:30'],
        [60, '10:30'],
        [120, '11:30/13:00'],
        [180, '14:00'],
        [239, '15:00'],
      ]
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(150,170,200,0.6)'
      for (const [m, label] of timeMarks) {
        ctx.fillText(label, xOf(m), H - 10)
      }
      ctx.strokeStyle = 'rgba(160,180,220,0.14)'
      ctx.beginPath()
      ctx.moveTo(xOf(120), padT)
      ctx.lineTo(xOf(120), padT + priceH)
      ctx.stroke()

      // ── 成交量 ─────────────────────────────────
      const maxVol = Math.max(...visible.map((p) => p.volume), 1)
      const volTop = padT + priceH + 6
      for (let i = 0; i < visible.length; i++) {
        const p = visible[i]
        const up = i === 0 ? p.price >= prevClose : p.price >= visible[i - 1].price
        ctx.fillStyle = up ? 'rgba(255,80,95,0.4)' : 'rgba(45,255,179,0.35)'
        const h = (p.volume / maxVol) * (volH - 10)
        ctx.fillRect(xOf(p.minute) - 0.7, volTop + (volH - 10) - h, 1.4, h)
      }

      // ── 均价黄线 ────────────────────────────────
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.9)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      visible.forEach((p, i) => {
        const x = xOf(p.minute)
        const y = yOf(p.avgPrice)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.stroke()

      // ── 现价白线：渐变面积 + 主线 + 心电图光效尾迹 ──
      const baseY = yOf(prevClose)
      const grad = ctx.createLinearGradient(0, padT, 0, padT + priceH)
      const aboveBase = last.price >= prevClose
      grad.addColorStop(0, aboveBase ? 'rgba(255,80,95,0.16)' : 'rgba(34,230,255,0.14)')
      grad.addColorStop(1, 'rgba(34,230,255,0.0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.moveTo(xOf(visible[0].minute), baseY)
      visible.forEach((p) => ctx.lineTo(xOf(p.minute), yOf(p.price)))
      ctx.lineTo(xOf(last.minute), baseY)
      ctx.closePath()
      ctx.fill()

      ctx.strokeStyle = 'rgba(232, 242, 255, 0.92)'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      visible.forEach((p, i) => {
        const x = xOf(p.minute)
        const y = yOf(p.price)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.stroke()

      // 尾迹：最近 14 分钟用辉光重描（心电图扫描感）
      const tail = visible.slice(-14)
      if (tail.length > 1) {
        ctx.save()
        ctx.shadowColor = aboveBase ? 'rgba(255,80,95,0.9)' : 'rgba(34,230,255,0.9)'
        ctx.shadowBlur = 10
        ctx.strokeStyle = aboveBase ? 'rgba(255,170,180,0.95)' : 'rgba(160,240,255,0.95)'
        ctx.lineWidth = 1.8
        ctx.beginPath()
        tail.forEach((p, i) => {
          const x = xOf(p.minute)
          const y = yOf(p.price)
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        })
        ctx.stroke()
        ctx.restore()
      }

      // 线头呼吸脉冲（双层光斑）
      const tipX = xOf(last.minute)
      const tipY = yOf(last.price)
      const pulse = 0.5 + 0.5 * Math.sin(now / 280)
      const tipColor = aboveBase ? UP : 'rgba(34,230,255,1)'
      ctx.save()
      ctx.globalAlpha = 0.28 * (1 - pulse * 0.5)
      ctx.fillStyle = tipColor
      ctx.beginPath()
      ctx.arc(tipX, tipY, 7 + pulse * 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.shadowColor = tipColor
      ctx.shadowBlur = 14
      ctx.beginPath()
      ctx.arc(tipX, tipY, 2.6, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // ── 买卖点霓虹三角 ──────────────────────────
      for (const t of trades) {
        const x = xOf(t.time) // 分时模式 time 即分钟序号
        const y = yOf(t.price)
        const isBuy = t.side === 'buy'
        ctx.save()
        ctx.shadowColor = isBuy ? 'rgba(255,120,73,1)' : 'rgba(34,230,255,1)'
        ctx.shadowBlur = 9
        ctx.fillStyle = isBuy ? '#ff7849' : '#22e6ff'
        ctx.beginPath()
        if (isBuy) {
          ctx.moveTo(x, y + 7)
          ctx.lineTo(x - 5, y + 15)
          ctx.lineTo(x + 5, y + 15)
        } else {
          ctx.moveTo(x, y - 7)
          ctx.lineTo(x - 5, y - 15)
          ctx.lineTo(x + 5, y - 15)
        }
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }

      // 角标：当前时间 / 现价
      ctx.textAlign = 'left'
      ctx.fillStyle = 'rgba(150,170,200,0.75)'
      ctx.fillText(`${minuteLabel(last.minute)}  ·  ¥${last.price.toFixed(2)}`, padL + 4, padT + 8)
    }

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} className={`h-full w-full ${className ?? ''}`} />
}
