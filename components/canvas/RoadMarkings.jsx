'use client'

import { Text } from '@react-three/drei'
import { useStore } from '@/store/useStore'
import { ROAD_MARKINGS } from '@/config/journey'

/*
 * RoadMarkings — tiny amber chainage stamps painted flat on the asphalt,
 * the stationing marks a real survey crew leaves along a corridor scan.
 * Pure environmental storytelling; the distance fog swallows them softly.
 * Mounted only once the scan begins — nothing may leak through the intro.
 */
export default function RoadMarkings() {
  const isExploring = useStore(s => s.isExploring)
  if (!isExploring) return null

  return (
    <>
      {ROAD_MARKINGS.map(({ position, text }) => (
        <Text
          key={text}
          font="/fonts/space-grotesk-500.woff"
          fontSize={0.5}
          color="#f5a623"
          fillOpacity={0.5}
          letterSpacing={0.14}
          anchorX={position[0] < 0 ? 'left' : 'right'}
          anchorY="middle"
          position={position}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          {text}
        </Text>
      ))}
    </>
  )
}
