'use client'

import { useEffect, useRef } from 'react'
import styles from './FogCanvas.module.css'

/*
 * FogCanvas — real-time volumetric fog/smoke (domain-warped fBm noise).
 *
 * Mouse interaction: the cursor applies a FORCE to the smoke. It does NOT
 * add any smoke — instead, the direction the mouse is moving pushes the
 * existing fog away/along that motion, like shoving fog with your hand.
 *
 * We keep a short trail of recent mouse *velocities*. Each contributes a
 * directional displacement of the noise field that falls off with distance
 * and fades over time, so a swipe sends a gust through the smoke that
 * settles back once you stop.
 */

const TRAIL_LEN = 20

const VERT = `
  attribute vec2 aPos;
  void main() {
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`

const FRAG = `
  precision highp float;

  uniform vec2  uResolution;
  uniform float uTime;
  uniform float uIntensity;               // overall opacity multiplier
  uniform vec2  uTrail[${TRAIL_LEN}];     // recent mouse positions (0..1)
  uniform vec2  uVel[${TRAIL_LEN}];       // mouse velocity at each position
  uniform float uStrength[${TRAIL_LEN}];  // per-sample fade strength

  vec2 hash22(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)),
             dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(dot(hash22(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
          dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
      mix(dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
          dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
      u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.0 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    float aspect = uResolution.x / uResolution.y;
    vec2  uv  = gl_FragCoord.xy / uResolution.xy;
    vec2  puv = vec2(uv.x * aspect, uv.y);

    /* Slow ambient drift so the fog is always gently alive */
    float t = uTime * 0.03;
    vec2  q = puv * 1.5;
    vec2  warp = vec2(
      fbm(q + t),
      fbm(q + vec2(5.2, 1.3) - t)
    );

    /*
     * FORCE field from mouse motion.
     * Each recent sample pushes the noise domain in the direction the mouse
     * was travelling, scaled by closeness and freshness. No density is added,
     * so there is no blob/circle — only the existing smoke gets shoved.
     */
    vec2 force = vec2(0.0);
    for (int i = 0; i < ${TRAIL_LEN}; i++) {
      vec2  tp   = vec2(uTrail[i].x * aspect, uTrail[i].y);
      float d    = distance(puv, tp);
      float infl = smoothstep(0.18, 0.0, d) * uStrength[i];
      force += uVel[i] * infl;
    }

    /* Apply the force as a domain displacement → smoke flows with the mouse */
    float f = fbm(q + warp * 1.1 + force * 14.0);
    f = f * 0.5 + 0.5;

    float density = pow(smoothstep(0.30, 0.94, f), 1.4);

    vec3  smoke = vec3(0.40, 0.39, 0.37);
    float alpha = clamp(density, 0.0, 1.0) * 0.62 * uIntensity;

    gl_FragColor = vec4(smoke, alpha);
  }
`

function compile(gl, type, src) {
  const sh = gl.createShader(type)
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(sh))
  }
  return sh
}

export default function FogCanvas({ intensity = 1.0, interactive = true }) {
  const canvasRef      = useRef()
  const intensityRef   = useRef(intensity)
  const interactiveRef = useRef(interactive)
  intensityRef.current   = intensity
  interactiveRef.current = interactive

  useEffect(() => {
    const canvas = canvasRef.current
    const gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: true,
      premultipliedAlpha: false,
    })
    if (!gl) return
    gl.clearColor(0, 0, 0, 0)

    const prog = gl.createProgram()
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const uRes       = gl.getUniformLocation(prog, 'uResolution')
    const uTime      = gl.getUniformLocation(prog, 'uTime')
    const uIntensity = gl.getUniformLocation(prog, 'uIntensity')
    const uTrail     = gl.getUniformLocation(prog, 'uTrail')
    const uVel      = gl.getUniformLocation(prog, 'uVel')
    const uStrength = gl.getUniformLocation(prog, 'uStrength')

    /* --- mouse force-trail state --- */
    const trailPos = new Float32Array(TRAIL_LEN * 2)
    const trailVel = new Float32Array(TRAIL_LEN * 2)
    const trailStr = new Float32Array(TRAIL_LEN)
    const mouse    = { x: 0.5, y: 0.5 }
    let   lastX = 0.5, lastY = 0.5

    for (let i = 0; i < TRAIL_LEN; i++) {
      trailPos[i * 2]     = 0.5
      trailPos[i * 2 + 1] = 0.5
    }

    const onMove = (e) => {
      mouse.x = e.clientX / window.innerWidth
      mouse.y = 1.0 - e.clientY / window.innerHeight
    }
    window.addEventListener('mousemove', onMove)

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width  = Math.floor(window.innerWidth  * dpr)
      canvas.height = Math.floor(window.innerHeight * dpr)
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()
    window.addEventListener('resize', resize)

    let raf
    const start = performance.now()

    const render = () => {
      /* Fade all force samples — slow decay so the smoke settles back gently */
      for (let i = 0; i < TRAIL_LEN; i++) trailStr[i] *= 0.975

      /* On movement, record position + velocity (the push direction).
         Only while interactive — the scene fog must not react to the mouse. */
      const dx = mouse.x - lastX
      const dy = mouse.y - lastY
      const dist = Math.hypot(dx, dy)
      if (interactiveRef.current && dist > 0.0015) {
        for (let i = TRAIL_LEN - 1; i > 0; i--) {
          trailPos[i * 2]     = trailPos[(i - 1) * 2]
          trailPos[i * 2 + 1] = trailPos[(i - 1) * 2 + 1]
          trailVel[i * 2]     = trailVel[(i - 1) * 2]
          trailVel[i * 2 + 1] = trailVel[(i - 1) * 2 + 1]
          trailStr[i]         = trailStr[i - 1]
        }
        trailPos[0] = mouse.x
        trailPos[1] = mouse.y
        trailVel[0] = dx
        trailVel[1] = dy
        trailStr[0] = 1.0
        lastX = mouse.x
        lastY = mouse.y
      }

      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, (performance.now() - start) / 1000)
      gl.uniform1f(uIntensity, intensityRef.current)
      gl.uniform2fv(uTrail, trailPos)
      gl.uniform2fv(uVel, trailVel)
      gl.uniform1fv(uStrength, trailStr)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      raf = requestAnimationFrame(render)
    }
    render()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('resize', resize)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [])

  return <canvas ref={canvasRef} className={styles.fogCanvas} />
}
