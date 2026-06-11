import { create } from 'zustand'

export const useStore = create((set) => ({
  isExploring:    false,
  scrollProgress: 0,
  // 'idle' → 'entering' → 'showing' → 'exiting' → 'idle'
  projectState:   'idle',
  activeProject:  null,

  setExploring:       ()   => set({ isExploring: true }),
  setScrollProgress:  (p)  => set({ scrollProgress: p }),
  openProject:        (id) => set({ activeProject: id, projectState: 'entering' }),
  onProjectShowing:   ()   => set({ projectState: 'showing' }),
  closeProject:       ()   => set({ projectState: 'exiting' }),
  onProjectClosed:    ()   => set({ projectState: 'idle', activeProject: null }),
}))

/* Dev-only handle for driving the journey from automation/console */
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  window.__xdStore = useStore
}
