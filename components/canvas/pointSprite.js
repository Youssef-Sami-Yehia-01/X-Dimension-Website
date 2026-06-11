import * as THREE from 'three'

/*
 * Shared soft-glow sprite for point clouds — round points with a warm core
 * and feathered halo (instead of WebGL's default hard squares).
 */
export function makeGlowSprite() {
  const SIZE = 64
  const canvas = document.createElement('canvas')
  canvas.width = SIZE; canvas.height = SIZE
  const ctx = canvas.getContext('2d'), half = SIZE / 2
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half)
  grad.addColorStop(0.00, 'rgba(255,255,252,1.0)')
  grad.addColorStop(0.20, 'rgba(248,244,235,0.78)')
  grad.addColorStop(0.50, 'rgba(220,215,200,0.18)')
  grad.addColorStop(1.00, 'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, SIZE, SIZE)
  return new THREE.CanvasTexture(canvas)
}
