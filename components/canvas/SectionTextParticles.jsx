'use client'

import { TEXTS_3D } from '@/config/journey'
import TextMesh3D from './TextMesh3D'

/*
 * SectionTextParticles — mounts every 3D particle headline authored in the
 * journey storyboard. All placement, copy and timing live in config/journey.js.
 */
export default function SectionTextParticles() {
  return (
    <>
      {TEXTS_3D.map(({ id, ...text }) => (
        <TextMesh3D key={id} id={id} {...text} />
      ))}
    </>
  )
}
