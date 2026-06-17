import { create } from 'zustand'
import { useTradingStore } from './useTradingStore'

const ONBOARDED_KEY = 'obsidian-onboarded'

interface TutorialStore {
  step: number
  actionCount: number
  start: () => void
  next: () => void
  tick: () => void
  finish: () => void
}

export const useTutorialStore = create<TutorialStore>()((set, get) => ({
  step: 0,
  actionCount: 0,

  start: () => {
    const ts = useTradingStore.getState()
    if (ts.mode !== 'daily') {
      ts.startDaily()
    } else if (!ts.daily) {
      ts.startDaily()
    }
    ts.setPlaying(false)
    set({ step: 1, actionCount: 0 })
  },

  next: () => {
    const { step } = get()
    if (step >= 7) {
      get().finish()
      return
    }
    set({ step: step + 1, actionCount: 0 })
  },

  tick: () => {
    set((s) => ({ actionCount: s.actionCount + 1 }))
  },

  finish: () => {
    set({ step: 0, actionCount: 0 })
    localStorage.setItem(ONBOARDED_KEY, '1')
  },
}))

export { ONBOARDED_KEY }
