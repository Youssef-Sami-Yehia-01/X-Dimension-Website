'use client'

import { useEffect, useRef } from 'react'
import styles from './FluidCanvas.module.css'

/*
 * FluidCanvas — real-time GPU fluid simulation (Navier-Stokes), the same
 * technique behind the lusion.co hero. The cursor injects velocity + grey
 * "dye" into a fluid field that advects, swirls (vorticity) and stays
 * divergence-free (Jacobi pressure solve), producing curling smoke that
 * flows and dissipates with real fluid physics.
 *
 * Tuned for subtle dark-grey smoke on the #151515 background to match the
 * rest of the site. Used as the intro-screen backdrop.
 *
 * Algorithm follows the standard GPU fluid solver (advection → curl →
 * vorticity → divergence → pressure iterations → gradient subtract).
 * Requires WebGL2 + float render targets; degrades to nothing if absent.
 */

/* ── tunables ───────────────────────────────────────────────────────────── */
const SIM_RES        = 128    // velocity/pressure grid resolution
const DYE_RES        = 512    // dye (smoke) resolution — higher = sharper
const PRESSURE_ITERS = 18
const VEL_DISSIPATION = 0.6   // how fast motion settles
const DYE_DISSIPATION = 0.92  // how fast smoke fades (lower = lingers longer)
const CURL           = 26     // swirliness
const SPLAT_RADIUS   = 0.0022
const SPLAT_FORCE    = 5200
const DYE_COLOR      = [0.42, 0.41, 0.39]  // grey smoke

/* ── shaders (GLSL ES 3.00) ─────────────────────────────────────────────── */
const BASE_VERT = `#version 300 es
precision highp float;
in vec2 aPosition;
out vec2 vUv; out vec2 vL; out vec2 vR; out vec2 vT; out vec2 vB;
uniform vec2 texelSize;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`

const SPLAT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
void main () {
  vec2 p = vUv - point;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  vec3 base = texture(uTarget, vUv).xyz;
  frag = vec4(base + splat, 1.0);
}`

const ADVECT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float dt;
uniform float dissipation;
void main () {
  vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
  vec4 result = texture(uSource, coord);
  float decay = 1.0 + dissipation * dt;
  frag = result / decay;
}`

const DIVERGENCE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB; out vec4 frag;
uniform sampler2D uVelocity;
void main () {
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  float div = 0.5 * (R - L + T - B);
  frag = vec4(div, 0.0, 0.0, 1.0);
}`

const CURL_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB; out vec4 frag;
uniform sampler2D uVelocity;
void main () {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  float curl = R - L - T + B;
  frag = vec4(0.5 * curl, 0.0, 0.0, 1.0);
}`

const VORTICITY_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB; out vec4 frag;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
void main () {
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 vel = texture(uVelocity, vUv).xy;
  vel += force * dt;
  vel = clamp(vel, -1000.0, 1000.0);
  frag = vec4(vel, 0.0, 1.0);
}`

const PRESSURE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB; out vec4 frag;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main () {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  float divergence = texture(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  frag = vec4(pressure, 0.0, 0.0, 1.0);
}`

const GRADIENT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB; out vec4 frag;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main () {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity -= vec2(R - L, T - B);
  frag = vec4(velocity, 0.0, 1.0);
}`

const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTexture;
uniform float uIntensity;
void main () {
  vec3 c = texture(uTexture, vUv).rgb;
  float a = clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0);
  frag = vec4(c, a * uIntensity);
}`

/* ── gl helpers ─────────────────────────────────────────────────────────── */
function compile(gl, type, src) {
  const s = gl.createShader(type)
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('Fluid shader error:', gl.getShaderInfoLog(s))
  }
  return s
}

function program(gl, vert, frag) {
  const p = gl.createProgram()
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vert))
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag))
  gl.linkProgram(p)
  const uniforms = {}
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS)
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i).name
    uniforms[name] = gl.getUniformLocation(p, name)
  }
  return { program: p, uniforms }
}

export default function FluidCanvas() {
  const canvasRef = useRef()

  useEffect(() => {
    const canvas = canvasRef.current
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false })
    if (!gl) return                       // no WebGL2 → no effect (graceful)
    if (!gl.getExtension('EXT_color_buffer_float')) return
    gl.getExtension('OES_texture_float_linear')

    /* ── programs ── */
    const splatP   = program(gl, BASE_VERT, SPLAT_FRAG)
    const advectP  = program(gl, BASE_VERT, ADVECT_FRAG)
    const divP     = program(gl, BASE_VERT, DIVERGENCE_FRAG)
    const curlP    = program(gl, BASE_VERT, CURL_FRAG)
    const vortP    = program(gl, BASE_VERT, VORTICITY_FRAG)
    const pressP   = program(gl, BASE_VERT, PRESSURE_FRAG)
    const gradP    = program(gl, BASE_VERT, GRADIENT_FRAG)
    const dispP    = program(gl, BASE_VERT, DISPLAY_FRAG)

    /* ── fullscreen triangle ── */
    const vbo = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    const blit = () => gl.drawArrays(gl.TRIANGLES, 0, 3)

    /* ── framebuffer factory ── */
    function makeFBO(w, h, internal, format, type, filter) {
      const tex = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null)
      const fbo = gl.createFramebuffer()
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      gl.viewport(0, 0, w, h)
      gl.clear(gl.COLOR_BUFFER_BIT)
      return {
        tex, fbo, w, h, texelX: 1 / w, texelY: 1 / h,
        attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, tex); return id },
      }
    }
    function makeDouble(w, h, internal, format, type, filter) {
      let a = makeFBO(w, h, internal, format, type, filter)
      let b = makeFBO(w, h, internal, format, type, filter)
      return {
        w, h, texelX: 1 / w, texelY: 1 / h,
        get read() { return a }, get write() { return b },
        swap() { const t = a; a = b; b = t },
      }
    }

    const LINEAR = gl.LINEAR, NEAREST = gl.NEAREST
    const rgba16 = gl.RGBA16F, rg16 = gl.RG16F, r16 = gl.R16F
    const HALF = gl.HALF_FLOAT

    let velocity   = makeDouble(SIM_RES, SIM_RES, rg16,   gl.RG,   HALF, LINEAR)
    let dye        = makeDouble(DYE_RES, DYE_RES, rgba16, gl.RGBA, HALF, LINEAR)
    let divergence = makeFBO(SIM_RES, SIM_RES, r16, gl.RED, HALF, NEAREST)
    let curlFBO    = makeFBO(SIM_RES, SIM_RES, r16, gl.RED, HALF, NEAREST)
    let pressure   = makeDouble(SIM_RES, SIM_RES, r16, gl.RED, HALF, NEAREST)

    /* ── pointer ── */
    const pointer = { x: 0.5, y: 0.5, dx: 0, dy: 0, moved: false }
    let lastX = 0.5, lastY = 0.5
    const onMove = (e) => {
      const x = e.clientX / window.innerWidth
      const y = 1 - e.clientY / window.innerHeight
      pointer.dx = (x - lastX) * SPLAT_FORCE
      pointer.dy = (y - lastY) * SPLAT_FORCE
      pointer.x = x; pointer.y = y
      pointer.moved = Math.abs(x - lastX) > 0 || Math.abs(y - lastY) > 0
      lastX = x; lastY = y
    }
    window.addEventListener('mousemove', onMove)

    /* ── resize (display size) ── */
    const resize = () => {
      canvas.width  = Math.floor(window.innerWidth)
      canvas.height = Math.floor(window.innerHeight)
    }
    resize()
    window.addEventListener('resize', resize)

    /* ── pass helpers ── */
    function setTarget(fbo) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fbo)
      gl.viewport(0, 0, fbo.w, fbo.h)
    }

    function splat(x, y, dx, dy, color) {
      const aspect = canvas.width / canvas.height
      // velocity
      gl.useProgram(splatP.program)
      gl.uniform2f(splatP.uniforms.texelSize, velocity.texelX, velocity.texelY)
      gl.uniform1i(splatP.uniforms.uTarget, velocity.read.attach(0))
      gl.uniform1f(splatP.uniforms.aspectRatio, aspect)
      gl.uniform2f(splatP.uniforms.point, x, y)
      gl.uniform3f(splatP.uniforms.color, dx, dy, 0)
      gl.uniform1f(splatP.uniforms.radius, SPLAT_RADIUS)
      setTarget(velocity.write); blit(); velocity.swap()
      // dye
      gl.uniform1i(splatP.uniforms.uTarget, dye.read.attach(0))
      gl.uniform3f(splatP.uniforms.color, color[0], color[1], color[2])
      setTarget(dye.write); blit(); dye.swap()
    }

    /* ── main loop ── */
    let raf
    let lastTime = performance.now()
    const render = () => {
      const now = performance.now()
      let dt = (now - lastTime) / 1000
      dt = Math.min(dt, 0.016)
      lastTime = now

      if (pointer.moved) {
        pointer.moved = false
        splat(pointer.x, pointer.y, pointer.dx, pointer.dy, DYE_COLOR)
      }

      const vTexel = [velocity.texelX, velocity.texelY]

      // curl
      gl.useProgram(curlP.program)
      gl.uniform2f(curlP.uniforms.texelSize, vTexel[0], vTexel[1])
      gl.uniform1i(curlP.uniforms.uVelocity, velocity.read.attach(0))
      setTarget(curlFBO); blit()

      // vorticity
      gl.useProgram(vortP.program)
      gl.uniform2f(vortP.uniforms.texelSize, vTexel[0], vTexel[1])
      gl.uniform1i(vortP.uniforms.uVelocity, velocity.read.attach(0))
      gl.uniform1i(vortP.uniforms.uCurl, curlFBO.attach(1))
      gl.uniform1f(vortP.uniforms.curl, CURL)
      gl.uniform1f(vortP.uniforms.dt, dt)
      setTarget(velocity.write); blit(); velocity.swap()

      // divergence
      gl.useProgram(divP.program)
      gl.uniform2f(divP.uniforms.texelSize, vTexel[0], vTexel[1])
      gl.uniform1i(divP.uniforms.uVelocity, velocity.read.attach(0))
      setTarget(divergence); blit()

      // clear pressure
      gl.useProgram(pressP.program)
      gl.uniform2f(pressP.uniforms.texelSize, vTexel[0], vTexel[1])
      gl.uniform1i(pressP.uniforms.uDivergence, divergence.attach(0))
      // jacobi iterations
      for (let i = 0; i < PRESSURE_ITERS; i++) {
        gl.uniform1i(pressP.uniforms.uPressure, pressure.read.attach(1))
        setTarget(pressure.write); blit(); pressure.swap()
      }

      // gradient subtract
      gl.useProgram(gradP.program)
      gl.uniform2f(gradP.uniforms.texelSize, vTexel[0], vTexel[1])
      gl.uniform1i(gradP.uniforms.uPressure, pressure.read.attach(0))
      gl.uniform1i(gradP.uniforms.uVelocity, velocity.read.attach(1))
      setTarget(velocity.write); blit(); velocity.swap()

      // advect velocity
      gl.useProgram(advectP.program)
      gl.uniform2f(advectP.uniforms.texelSize, vTexel[0], vTexel[1])
      gl.uniform1i(advectP.uniforms.uVelocity, velocity.read.attach(0))
      gl.uniform1i(advectP.uniforms.uSource, velocity.read.attach(0))
      gl.uniform1f(advectP.uniforms.dt, dt)
      gl.uniform1f(advectP.uniforms.dissipation, VEL_DISSIPATION)
      setTarget(velocity.write); blit(); velocity.swap()

      // advect dye
      gl.uniform1i(advectP.uniforms.uVelocity, velocity.read.attach(0))
      gl.uniform1i(advectP.uniforms.uSource, dye.read.attach(1))
      gl.uniform1f(advectP.uniforms.dissipation, DYE_DISSIPATION)
      setTarget(dye.write); blit(); dye.swap()

      // display to screen
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.useProgram(dispP.program)
      gl.uniform1i(dispP.uniforms.uTexture, dye.read.attach(0))
      gl.uniform1f(dispP.uniforms.uIntensity, 1.0)
      blit()
      gl.disable(gl.BLEND)

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

  return <canvas ref={canvasRef} className={styles.fluidCanvas} />
}
