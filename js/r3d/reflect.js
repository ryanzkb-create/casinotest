// Planar reflection for the polished floors (High preset only). One half-resolution mirror render of the
// scene feeds a single translucent overlay plane; a mask texture limits it to the marble / tile / wood
// zones and the Fresnel term keeps it subtle when looking straight down.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { W } from './build.js';

const SHADER = {
  name: 'FloorReflection',
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, tMask: { value: null }, uStrength: { value: 0.8 }, uBlur: { value: 0.006 }, uSize: { value: new THREE.Vector2(90, 50) } },
  vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWorld;
    void main(){ vUv = textureMatrix * vec4(position, 1.0); vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
  fragmentShader: `uniform sampler2D tDiffuse, tMask; uniform vec3 color; uniform float uStrength, uBlur; uniform vec2 uSize; varying vec4 vUv; varying vec3 vWorld;
    void main(){
      vec2 uv = vUv.xy / vUv.w;
      float mask = texture2D(tMask, vec2(vWorld.x / uSize.x, 1.0 - vWorld.z / uSize.y)).r;
      if (mask < 0.01) discard;
      vec3 V = normalize(cameraPosition - vWorld);
      float fr = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
      float b = uBlur * (1.0 + (1.0 - fr) * 1.5);
      vec3 r = texture2D(tDiffuse, uv).rgb * 0.4;
      r += texture2D(tDiffuse, uv + vec2(b, 0.0)).rgb * 0.15 + texture2D(tDiffuse, uv - vec2(b, 0.0)).rgb * 0.15;
      r += texture2D(tDiffuse, uv + vec2(0.0, b)).rgb * 0.15 + texture2D(tDiffuse, uv - vec2(0.0, b)).rgb * 0.15;
      gl_FragColor = vec4(min(r, vec3(6.0)), mask * uStrength * (0.16 + 0.84 * fr));
    }`,
};

export function buildFloorReflection(scene, zones, roomW, roomD) {
  // mask: 1 on polished stone, less on tile and wood
  const c = document.createElement('canvas'); c.width = 360; c.height = 200;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  const sx = c.width / roomW, sz = c.height / roomD;
  for (const z of zones) {
    const v = z.floor.startsWith('marble') ? 1 : z.floor === 'tiles' ? 0.6 : z.floor === 'wood' ? 0.5 : 0;
    if (!v) continue;
    g.fillStyle = `rgb(${v * 255 | 0},${v * 255 | 0},${v * 255 | 0})`;
    g.fillRect(W(z.x) * sx, W(z.y) * sz, W(z.w) * sx, W(z.h) * sz);
  }
  const mask = new THREE.CanvasTexture(c);
  mask.colorSpace = THREE.NoColorSpace;

  const geo = new THREE.PlaneGeometry(roomW, roomD);
  const refl = new Reflector(geo, { textureWidth: 1024, textureHeight: 576, multisample: 0, shader: SHADER, clipBias: 0.003 });
  refl.rotation.x = -Math.PI / 2;
  refl.position.set(roomW / 2, 0.03, roomD / 2);
  refl.material.uniforms.tMask.value = mask;
  refl.material.transparent = true; refl.material.depthWrite = false;
  refl.renderOrder = 2; refl.frustumCulled = false;
  const orig = refl.onBeforeRender;
  // skip the extra passes that re-render the scene with an override material (ambient occlusion)
  refl.onBeforeRender = (renderer, sc, camera) => { if (sc.overrideMaterial) return; orig(renderer, sc, camera); };
  scene.add(refl);
  return refl;
}
