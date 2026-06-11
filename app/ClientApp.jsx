'use client'

import dynamic from 'next/dynamic'
import { useStore } from '@/store/useStore'
import IntroScreen from '@/components/ui/IntroScreen'
import SiteUI from '@/components/ui/SiteUI'
import FogCanvas from '@/components/ui/FogCanvas'
import ScrollDriver from '@/components/ui/ScrollDriver'
import ProjectTransitionOverlay from '@/components/ui/ProjectTransitionOverlay'
import ProjectUI from '@/components/ui/ProjectUI'
import ScreenReaderMirror from '@/components/ui/ScreenReaderMirror'
import CustomCursor from '@/components/ui/CustomCursor'
import styles from './page.module.css'

/* Three.js / R3F are browser-only */
const Scene = dynamic(() => import('@/components/canvas/Scene'), { ssr: false })

export default function ClientApp() {
  const isExploring  = useStore(s => s.isExploring)
  const projectState = useStore(s => s.projectState)

  return (
    <main className={styles.main}>
      {/* Full journey content as semantic HTML for assistive tech + crawlers */}
      <ScreenReaderMirror />

      {/* Shared smoke layer (behind the 3D canvas) */}
      <FogCanvas intensity={isExploring ? 0.5 : 1.0} interactive={!isExploring} />

      {/* Main 3D canvas — the journey AND the project orbit view */}
      <Scene />

      {/* Cinematic vignette over the 3D, under all UI */}
      <div className={styles.vignette} />

      {/* Intro overlay */}
      {!isExploring && <IntroScreen />}

      {/* HUD chrome — fades while inside a project */}
      {isExploring && <SiteUI hidden={projectState !== 'idle'} />}

      {/* Wheel / touch / keyboard journey driver */}
      <ScrollDriver />

      {/* Dark curtain for project transitions */}
      <ProjectTransitionOverlay />

      {/* Back button + project info — visible while orbiting a project */}
      <ProjectUI />

      {/* Amber dot + ring cursor (mouse-only; flares on interactives) */}
      <CustomCursor />
    </main>
  )
}
