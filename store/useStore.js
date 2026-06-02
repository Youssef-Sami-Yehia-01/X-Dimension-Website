import { create } from 'zustand'

export const useStore = create((set) => ({
  isExploring: false,
  setExploring: () => set({ isExploring: true }),
}))
