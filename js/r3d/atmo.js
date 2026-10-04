// Atmosphere: volumetric-looking light shafts under the chandeliers and through the entrance,
// drifting dust motes, and a night-time glow on the wet road. Everything here is one or two
// draw calls and is skipped entirely on the Low preset.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CEIL } from './build.js';

// Additive cone fake: fades with the view angle (so silhouettes disappear) and along its length
const shaftMat = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uColor: { value: new THREE.Color('#ffd9a0') }, uI: { value: 0.1 }, uTime: { value: 0 } },
  vertexShader: `varying vec3 vN; varying vec3 vV; varying float vH; varying vec3 vW;
    void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
      vH = uv.y; gl_Position = projectionMatrix * viewMatrix * wp; }`,
  fragmentShader: `uniform vec3 uColor; uniform float uI, uTime; varying vec3 vN; varying vec3 vV; varying float vH; varying vec3 vW;
    void main(){ float f = abs(dot(normalize(vN), normalize(vV)));
      float a = uI * pow(f, 2.2) * smoothstep(0.0, 0.35, vH) * (1.0 - 0.4 * smoothstep(0.6, 1.0, vH));
      a *= 0.85 + 0.15 * sin(vW.x * 1.7 + vW.z * 2.3 + uTime * 0.4);
      gl_FragColor = vec4(uColor * a, a); }`,
});

export function buildAtmosphere(scene, dyn, chandeliers, QUALITY) {
  const atmo = { shafts: null, entry: null, dust: null, glow: null };
  if (QUALITY.level < 1) return atmo;

  // one cone per chandelier, merged so the whole set is a single draw
  const cones = chandeliers.map(([x, z, r]) => {
    const g = new THREE.CylinderGeometry(r * 0.3, r * 1.4, CEIL - 1.9, 20, 1, true);
    g.translate(x, (CEIL - 1.9) / 2, z);
    return g;
  });
  const sm = shaftMat(); sm.uniforms.uI.value = 0.16;
  atmo.shafts = new THREE.Mesh(mergeGeometries(cones), sm);
  atmo.shafts.frustumCulled = false; atmo.shafts.renderOrder = 5;
  scene.add(atmo.shafts);

  // daylight streaming in through the entrance (slanted, wide at the floor)
  if (dyn.door) {
    const { x, z, w } = dyn.door;
    const g = new THREE.CylinderGeometry(w * 0.5, w * 0.8, 10, 16, 1, true);
    g.rotateX(0.55); g.translate(x, 3.2, z - 2.3);
    const em = shaftMat(); em.uniforms.uColor.value.set('#fff0d0'); em.uniforms.uI.value = 0;
    atmo.entry = new THREE.Mesh(g, em);
    atmo.entry.frustumCulled = false; atmo.entry.renderOrder = 5;
    scene.add(atmo.entry);
  }

  // dust motes wrapped around the camera
  const N = QUALITY.level >= 2 ? 500 : 260, pos = new Float32Array(N * 3), seed = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) { pos[i] = Math.random(); seed[i] = Math.random(); }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dg.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
  const dm = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uA: { value: 0.5 }, uPx: { value: 1 } },
    vertexShader: `uniform float uTime, uPx; attribute vec3 seed; varying float vA;
      void main(){ vec3 box = vec3(26.0, 6.0, 26.0);
        vec3 p = position * box + vec3(sin(uTime * 0.11 + seed.x * 6.28) * 0.7, uTime * 0.02 + sin(uTime * 0.3 + seed.y * 9.0) * 0.15, cos(uTime * 0.09 + seed.z * 6.28) * 0.7);
        p = mod(p - cameraPosition + box * 0.5, box) - box * 0.5;
        vec4 mv = viewMatrix * vec4(p + cameraPosition, 1.0);
        float d = -mv.z; vA = smoothstep(0.5, 2.0, d) * (1.0 - smoothstep(9.0, 13.0, d)) * (0.4 + 0.6 * seed.x);
        gl_PointSize = (1.2 + seed.y * 1.6) * uPx; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uA; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(c)) * vA * uA; gl_FragColor = vec4(vec3(1.0, 0.85, 0.6) * a, a); }`,
  });
  atmo.dust = new THREE.Points(dg, dm);
  atmo.dust.frustumCulled = false; atmo.dust.renderOrder = 6;
  scene.add(atmo.dust);
  return atmo;
}

// inside: 0..1 how far indoors the camera is; day: 0..1
export function updateAtmosphere(atmo, t, inside, day, pixelRatio) {
  if (!atmo) return;
  if (atmo.shafts) { atmo.shafts.visible = inside > 0.02; atmo.shafts.material.uniforms.uI.value = 0.16 * inside; atmo.shafts.material.uniforms.uTime.value = t; }
  if (atmo.entry) { atmo.entry.visible = inside > 0.02 && day > 0.05; atmo.entry.material.uniforms.uI.value = 0.22 * day * inside; atmo.entry.material.uniforms.uTime.value = t; }
  if (atmo.dust) { atmo.dust.material.uniforms.uTime.value = t; atmo.dust.material.uniforms.uA.value = 0.55 * inside + 0.15; atmo.dust.material.uniforms.uPx.value = pixelRatio; }
}
