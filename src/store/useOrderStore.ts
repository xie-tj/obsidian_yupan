import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * 下单偏好（持久化）
 *
 * fullPosition 默认开启：快速复盘时点买入即满仓、点卖出即清仓，无需调手数。
 * 关闭后回到手动手数模式（lots 为手数，1 手 = 100 股）。
 */
interface OrderStore {
  fullPosition: boolean
  lots: number
  setFullPosition: (v: boolean) => void
  setLots: (v: number) => void
}

export const useOrderStore = create<OrderStore>()(
  persist(
    (set) => ({
      fullPosition: true,
      lots: 10,
      setFullPosition: (fullPosition) => set({ fullPosition }),
      setLots: (lots) => set({ lots: Math.max(1, Math.floor(lots) || 1) }),
    }),
    { name: 'obsidian-order-config', version: 1 },
  ),
)
