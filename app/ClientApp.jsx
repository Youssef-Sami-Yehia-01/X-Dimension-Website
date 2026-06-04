'use client'

import dynamic from 'next/dynamic'
import { useStore } from '@/store/useStore'
import IntroScreen from '@/components/ui/IntroScreen'
import SiteUI from '@/components/ui/SiteUI'
import FogCanvas from '@/components/ui/FogCanvas'
import styles from './page.module.css'

/* Three.js / R3F are browser-only */
const Scene = dynamic(() => import('@/components/canvas/Scene'), { ssr: false })

export default function ClientApp() {
  const isExploring = useStore(s => s.isExploring)

  return (
    <main className={styles.main}>
      {/* Single shared smoke layer behind everything — full + mouse-reactive
          during the intro, subtler and static once inside the scene. */}
      <FogCanvas intensity={isExploring ? 0.5 : 1.0} interactive={!isExploring} />

      {/* 3D canvas (transparent) — warm and ready before the intro ends */}
      <Scene />

      {/* Intro overlay — unmounts after zoom-in transition completes */}
      {!isExploring && <IntroScreen />}

      {/* Persistent UI — mounts after intro, animates in */}
      {isExploring && <SiteUI />}
    </main>
  )
}
