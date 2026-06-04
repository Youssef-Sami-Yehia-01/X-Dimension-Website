/*
 * curveWorld — shared "spherical world" vertex displacement + horizon fade.
 *
 * Curvature: bends every vertex downward as it gets further from the camera,
 * so the ground curves away below the horizon like you're on top of a sphere.
 * Computed in VIEW space, so the curve follows the camera — fresh ground keeps
 * cresting over the horizon as you move down the street.
 *
 * Horizon fade: fades each point's alpha to zero with view distance. With
 * additive blending, fog alone can't hide far points (they keep adding light),
 * so we kill their alpha outright. Fully-faded fragments are discarded by
 * alphaTest → distance is hidden AND fewer fragments are shaded (perf win).
 *
 * Usage: call injectCurvature(shader) inside a material's onBeforeCompile,
 * AFTER any other vertex/fragment edits.
 */

export const WORLD_CURVE = 0.0009   // bend strength — higher = rounder planet
export const FADE_NEAR   = 70       // view distance where points start fading
export const FADE_FAR    = 150      // view distance where points are gone

export function injectCurvature(shader, {
  curve    = WORLD_CURVE,
  fadeNear = FADE_NEAR,
  fadeFar  = FADE_FAR,
} = {}) {
  shader.uniforms.uCurve    = { value: curve }
  shader.uniforms.uFadeNear = { value: fadeNear }
  shader.uniforms.uFadeFar  = { value: fadeFar }

  /* ── Vertex: declare uniforms + view-depth varying ─────────────────── */
  shader.vertexShader = shader.vertexShader.replace(
    'void main() {',
    `uniform float uCurve;
varying float vViewDepth;
void main() {`
  )

  /*
   * Replace projection with a curved one.
   * z² bends the road down with distance (main horizon curve);
   * x² (weighted lower) curls the wide pavement edges down too.
   * vViewDepth carries the camera distance to the fragment shader.
   */
  shader.vertexShader = shader.vertexShader.replace(
    '#include <project_vertex>',
    `vec4 mvPosition = vec4( transformed, 1.0 );
    mvPosition = modelViewMatrix * mvPosition;
    mvPosition.y -= uCurve * (mvPosition.z * mvPosition.z
                            + mvPosition.x * mvPosition.x * 0.5);
    vViewDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;`
  )

  /* ── Fragment: fade alpha with distance ────────────────────────────── */
  shader.fragmentShader = shader.fragmentShader.replace(
    'void main() {',
    `varying float vViewDepth;
uniform float uFadeNear;
uniform float uFadeFar;
void main() {`
  )

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <alphatest_fragment>',
    `diffuseColor.a *= 1.0 - smoothstep(uFadeNear, uFadeFar, vViewDepth);
    #include <alphatest_fragment>`
  )
}
