import * as THREE from 'three';
import { mulberry32 } from './noise.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, rep = true) {
  const t = new THREE.CanvasTexture(c);
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function tileTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#5a5e64'; g.fillRect(0, 0, 256, 256);
  const cols = 8, rows = 6, cw = 256 / cols, rh = 256 / rows;
  for (let i = 0; i < cols; i++) {
    const grd = g.createLinearGradient(i * cw, 0, (i + 1) * cw, 0);
    grd.addColorStop(0, '#2a2d31'); grd.addColorStop(0.18, '#4d5258'); grd.addColorStop(0.45, '#7a8088');
    grd.addColorStop(0.75, '#50555b'); grd.addColorStop(1, '#25282b');
    g.fillStyle = grd; g.fillRect(i * cw, 0, cw, 256);
  }
  for (let j = 0; j < rows; j++) {
    const y = j * rh;
    const grd = g.createLinearGradient(0, y, 0, y + rh);
    grd.addColorStop(0, 'rgba(0,0,0,0.45)'); grd.addColorStop(0.12, 'rgba(0,0,0,0)'); grd.addColorStop(0.9, 'rgba(255,255,255,0.06)'); grd.addColorStop(1, 'rgba(0,0,0,0.2)');
    g.fillStyle = grd; g.fillRect(0, y, 256, rh);
  }
  const r = mulberry32(3);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},0.04)`; g.fillRect(r() * 256, r() * 256, 2, 2); }
  return tex(c);
}

export function thatchTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#a88f5a'; g.fillRect(0, 0, 256, 256);
  const r = mulberry32(9);
  for (let i = 0; i < 2600; i++) {
    const x = r() * 256, y = r() * 256, l = 8 + r() * 22;
    const s = 120 + r() * 100;
    g.strokeStyle = `rgba(${s},${s * 0.82},${s * 0.5},${0.4 + r() * 0.5})`; g.lineWidth = 1 + r();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y + l); g.stroke();
  }
  // rope lines
  g.strokeStyle = 'rgba(70,55,30,0.55)'; g.lineWidth = 2;
  for (let i = 0; i < 256; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); }
  return tex(c);
}

export function facadeTexture(dancheong = false) {
  const [c, g] = canvas(512, 256);
  const [e, ge] = canvas(512, 256);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, 512, 256);
  g.fillStyle = '#ece4d0'; g.fillRect(0, 0, 512, 256);
  const r = mulberry32(5);
  for (let i = 0; i < 2000; i++) { g.fillStyle = `rgba(120,100,70,${r() * 0.05})`; g.fillRect(r() * 512, r() * 256, 3, 3); }
  const wood = dancheong ? '#8e2a22' : '#5b3622';
  g.fillStyle = wood;
  g.fillRect(0, 0, 512, 16); g.fillRect(0, 240, 512, 16); g.fillRect(0, 0, 18, 256); g.fillRect(494, 0, 18, 256);
  g.fillRect(0, 168, 512, 10);
  // lattice doors (changho)
  const panels = [[70, 28, 160, 136], [282, 28, 160, 136]];
  for (const [x, y, w, h] of panels) {
    g.fillStyle = '#f4ead1'; g.fillRect(x, y, w, h);
    ge.fillStyle = '#ffd9a0'; ge.fillRect(x, y, w, h);
    g.strokeStyle = wood; g.lineWidth = 3;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(x + (w * i) / 8, y); g.lineTo(x + (w * i) / 8, y + h); g.stroke(); }
    for (let j = 0; j <= 10; j++) { g.beginPath(); g.moveTo(x, y + (h * j) / 10); g.lineTo(x + w, y + (h * j) / 10); g.stroke(); }
    ge.strokeStyle = '#000'; ge.lineWidth = 3;
    for (let i = 0; i <= 8; i++) { ge.beginPath(); ge.moveTo(x + (w * i) / 8, y); ge.lineTo(x + (w * i) / 8, y + h); ge.stroke(); }
    for (let j = 0; j <= 10; j++) { ge.beginPath(); ge.moveTo(x, y + (h * j) / 10); ge.lineTo(x + w, y + (h * j) / 10); ge.stroke(); }
    g.lineWidth = 6; g.strokeRect(x, y, w, h);
  }
  g.fillStyle = wood; g.fillRect(246, 0, 20, 256);
  return { map: tex(c, false), emissive: tex(e, false) };
}

export function dancheongTexture() {
  const [c, g] = canvas(512, 64);
  g.fillStyle = '#2f7b67'; g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#1f4f8a'; g.fillRect(0, 0, 512, 10);
  g.fillStyle = '#a8342a'; g.fillRect(0, 54, 512, 10);
  for (let i = 0; i < 512; i += 64) {
    g.fillStyle = '#e9d9a8'; g.beginPath(); g.ellipse(i + 32, 32, 18, 14, 0, 0, 7); g.fill();
    g.fillStyle = '#c0392b'; g.beginPath(); g.ellipse(i + 32, 32, 10, 8, 0, 0, 7); g.fill();
    g.fillStyle = '#f2c14e'; g.beginPath(); g.arc(i + 32, 32, 4, 0, 7); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); g.moveTo(i, 12); g.lineTo(i + 10, 32); g.lineTo(i, 52); g.stroke();
  }
  return tex(c);
}

export function stoneTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#7d776d'; g.fillRect(0, 0, 256, 256);
  const r = mulberry32(13);
  for (let row = 0; row < 8; row++) {
    let x = -r() * 30;
    while (x < 256) {
      const w = 26 + r() * 30; const s = 100 + r() * 50;
      g.fillStyle = `rgb(${s},${s * 0.96},${s * 0.9})`;
      g.beginPath(); g.roundRect(x + 2, row * 32 + 2, w - 4, 28, 6); g.fill();
      x += w;
    }
  }
  return tex(c);
}

export function plasterTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#e8e0cc'; g.fillRect(0, 0, 128, 128);
  const r = mulberry32(17);
  for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(110,90,60,${r() * 0.06})`; g.fillRect(r() * 128, r() * 128, 2 + r() * 3, 2 + r() * 3); }
  return tex(c);
}

export function jangseungTexture(text) {
  const [c, g] = canvas(128, 512);
  g.fillStyle = '#8a6a4a'; g.fillRect(0, 0, 128, 512);
  const r = mulberry32(21);
  for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(60,40,25,${0.2 + r() * 0.3})`; g.beginPath(); const x = r() * 128; g.moveTo(x, 0); g.lineTo(x + (r() - .5) * 10, 512); g.stroke(); }
  // face
  g.fillStyle = '#1a1210';
  g.beginPath(); g.ellipse(38, 80, 16, 12, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(90, 80, 16, 12, 0, 0, 7); g.fill();
  g.fillStyle = '#f2e6c8'; g.beginPath(); g.arc(38, 80, 6, 0, 7); g.fill(); g.beginPath(); g.arc(90, 80, 6, 0, 7); g.fill();
  g.strokeStyle = '#1a1210'; g.lineWidth = 6; g.beginPath(); g.moveTo(20, 56); g.quadraticCurveTo(38, 40, 56, 58); g.stroke(); g.beginPath(); g.moveTo(72, 58); g.quadraticCurveTo(90, 40, 108, 56); g.stroke();
  g.fillStyle = '#b5532f'; g.beginPath(); g.ellipse(64, 115, 12, 20, 0, 0, 7); g.fill();
  g.fillStyle = '#1a1210'; g.beginPath(); g.ellipse(64, 160, 34, 12, 0, 0, Math.PI); g.fill();
  g.fillStyle = '#f2e6c8'; for (let i = 0; i < 6; i++) g.fillRect(36 + i * 10, 160, 7, 8);
  g.fillStyle = '#1a1210'; g.font = 'bold 44px serif'; g.textAlign = 'center';
  [...text].forEach((ch, i) => g.fillText(ch, 64, 240 + i * 52));
  return tex(c, false);
}

export function lanternTexture(color = '#c0392b') {
  const [c, g] = canvas(64, 64);
  g.fillStyle = color; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#1f4f8a'; g.fillRect(0, 0, 64, 10); g.fillRect(0, 54, 64, 10);
  g.strokeStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 64; i += 8) { g.beginPath(); g.moveTo(i, 10); g.lineTo(i, 54); g.stroke(); }
  return tex(c);
}

export function clothTexture(color) {
  const [c, g] = canvas(64, 64);
  g.fillStyle = color; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.18)'; for (let i = 0; i < 64; i += 16) g.fillRect(i, 0, 8, 64);
  return tex(c);
}

// ---------- Photographic PBR textures (Poly Haven, CC0; 1K JPGs in public/tex) ----------
// Loaded asynchronously: each texture starts as a 1x1 neutral placeholder and fills in when the
// image arrives. `userData.avg` holds the image's mean colour (linear), so shaders can use a photo
// as a *detail* multiplier (texel / mean) on top of the existing vertex colours and season tints.
const _loader = new THREE.ImageLoader();
const _photo = {};
const _srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export function photoTex(name, color = true) {
  if (_photo[name]) return _photo[name];
  const ph = document.createElement('canvas'); ph.width = ph.height = 1;
  const pg = ph.getContext('2d'); pg.fillStyle = color ? '#808080' : '#8080ff'; pg.fillRect(0, 0, 1, 1);
  const t = new THREE.Texture(ph);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.userData.avg = new THREE.Vector3(0.216, 0.216, 0.216); // linear mid grey
  t.needsUpdate = true;
  _loader.load(`${import.meta.env.BASE_URL}tex/${name}.jpg`, (img) => {
    // the 1x1 placeholder was allocated with immutable storage: free it so the 1K image re-allocates
    t.dispose(); t.image = img; t.needsUpdate = true;
    if (color) {
      try {
        const S = 16, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0, S, S); const d = g.getImageData(0, 0, S, S).data; let r = 0, gg = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += _srgbToLin(d[i] / 255); gg += _srgbToLin(d[i + 1] / 255); b += _srgbToLin(d[i + 2] / 255); }
        const n = d.length / 4; t.userData.avg.set(r / n, gg / n, b / n);
      } catch (e) { /* keep the grey estimate */ }
    }
  }, undefined, (e) => console.warn('[textures] failed to load', name, e));
  return (_photo[name] = t);
}

let _tpId = 0;
// World-space triplanar detail for merged static meshes whose box UVs don't match real-world scale.
// The photo multiplies the albedo as (texel / mean), so vertex colours stay the tint; optional normal map.
// Must be applied BEFORE addSnow() so the snow is mixed in after (and on top of) the detail.
export function addTriplanarDetail(mat, { map, normalMap = null, scale = 0.5, strength = 0.6, normalScale = 0.6, grainUp = false, hue = 0.35, tint = '#ffffff' }) {
  const id = ++_tpId;
  const prev = mat.onBeforeCompile;
  const U = { tpMap: { value: map }, tpAvg: { value: map.userData.avg }, tpScale: { value: scale }, tpStr: { value: strength }, tpNS: { value: normalScale }, tpNorm: { value: normalMap || map }, tpTint: { value: new THREE.Color(tint) } };
  mat.userData.tpUniforms = U;
  const sw = grainUp; // swap so plank grain runs vertically on walls and posts
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTpP; varying vec3 vTpN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvTpP = (modelMatrix * vec4(transformed, 1.0)).xyz; vTpN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vTpP; varying vec3 vTpN;
      uniform sampler2D tpMap; uniform sampler2D tpNorm; uniform vec3 tpAvg; uniform float tpScale; uniform float tpStr; uniform float tpNS; uniform vec3 tpTint;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 tpN0 = normalize(vTpN);
        vec3 tpw = pow(abs(tpN0), vec3(4.0)); tpw /= (tpw.x + tpw.y + tpw.z);
        vec3 tpP = vTpP * tpScale;
        vec2 tpUX = ${sw ? 'tpP.yz' : 'tpP.zy'}, tpUY = tpP.xz, tpUZ = ${sw ? 'tpP.yx' : 'tpP.xy'};
        vec3 tpC = texture2D(tpMap, tpUX).rgb * tpw.x + texture2D(tpMap, tpUY).rgb * tpw.y + texture2D(tpMap, tpUZ).rgb * tpw.z;
        vec3 tpD = clamp(tpC / max(tpAvg, vec3(0.01)), 0.0, 2.5);
        tpD = mix(vec3(dot(tpD, vec3(0.299, 0.587, 0.114))), tpD, ${hue.toFixed(2)});
        diffuseColor.rgb *= mix(vec3(1.0), tpD, tpStr) * tpTint;`);
    if (normalMap) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 nX = (texture2D(tpNorm, tpUX).xy * 2.0 - 1.0) * tpNS;
          vec2 nY = (texture2D(tpNorm, tpUY).xy * 2.0 - 1.0) * tpNS;
          vec2 nZ = (texture2D(tpNorm, tpUZ).xy * 2.0 - 1.0) * tpNS;
          ${sw ? 'nX = nX.yx; nZ = nZ.yx;' : ''}
          vec3 tpWN = normalize(vec3(0.0, nX.y, nX.x) * tpw.x + vec3(nY.x, 0.0, nY.y) * tpw.y + vec3(nZ.x, nZ.y, 0.0) * tpw.z + tpN0);
          normal = normalize(mat3(viewMatrix) * tpWN);
        }`);
  };
  const pk = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (pk ? pk() : '') + '|tp' + id;
  mat.needsUpdate = true;
  return mat;
}

let _nmId = 0;
// Use a UV-mapped photo as a recoloured map: albedo = target * (texel / mean), with `hue` keeping some
// of the photo's own colour variation (0 = greyscale detail). Lets a red clay tile read as dark giwa.
export function recolorMap(mat, target, hue = 0.0, contrast = 1.0) {
  const id = ++_nmId; const prev = mat.onBeforeCompile;
  const U = { rmTarget: { value: new THREE.Color(target) }, rmAvg: { value: mat.map.userData.avg }, rmContrast: { value: contrast } };
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 rmTarget; uniform vec3 rmAvg; uniform float rmContrast;')
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec3 rmC = texture2D(map, vMapUv).rgb / max(rmAvg, vec3(0.01));
          rmC = mix(vec3(dot(rmC, vec3(0.299, 0.587, 0.114))), rmC, ${hue.toFixed(2)});
          rmC = pow(max(rmC, vec3(0.0)), vec3(rmContrast));
          diffuseColor.rgb *= rmTarget * clamp(rmC, 0.0, 3.0);
        #endif`);
  };
  const pk = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (pk ? pk() : '') + '|rm' + id;
  mat.needsUpdate = true;
  return mat;
}
