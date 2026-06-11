import { create } from 'zustand'

export const useStore = create((set) => ({
  isExploring:    false,
  scrollProgress: 0,
  // 'idle' → 'entering' → 'showing' → 'exiting' → 'idle'
  projectState:   'idle',
  activeProject:  null,
  // Orbit-mode view: false = point cloud, true = structured BIM preview
  bimMode:        false,

  // Heavy assets (point-cloud binaries) — the intro gates on these
  assetsTotal:  2,
  assetsLoaded: 0,

  setExploring:       ()   => set({ isExploring: true }),
  setScrollProgress:  (p)  => set({ scrollProgress: p }),
  openProject:        (id) => set({ activeProject: id, projectState: 'entering' }),
  onProjectShowing:   ()   => set({ projectState: 'showing' }),
  closeProject:       ()   => set({ projectState: 'exiting', bimMode: false }),
  onProjectClosed:    ()   => set({ projectState: 'idle', activeProject: null }),
  toggleBim:          ()   => set(s => ({ bimMode: !s.bimMode })),
  assetLoaded:        ()   => set(s => ({ assetsLoaded: s.assetsLoaded + 1 })),
}))

/* Dev-only handle for driving the journey from automation/console */
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  window.__xdStore = useStore
}
