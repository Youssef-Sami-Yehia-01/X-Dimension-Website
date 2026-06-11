import * as THREE from 'three'

/*
 * mouseForce — Lusion-style cursor force field for the point clouds.
 *
 * One shared ray (camera → cursor) and one strength value, updated every
 * frame by <MouseForceDriver>. Any point material can opt in by calling
 * injectMouseForce(shader) inside onBeforeCompile: vertices near the ray
 * are pushed radially away (plus a slight lift), with strength that swells
 * while the mouse moves and settles to a gentle ambient bubble at rest.
 *
 * The displacement happens in the vertex shader, BEFORE the spherical
 * world bend — so the bubble follows the ground as it curves away.
 */

export const mouseRay = {
  origin: new THREE.Vector3(0, 9999, 0),
  dir: new THREE.Vector3(0, -1, 0),
  strength: 0,
}

const BUBBLE_RADIUS = 4.2   // world units around the cursor ray
const PUSH = 1.0            // max radial displacement
const LIFT = 0.3            // max upward bulge

/* All shaders that opted in — uniforms refreshed once per frame */
const registered = new Set()

export function updateMouseUniforms() {
  registered.forEach((shader) => {
    shader.uniforms.uRayO.value.copy(mouseRay.origin)
    shader.uniforms.uRayD.value.copy(mouseRay.dir)
    shader.uniforms.uMouseF.value = mouseRay.strength
  })
}

export function injectMouseForce(shader) {
  shader.uniforms.uRayO   = { value: new THREE.Vector3(0, 9999, 0) }
  shader.uniforms.uRayD   = { value: new THREE.Vector3(0, -1, 0) }
  shader.uniforms.uMouseF = { value: 0 }

  shader.vertexShader = shader.vertexShader.replace(
    'void main() {',
    `uniform vec3  uRayO;
uniform vec3  uRayD;
uniform float uMouseF;
void main() {`
  )

  // Must run AFTER the cloud's own animation edits to <begin_vertex>,
  // so callers inject this last (right before injectCurvature).
  shader.vertexShader = shader.vertexShader.replace(
    '#include <project_vertex>',
    `{
      vec3  mrel   = transformed - uRayO;
      float malong = max(dot(mrel, uRayD), 0.0);
      vec3  mnear  = mrel - uRayD * malong;        // ray → point vector
      float mdist  = length(mnear);
      float minfl  = smoothstep(${BUBBLE_RADIUS.toFixed(1)}, 0.6, mdist) * uMouseF;
      transformed += (mnear / max(mdist, 0.001)) * minfl * ${PUSH.toFixed(1)};
      transformed.y += minfl * ${LIFT.toFixed(1)};
    }
    #include <project_vertex>`
  )

  registered.add(shader)
}
