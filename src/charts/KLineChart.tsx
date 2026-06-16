import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { BoardType, KBar, TradeRecord } from '../core/engine/types'
import { priceLimitOf } from '../core/engine/rules'
import { SYNTH_EPOCH } from '../core/data/generator'
import { bias, boll, cci, ema, kdj, macd, rsi, sma, wr } from '../core/indicators/calc'
import { useIndicatorStore, type SubIndicator } from '../store/useIndicatorStore'

/**
 * 日 K 主图（TradingView Lightweight Charts v5 深度定制）
 *
 * 多窗格布局（v5 panes API）：
 *   pane 0      K线 + 主图指标（MA 均线组 / BOLL，互斥单选）
 *   pane 1      成交量
 *   pane 2..N   副图指标窗格（数量可配 0~3，每格独立选择 MACD / KDJ / RSI）
 *
 * 自适应：初次喂数 fitContent() 铺满预热段；之后容器缩放保持 K 线粗细不变、右端锚定最新，
 * 多出的横向空间向「过去」扩展（左侧露出更多更早的历史 K 线与指标），而非拉伸/压缩现有 K 线。
 *
 * 指标在 useMemo 中对全序列一次性预计算（第 i 根只用 ≤i 的数据，无未来泄露），
 * 播放推进走 series.update() 增量喂数；配置变更触发结构重建 + 全量重喂。
 */

const UP = '#ff3b4d'
const DOWN = '#10d39a'

const dayIndexOf = (t: number) => Math.round((t - SYNTH_EPOCH) / 86400) + 1

/** NaN → whitespace 点，线条在窗口未满处自然留白 */
const lp = (time: UTCTimestamp, v: number) => (Number.isFinite(v) ? { time, value: v } : { time })
/** MACD 柱：红涨绿跌着色 */
const hp = (time: UTCTimestamp, v: number) =>
  Number.isFinite(v)
    ? { time, value: v, color: v >= 0 ? 'rgba(255,59,77,0.6)' : 'rgba(16,211,154,0.6)' }
    : { time }

const SUB_LINE_OPTS = {
  lineWidth: 1 as const,
  priceLineVisible: false,
  lastValueVisible: false,
  crosshairMarkerVisible: false,
}

/** 一个副图窗格挂载的全部序列 */
interface SubPane {
  kind: SubIndicator
  lines: ISeriesApi<'Line'>[]
  hist: ISeriesApi<'Histogram'> | null
}

interface KLineChartProps {
  bars: KBar[]
  visibleCount: number
  trades: TradeRecord[]
  board: BoardType
  className?: string
}

export function KLineChart({ bars, visibleCount, trades, board, className }: KLineChartProps) {
  const cfg = useIndicatorStore()

  const hostRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const limitLinesRef = useRef<{ up: IPriceLine; down: IPriceLine } | null>(null)
  const maSeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())
  const bollSeriesRef = useRef<{
    mid: ISeriesApi<'Line'>
    upper: ISeriesApi<'Line'>
    lower: ISeriesApi<'Line'>
  } | null>(null)
  const subPanesRef = useRef<SubPane[]>([])
  const subKeyRef = useRef('')
  const fedCountRef = useRef(0)
  const barsIdRef = useRef<KBar[] | null>(null)
  const lastCalcRef = useRef<unknown>(null)

  // ── 指标全量预计算（主图互斥；副图按使用到的类型计算，参数全局共享）──
  const calc = useMemo(() => {
    const closes = bars.map((b) => b.close)
    const isMaFamily = cfg.main === 'ma' || cfg.main === 'ema'
    const avg = cfg.main === 'ema' ? ema : sma
    const ma = isMaFamily
      ? cfg.maLines.filter((l) => l.enabled).map((line) => ({ line, values: avg(closes, line.period) }))
      : []
    return {
      ma,
      maById: new Map(ma.map((e) => [e.line.id, e.values])),
      boll: cfg.main === 'boll' ? boll(closes, cfg.boll.period, cfg.boll.mult) : null,
      macd: cfg.subs.includes('macd')
        ? macd(closes, cfg.macd.fast, cfg.macd.slow, cfg.macd.signal)
        : null,
      kdj: cfg.subs.includes('kdj') ? kdj(bars, cfg.kdj.n, cfg.kdj.k, cfg.kdj.d) : null,
      rsi: cfg.subs.includes('rsi') ? rsi(closes, cfg.rsi.period) : null,
      wr: cfg.subs.includes('wr') ? wr(bars, cfg.wr.period) : null,
      bias: cfg.subs.includes('bias')
        ? { b1: bias(closes, cfg.bias.p1), b2: bias(closes, cfg.bias.p2), b3: bias(closes, cfg.bias.p3) }
        : null,
      cci: cfg.subs.includes('cci') ? cci(bars, cfg.cci.period) : null,
    }
  }, [bars, cfg.main, cfg.maLines, cfg.boll, cfg.subs, cfg.macd, cfg.kdj, cfg.rsi, cfg.wr, cfg.bias, cfg.cci])

  // ── 建图（仅一次）─────────────────────────────────────────
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(160, 180, 210, 0.75)',
        fontFamily: '"JetBrains Mono", Consolas, monospace',
        fontSize: 12,
        attributionLogo: false,
        panes: {
          separatorColor: 'rgba(110, 150, 220, 0.18)',
          separatorHoverColor: 'rgba(34, 230, 255, 0.25)',
          enableResize: true,
        },
      },
      grid: {
        vertLines: { color: 'rgba(110, 150, 220, 0.06)' },
        horzLines: { color: 'rgba(110, 150, 220, 0.06)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(34, 230, 255, 0.35)', labelBackgroundColor: '#103040' },
        horzLine: { color: 'rgba(34, 230, 255, 0.35)', labelBackgroundColor: '#103040' },
      },
      rightPriceScale: { borderColor: 'rgba(110, 150, 220, 0.15)' },
      timeScale: {
        borderColor: 'rgba(110, 150, 220, 0.15)',
        rightOffset: 4,
        barSpacing: 8,
        tickMarkFormatter: (t: Time) => `D${dayIndexOf(t as number)}`,
      },
      localization: {
        timeFormatter: (t: Time) => `第 ${dayIndexOf(t as number)} 个交易日`,
        // 价格保留两位；成交量等大数压缩为 万/亿（该格式器作用于所有窗格的价格轴）
        priceFormatter: (p: number) => {
          const abs = Math.abs(p)
          if (abs >= 1e8) return `${(p / 1e8).toFixed(1)}亿`
          if (abs >= 1e4) return `${(p / 1e4).toFixed(0)}万`
          return p.toFixed(2)
        },
      },
    })

    const candles = chart.addSeries(
      CandlestickSeries,
      {
        upColor: UP,
        downColor: DOWN,
        borderUpColor: UP,
        borderDownColor: DOWN,
        wickUpColor: 'rgba(255, 59, 77, 0.7)',
        wickDownColor: 'rgba(16, 211, 154, 0.7)',
      },
      0,
    )

    const volume = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false },
      1,
    )

    chartRef.current = chart
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__klc = chart // 调试句柄（仅开发环境）
    }
    candleRef.current = candles
    volumeRef.current = volume
    markersRef.current = createSeriesMarkers(candles, [])
    fedCountRef.current = 0
    barsIdRef.current = null
    lastCalcRef.current = null
    limitLinesRef.current = null
    maSeriesRef.current = new Map()
    bollSeriesRef.current = null
    subPanesRef.current = []
    subKeyRef.current = ''

    // 容器尺寸变化（缩放窗口 / 缩小图表 / 拖拽分隔）时：保持 K 线粗细不变、右端锚定最新，
    // 让多出来的横向空间向「过去」扩展——左侧自动露出更多更早的历史 K 线与指标，
    // 而不是把现有 K 线拉伸/压缩。rAF 合并，拖拽中不频繁触发。
    let fitRaf = 0
    const onResize = () => {
      if (fitRaf) return
      fitRaf = requestAnimationFrame(() => {
        fitRaf = 0
        chartRef.current?.timeScale().scrollToRealTime()
      })
    }
    const sizeRo = new ResizeObserver(onResize)
    sizeRo.observe(host)

    // autoSize 依赖 ResizeObserver，而页面以隐藏状态加载（后台标签/iframe）时 RO 不触发，
    // 图表会卡在近零尺寸。兜底轮询：宿主有尺寸而主窗格仍未量出高度时，手动同步一次。
    const ensureSized = window.setInterval(() => {
      const c = chartRef.current
      if (!c) return
      const w = host.clientWidth
      const h = host.clientHeight
      const pane0 = c.panes()[0]
      if (w > 50 && h > 50 && pane0 && pane0.getHeight() < 10) {
        c.applyOptions({ autoSize: false })
        c.resize(w, h)
        c.applyOptions({ autoSize: true })
        c.timeScale().scrollToRealTime()
      }
    }, 800)

    return () => {
      window.clearInterval(ensureSized)
      cancelAnimationFrame(fitRaf)
      sizeRo.disconnect()
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      volumeRef.current = null
      markersRef.current = null
      limitLinesRef.current = null
      maSeriesRef.current = new Map()
      bollSeriesRef.current = null
      subPanesRef.current = []
      subKeyRef.current = ''
    }
  }, [])

  // ── 结构同步：让图上的序列集合与指标配置一致 ─────────────────
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    // MA/EMA：增删 + 换色（主图未选均线族时清空整组）
    const want = new Map(
      (cfg.main === 'ma' || cfg.main === 'ema' ? cfg.maLines.filter((l) => l.enabled) : []).map(
        (l) => [l.id, l],
      ),
    )
    for (const [id, s] of [...maSeriesRef.current]) {
      if (!want.has(id)) {
        chart.removeSeries(s)
        maSeriesRef.current.delete(id)
      }
    }
    for (const [id, line] of want) {
      let s = maSeriesRef.current.get(id)
      if (!s) {
        s = chart.addSeries(LineSeries, { ...SUB_LINE_OPTS }, 0)
        maSeriesRef.current.set(id, s)
      }
      s.applyOptions({ color: line.color })
    }

    // BOLL：主图选中即挂载
    const wantBoll = cfg.main === 'boll'
    if (wantBoll && !bollSeriesRef.current) {
      bollSeriesRef.current = {
        mid: chart.addSeries(LineSeries, { ...SUB_LINE_OPTS, color: 'rgba(255,209,102,0.85)' }, 0),
        upper: chart.addSeries(
          LineSeries,
          { ...SUB_LINE_OPTS, color: 'rgba(255,120,73,0.7)', lineStyle: LineStyle.Dashed },
          0,
        ),
        lower: chart.addSeries(
          LineSeries,
          { ...SUB_LINE_OPTS, color: 'rgba(45,255,179,0.7)', lineStyle: LineStyle.Dashed },
          0,
        ),
      }
    } else if (!wantBoll && bollSeriesRef.current) {
      const b = bollSeriesRef.current
      chart.removeSeries(b.mid)
      chart.removeSeries(b.upper)
      chart.removeSeries(b.lower)
      bollSeriesRef.current = null
    }

    // 副图窗格组：构成变化时整组重建（窗格随末位序列移除自动回收）
    const key = cfg.subs.join('|')
    if (key !== subKeyRef.current) {
      for (const p of subPanesRef.current) {
        p.lines.forEach((s) => chart.removeSeries(s))
        if (p.hist) chart.removeSeries(p.hist)
      }
      subPanesRef.current = []

      cfg.subs.forEach((kind, i) => {
        const paneIndex = 2 + i
        const pane: SubPane = { kind, lines: [], hist: null }
        if (kind === 'macd') {
          pane.hist = chart.addSeries(
            HistogramSeries,
            {
              priceFormat: { type: 'price', precision: 3, minMove: 0.001 },
              priceLineVisible: false,
              lastValueVisible: false,
            },
            paneIndex,
          )
          pane.lines = [
            chart.addSeries(LineSeries, { ...SUB_LINE_OPTS, color: '#f5f8ff' }, paneIndex), // DIF
            chart.addSeries(LineSeries, { ...SUB_LINE_OPTS, color: '#ffd166' }, paneIndex), // DEA
          ]
        } else if (kind === 'kdj') {
          pane.lines = [
            chart.addSeries(LineSeries, { ...SUB_LINE_OPTS, color: '#f5f8ff' }, paneIndex), // K
            chart.addSeries(LineSeries, { ...SUB_LINE_OPTS, color: '#ffd166' }, paneIndex), // D
            chart.addSeries(LineSeries, { ...SUB_LINE_OPTS, color: '#ff5ecf' }, paneIndex), // J
          ]
        } else if (kind === 'bias') {
          pane.lines = [
            chart.addSeries(LineSeries, { ...SUB_LINE_OPTS, color: '#f5f8ff' }, paneIndex),
            chart.addSeries(LineSeries, { ...SUB_LINE_OPTS, color: '#ffd166' }, paneIndex),
            chart.addSeries(LineSeries, { ...SUB_LINE_OPTS, color: '#ff5ecf' }, paneIndex),
          ]
        } else {
          // 单线副图：RSI / WR / CCI，附各自的参考价位线
          const color = kind === 'rsi' ? '#9d6bff' : kind === 'wr' ? '#2dffb3' : '#ff7849'
          const guides = kind === 'rsi' ? [30, 50, 70] : kind === 'wr' ? [20, 50, 80] : [-100, 0, 100]
          const line = chart.addSeries(LineSeries, { ...SUB_LINE_OPTS, color }, paneIndex)
          for (const lvl of guides) {
            line.createPriceLine({
              price: lvl,
              color: 'rgba(160,180,210,0.25)',
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: false,
              title: '',
            })
          }
          pane.lines = [line]
        }
        subPanesRef.current.push(pane)
      })
      subKeyRef.current = key
    }

    // 窗格高度权重：主图 : 量 : 各副图 ≈ 3.4 : 0.5 : 1.1（兜底主图≥40% / 量≥10%）
    const panes = chart.panes()
    panes[0]?.setStretchFactor(3400)
    panes[1]?.setStretchFactor(500)
    for (let i = 2; i < panes.length; i++) panes[i]?.setStretchFactor(1100)
  }, [cfg.main, cfg.maLines, cfg.subs])

  // ── 副图图例锚点：把每个副图的读数定位到各自窗格的左上角 ────────
  // 窗格 DOM 由图表库异步构建，getHTMLElement() 可能晚于 effect 可用，
  // 故用 rAF 轮询等元素挂载，再附加 ResizeObserver 跟踪分隔线拖拽/容器缩放。
  const [subPaneTops, setSubPaneTops] = useState<Array<number | null>>([])
  useEffect(() => {
    const host = hostRef.current
    if (!host || cfg.subs.length === 0) {
      setSubPaneTops([])
      return
    }
    let ro: ResizeObserver | null = null
    let raf = 0
    let cancelled = false
    const tryAttach = () => {
      if (cancelled) return
      const els = cfg.subs.map((_, i) => chartRef.current?.panes()[2 + i]?.getHTMLElement())
      if (els.some((e) => !e || !e.isConnected)) {
        raf = requestAnimationFrame(tryAttach)
        return
      }
      const measure = () => {
        const hr = host.getBoundingClientRect()
        setSubPaneTops(
          els.map((e) => {
            const top = e!.getBoundingClientRect().top - hr.top
            return top > 1 ? top : null
          }),
        )
      }
      measure()
      ro = new ResizeObserver(measure)
      els.forEach((e) => ro!.observe(e!))
      ro.observe(host)
    }
    tryAttach()
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      ro?.disconnect()
    }
  }, [cfg.subs, cfg.main, cfg.maLines, bars])

  // ── 喂数据：新一局/配置变更走全量，播放推进走增量 update ─────
  useEffect(() => {
    const candles = candleRef.current
    const volume = volumeRef.current
    if (!candles || !volume) return

    const toCandle = (b: KBar) => ({
      time: b.time as UTCTimestamp,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    })
    const toVol = (b: KBar) => ({
      time: b.time as UTCTimestamp,
      value: b.volume,
      color: b.close >= b.open ? 'rgba(255, 59, 77, 0.42)' : 'rgba(16, 211, 154, 0.42)',
    })
    const t = (i: number) => bars[i].time as UTCTimestamp

    const feedPaneFull = (p: SubPane, slice: KBar[]) => {
      if (p.kind === 'macd' && calc.macd) {
        p.hist?.setData(slice.map((b, i) => hp(b.time as UTCTimestamp, calc.macd!.hist[i])))
        p.lines[0]?.setData(slice.map((b, i) => lp(b.time as UTCTimestamp, calc.macd!.dif[i])))
        p.lines[1]?.setData(slice.map((b, i) => lp(b.time as UTCTimestamp, calc.macd!.dea[i])))
      } else if (p.kind === 'kdj' && calc.kdj) {
        p.lines[0]?.setData(slice.map((b, i) => lp(b.time as UTCTimestamp, calc.kdj!.k[i])))
        p.lines[1]?.setData(slice.map((b, i) => lp(b.time as UTCTimestamp, calc.kdj!.d[i])))
        p.lines[2]?.setData(slice.map((b, i) => lp(b.time as UTCTimestamp, calc.kdj!.j[i])))
      } else if (p.kind === 'rsi' && calc.rsi) {
        p.lines[0]?.setData(slice.map((b, i) => lp(b.time as UTCTimestamp, calc.rsi![i])))
      } else if (p.kind === 'wr' && calc.wr) {
        p.lines[0]?.setData(slice.map((b, i) => lp(b.time as UTCTimestamp, calc.wr![i])))
      } else if (p.kind === 'cci' && calc.cci) {
        p.lines[0]?.setData(slice.map((b, i) => lp(b.time as UTCTimestamp, calc.cci![i])))
      } else if (p.kind === 'bias' && calc.bias) {
        p.lines[0]?.setData(slice.map((b, i) => lp(b.time as UTCTimestamp, calc.bias!.b1[i])))
        p.lines[1]?.setData(slice.map((b, i) => lp(b.time as UTCTimestamp, calc.bias!.b2[i])))
        p.lines[2]?.setData(slice.map((b, i) => lp(b.time as UTCTimestamp, calc.bias!.b3[i])))
      }
    }
    const feedPanePoint = (p: SubPane, i: number) => {
      if (p.kind === 'macd' && calc.macd) {
        p.hist?.update(hp(t(i), calc.macd.hist[i]))
        p.lines[0]?.update(lp(t(i), calc.macd.dif[i]))
        p.lines[1]?.update(lp(t(i), calc.macd.dea[i]))
      } else if (p.kind === 'kdj' && calc.kdj) {
        p.lines[0]?.update(lp(t(i), calc.kdj.k[i]))
        p.lines[1]?.update(lp(t(i), calc.kdj.d[i]))
        p.lines[2]?.update(lp(t(i), calc.kdj.j[i]))
      } else if (p.kind === 'rsi' && calc.rsi) {
        p.lines[0]?.update(lp(t(i), calc.rsi[i]))
      } else if (p.kind === 'wr' && calc.wr) {
        p.lines[0]?.update(lp(t(i), calc.wr[i]))
      } else if (p.kind === 'cci' && calc.cci) {
        p.lines[0]?.update(lp(t(i), calc.cci[i]))
      } else if (p.kind === 'bias' && calc.bias) {
        p.lines[0]?.update(lp(t(i), calc.bias.b1[i]))
        p.lines[1]?.update(lp(t(i), calc.bias.b2[i]))
        p.lines[2]?.update(lp(t(i), calc.bias.b3[i]))
      }
    }

    const isNewSession = barsIdRef.current !== bars
    const needFull =
      isNewSession || visibleCount < fedCountRef.current || lastCalcRef.current !== calc

    if (needFull) {
      const slice = bars.slice(0, visibleCount)
      candles.setData(slice.map(toCandle))
      volume.setData(slice.map(toVol))
      for (const [id, s] of maSeriesRef.current) {
        const values = calc.maById.get(id)
        s.setData(values ? slice.map((b, i) => lp(b.time as UTCTimestamp, values[i])) : [])
      }
      if (bollSeriesRef.current && calc.boll) {
        const b = bollSeriesRef.current
        b.mid.setData(slice.map((bar, i) => lp(bar.time as UTCTimestamp, calc.boll!.mid[i])))
        b.upper.setData(slice.map((bar, i) => lp(bar.time as UTCTimestamp, calc.boll!.upper[i])))
        b.lower.setData(slice.map((bar, i) => lp(bar.time as UTCTimestamp, calc.boll!.lower[i])))
      }
      subPanesRef.current.forEach((p) => feedPaneFull(p, slice))
      // 新一局：右端锚定最新（固定 barSpacing，K 线粗细恒定），左侧随历史增多/缩放自动向过去延展
      if (isNewSession) chartRef.current?.timeScale().scrollToRealTime()
      barsIdRef.current = bars
      lastCalcRef.current = calc
    } else {
      for (let i = fedCountRef.current; i < visibleCount; i++) {
        candles.update(toCandle(bars[i]))
        volume.update(toVol(bars[i]))
        for (const [id, s] of maSeriesRef.current) {
          const values = calc.maById.get(id)
          if (values) s.update(lp(t(i), values[i]))
        }
        if (bollSeriesRef.current && calc.boll) {
          bollSeriesRef.current.mid.update(lp(t(i), calc.boll.mid[i]))
          bollSeriesRef.current.upper.update(lp(t(i), calc.boll.upper[i]))
          bollSeriesRef.current.lower.update(lp(t(i), calc.boll.lower[i]))
        }
        subPanesRef.current.forEach((p) => feedPanePoint(p, i))
      }
    }
    fedCountRef.current = visibleCount

    // 当日涨跌停价位线（以昨收为基准，每日重算）
    const i = visibleCount - 1
    if (i >= 1) {
      const { up, down } = priceLimitOf(bars[i - 1].close, board)
      if (!limitLinesRef.current) {
        limitLinesRef.current = {
          up: candles.createPriceLine({
            price: up,
            color: 'rgba(255, 120, 73, 0.55)',
            lineWidth: 1,
            lineStyle: 2,
            title: '涨停',
          }),
          down: candles.createPriceLine({
            price: down,
            color: 'rgba(45, 255, 179, 0.45)',
            lineWidth: 1,
            lineStyle: 2,
            title: '跌停',
          }),
        }
      } else {
        limitLinesRef.current.up.applyOptions({ price: up })
        limitLinesRef.current.down.applyOptions({ price: down })
      }
    }
  }, [bars, visibleCount, board, calc])

  // ── 买卖点标记 ────────────────────────────────────────────
  useEffect(() => {
    const markers: SeriesMarker<Time>[] = trades.map((tr) => ({
      time: tr.time as UTCTimestamp,
      position: tr.side === 'buy' ? 'belowBar' : 'aboveBar',
      shape: tr.side === 'buy' ? 'arrowUp' : 'arrowDown',
      color: tr.side === 'buy' ? '#ff7849' : '#22e6ff',
      text: `${tr.side === 'buy' ? 'B' : 'S'} ${tr.price.toFixed(2)}`,
    }))
    markersRef.current?.setMarkers(markers)
  }, [trades])

  // ── 实时图例（最新可见 bar 的指标读数）─────────────────────
  const li = Math.min(visibleCount, bars.length) - 1
  const fmt = (v: number | undefined, d = 2) =>
    v !== undefined && Number.isFinite(v) ? v.toFixed(d) : '—'
  const legendFor = (kind: SubIndicator): Array<{ text: string; color: string }> => {
    if (kind === 'macd' && calc.macd) {
      const m = cfg.macd
      return [
        { text: `MACD(${m.fast},${m.slow},${m.signal})`, color: 'rgba(160,180,210,0.8)' },
        { text: `DIF ${fmt(calc.macd.dif[li], 3)}`, color: '#f5f8ff' },
        { text: `DEA ${fmt(calc.macd.dea[li], 3)}`, color: '#ffd166' },
        { text: `MACD ${fmt(calc.macd.hist[li], 3)}`, color: (calc.macd.hist[li] ?? 0) >= 0 ? UP : DOWN },
      ]
    }
    if (kind === 'kdj' && calc.kdj) {
      return [
        { text: `KDJ(${cfg.kdj.n},${cfg.kdj.k},${cfg.kdj.d})`, color: 'rgba(160,180,210,0.8)' },
        { text: `K ${fmt(calc.kdj.k[li])}`, color: '#f5f8ff' },
        { text: `D ${fmt(calc.kdj.d[li])}`, color: '#ffd166' },
        { text: `J ${fmt(calc.kdj.j[li])}`, color: '#ff5ecf' },
      ]
    }
    if (kind === 'rsi' && calc.rsi) {
      return [{ text: `RSI(${cfg.rsi.period}) ${fmt(calc.rsi[li])}`, color: '#9d6bff' }]
    }
    if (kind === 'wr' && calc.wr) {
      return [{ text: `WR(${cfg.wr.period}) ${fmt(calc.wr[li])}`, color: '#2dffb3' }]
    }
    if (kind === 'cci' && calc.cci) {
      return [{ text: `CCI(${cfg.cci.period}) ${fmt(calc.cci[li])}`, color: '#ff7849' }]
    }
    if (kind === 'bias' && calc.bias) {
      return [
        { text: `BIAS(${cfg.bias.p1},${cfg.bias.p2},${cfg.bias.p3})`, color: 'rgba(160,180,210,0.8)' },
        { text: `B1 ${fmt(calc.bias.b1[li])}`, color: '#f5f8ff' },
        { text: `B2 ${fmt(calc.bias.b2[li])}`, color: '#ffd166' },
        { text: `B3 ${fmt(calc.bias.b3[li])}`, color: '#ff5ecf' },
      ]
    }
    return []
  }

  return (
    <div ref={hostRef} className={`chart-shell h-full w-full ${className ?? ''}`}>
      {/* 主图图例（MA 或 BOLL，互斥） */}
      <div className="pointer-events-none absolute left-2 top-1 z-10 flex select-none flex-wrap gap-x-3 font-mono text-[12px] leading-5">
        {calc.ma.map(({ line, values }) => (
          <span key={line.id} style={{ color: line.color, textShadow: `0 0 8px ${line.color}55` }}>
            {cfg.main === 'ema' ? 'EMA' : 'MA'}
            {line.period} {fmt(values[li])}
          </span>
        ))}
        {calc.boll && (
          <span style={{ color: 'rgba(255,209,102,0.9)' }}>
            BOLL({cfg.boll.period},{cfg.boll.mult}) 中 {fmt(calc.boll.mid[li])} 上{' '}
            {fmt(calc.boll.upper[li])} 下 {fmt(calc.boll.lower[li])}
          </span>
        )}
      </div>
      {/* 副图图例：各自锚定在对应窗格的左上角 */}
      {cfg.subs.map((kind, idx) => {
        const top = subPaneTops[idx]
        const entries = legendFor(kind)
        if (top == null || entries.length === 0) return null
        return (
          <div
            key={`${kind}-${idx}`}
            className="pointer-events-none absolute left-2 z-10 flex select-none flex-wrap gap-x-3 font-mono text-[12px] leading-5"
            style={{ top: top + 3 }}
          >
            {entries.map((e, j) => (
              <span key={j} style={{ color: e.color }}>
                {e.text}
              </span>
            ))}
          </div>
        )
      })}
    </div>
  )
}
