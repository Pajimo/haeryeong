import * as THREE from 'three';
import { rand, rr, pick, clamp } from './noise.js';
import { heightAt, groundAt } from './terrain.js';

function softDot() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Generic GPU-light particle pool using Points
class ParticlePool {
  constructor(scene, max, { size = 0.2, additive = true, map = null, sizeAtten = true }) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.siz = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.grav = new Float32Array(max); this.baseSize = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.siz, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, vertexColors: true,
      uniforms: { map: { value: map }, scale: { value: 600 } },
      vertexShader: `attribute float size; varying vec3 vColor; uniform float scale; void main(){ vColor=color; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize = size * scale / -mv.z; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vColor; void main(){ vec4 t=texture2D(map, gl_PointCoord); if(t.a<0.02) discard; gl_FragColor=vec4(vColor*t.rgb, t.a); }`,
    });
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false;
    scene.add(this.points); this.geo = g;
  }
  emit(p, v, color, size, life, grav = 9.8) {
    let i = this.n < this.max ? this.n++ : Math.floor(rand() * this.max);
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    const c = color.isColor ? color : new THREE.Color(color);
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.baseSize[i] = size; this.siz[i] = size; this.life[i] = life; this.maxLife[i] = life; this.grav[i] = grav;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.siz[i] = 0; continue; }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.vel[i * 3] *= 0.985; this.vel[i * 3 + 2] *= 0.985;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const k = this.life[i] / this.maxLife[i];
      this.siz[i] = this.baseSize[i] * Math.min(1, k * 2.5);
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.size.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
  }
}

// Sword trail ribbon
class Trail {
  constructor(scene) {
    this.N = 14; this.tips = []; this.bases = [];
    this.geo = new THREE.BufferGeometry();
    this.posArr = new Float32Array(this.N * 2 * 3); this.alpha = new Float32Array(this.N * 2);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const idx = []; for (let i = 0; i < this.N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color('#e8f2ff') }, uFade: { value: 1 } },
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA=alpha; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uFade; varying float vA; void main(){ gl_FragColor=vec4(uColor, vA*vA*0.75*uFade); }',
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat); this.mesh.frustumCulled = false; this.mesh.visible = false;
    scene.add(this.mesh); this.owner = null; this.fade = 0;
  }
  update(dt) {
    if (!this.owner && this.fade <= 0) { this.mesh.visible = false; return; }
    const tip = new THREE.Vector3(), base = new THREE.Vector3();
    if (this.owner && this.owner.char.swordDrawn) {
      this.owner.char.swordTip(tip); this.owner.char.swordBase(base);
      this.tips.unshift(tip.clone()); this.bases.unshift(base.clone());
      if (this.tips.length > this.N) { this.tips.pop(); this.bases.pop(); }
    } else { this.fade -= dt * 5; this.tips.pop(); this.bases.pop(); }
    this.mat.uniforms.uFade.value = this.owner ? 1 : Math.max(0, this.fade);
    const n = this.tips.length; if (n < 2) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    for (let i = 0; i < this.N; i++) {
      const j = Math.min(i, n - 1);
      const t = this.tips[j], b = this.bases[j];
      this.posArr.set([t.x, t.y, t.z], i * 6); this.posArr.set([b.x, b.y, b.z], i * 6 + 3);
      const a = i < n ? 1 - i / this.N : 0; this.alpha[i * 2] = a; this.alpha[i * 2 + 1] = a * 0.1;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.alpha.needsUpdate = true;
  }
}

export class FX {
  constructor(scene, world, env) {
    this.scene = scene; this.env = env; this.world = world;
    const dot = softDot();
    this.sparkPool = new ParticlePool(scene, 600, { map: dot, additive: true });
    this.bloodPool = new ParticlePool(scene, 500, { map: dot, additive: false });
    this.firePool = new ParticlePool(scene, 900, { map: dot, additive: true });
    this.flyPool = new ParticlePool(scene, 300, { map: dot, additive: true });
    this.smokePool = new ParticlePool(scene, 700, { map: dot, additive: false });
    this.smokeT = 0;
    this.trails = Array.from({ length: 10 }, () => new Trail(scene));
    this.t = 0;

    // falling leaves (instanced quads)
    const leafGeo = new THREE.PlaneGeometry(0.14, 0.09);
    const leafMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8, vertexColors: false });
    this.leafN = 500;
    this.leaves = new THREE.InstancedMesh(leafGeo, leafMat, this.leafN);
    this.leaves.frustumCulled = false;
    this.leafData = [];
    const cols = ['#c0391b', '#d9631c', '#e8a020', '#a82418', '#e8c030'];
    for (let i = 0; i < this.leafN; i++) {
      this.leafData.push({ p: new THREE.Vector3(rr(-40, 40), rr(0, 20), rr(-40, 40)), r: new THREE.Euler(rr(0, 6), rr(0, 6), rr(0, 6)), sp: new THREE.Vector3(rr(1, 3), rr(1, 3), rr(1, 3)), fall: rr(0.6, 1.3), ph: rr(0, 10) });
      this.leaves.setColorAt(i, new THREE.Color(pick(cols)));
    }
    scene.add(this.leaves);

    // rain streaks
    const rg = new THREE.BufferGeometry(); this.rainN = 3000;
    const rp = new Float32Array(this.rainN * 6);
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0.35 }));
    this.rain.frustumCulled = false; scene.add(this.rain);
    this.rainDrops = Array.from({ length: this.rainN }, () => new THREE.Vector3(rr(-40, 40), rr(0, 30), rr(-40, 40)));

    // sky lanterns
    this.skyLanterns = [];
    this.skyLanternMat = new THREE.MeshStandardMaterial({ color: '#ffcc88', emissive: '#ff9a3a', emissiveIntensity: 9, roughness: 0.8 });
    this.skyLanternGeo = new THREE.CylinderGeometry(0.28, 0.22, 0.55, 8);

    // fires (point lights + particles)
    this.fires = world.fires;
    this.fireLights = this.fires.map((f) => { const l = new THREE.PointLight(0xff8a3a, f.small ? 3 : 8, f.small ? 8 : 16, 2); l.position.set(f.x, f.y + 1, f.z); scene.add(l); return l; });

    // lantern light pool (move nearest lights to camera)
    this.lanternLights = Array.from({ length: 6 }, () => { const l = new THREE.PointLight(0xff9a50, 0, 12, 2); scene.add(l); return l; });
    this.lightTimer = 0;
  }

  setSeason(key) {
    this.seasonKey = key;
    const pal = { spring: ['#f6c6d6', '#fbe0ea', '#f2a8c0', '#ffffff', '#f8d0dc'], summer: ['#5f8a32', '#7aa03c', '#4f7a2a'], autumn: ['#c0391b', '#d9631c', '#e8a020', '#a82418', '#e8c030'], winter: ['#ffffff', '#f4f8ff', '#e8f0ff'] }[key];
    const c = new THREE.Color();
    for (let i = 0; i < this.leafN; i++) this.leaves.setColorAt(i, c.set(pal[i % pal.length]));
    this.leaves.instanceColor.needsUpdate = true;
    this.leafScale = key === 'winter' ? 0.32 : key === 'spring' ? 0.6 : 1;
    this.leaves.material.emissive = new THREE.Color(key === 'winter' ? '#606878' : '#000000');
  }

  sparks(p, n = 14, power = 1) {
    for (let i = 0; i < n; i++) this.sparkPool.emit(p, new THREE.Vector3(rr(-1, 1), rr(0, 1.5), rr(-1, 1)).normalize().multiplyScalar(rr(2, 7) * power), new THREE.Color().setHSL(rr(0.08, 0.13), 1, rr(0.6, 0.85)), rr(0.05, 0.12), rr(0.2, 0.5), 9);
    this.flash(p);
  }
  glint(p, heavy) {
    const c = heavy ? new THREE.Color(4, 0.5, 0.3) : new THREE.Color(3, 2.6, 1.8);
    this.sparkPool.emit(p, new THREE.Vector3(0, 0.15, 0), c, heavy ? 0.42 : 0.26, 0.28, 0);
    for (let i = 0; i < 6; i++) this.sparkPool.emit(p, new THREE.Vector3(rr(-1, 1), rr(-1, 1), rr(-1, 1)).multiplyScalar(1.5), c, 0.05, 0.22, 0);
  }
  flash(p) {
    if (!this.flashLight) { this.flashLight = new THREE.PointLight(0xffd8a0, 0, 6, 2); this.scene.add(this.flashLight); }
    this.flashLight.position.copy(p); this.flashLight.intensity = 12;
  }
  blood(p, n = 12, dir = 0) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(Math.sin(dir) * rr(1, 3) + rr(-1, 1), rr(0.5, 2.5), Math.cos(dir) * rr(1, 3) + rr(-1, 1));
      this.bloodPool.emit(p, v, new THREE.Color('#6a0a0a').multiplyScalar(rr(0.7, 1.2)), rr(0.05, 0.11), rr(0.4, 0.8), 12);
    }
  }
  startTrail(sim) {
    if (!sim.char.swordDrawn) return;
    const tr = this.trails.find((t) => t.owner === null && t.fade <= 0) || this.trails[0];
    tr.owner = sim; tr.tips = []; tr.bases = []; tr.fade = 1;
    tr.mat.uniforms.uColor.value.set(sim.controlled ? '#ffe8c8' : '#dfe8ff');
  }
  endTrail(sim) { for (const t of this.trails) if (t.owner === sim) { t.owner = null; t.fade = 1; } }
  skyLantern(xz) {
    if (this.skyLanterns.length > 80) return;
    const m = new THREE.Mesh(this.skyLanternGeo, this.skyLanternMat);
    m.position.set(xz[0], heightAt(xz[0], xz[1]) + 2, xz[1]);
    this.scene.add(m);
    this.skyLanterns.push({ m, v: rr(0.8, 1.5), ph: rr(0, 6), life: 120 });
  }

  update(dt, cam, focus) {
    this.t += dt;
    const env = this.env;
    this.smokePool.update(dt);
    // chimney smoke at mealtimes (and lightly in winter all day)
    this.smokeT -= dt;
    const hr = env.hour; const meal = (hr > 5.8 && hr < 8.5) || (hr > 16.8 && hr < 19.5) || env.season === 'winter';
    if (meal && this.smokeT <= 0 && this.world.houses) {
      this.smokeT = 0.12;
      for (const h of this.world.houses) {
        if (Math.hypot(h.x - focus.x, h.z - focus.z) > 140 || Math.random() > 0.35) continue;
        const c = h.chimney || (h.chimney = (() => { const p = h.world(h.w / 2 + 0.6, -h.d / 2 + 0.4); return [p[0], h.y0 + (h.style === 'choga' ? 2.2 : 3.0), p[1]]; })());
        const pp = new THREE.Vector3(c[0] + rr(-0.15, 0.15), c[1], c[2] + rr(-0.15, 0.15));
        const g = 0.55 + Math.random() * 0.2;
        this.smokePool.emit(pp, new THREE.Vector3(env.windDir.x * 0.6 + rr(-0.1, 0.1), rr(0.5, 0.9), env.windDir.y * 0.6 + rr(-0.1, 0.1)), new THREE.Color(g, g, g * 1.02), rr(0.7, 1.3), rr(3.5, 6), -0.02);
      }
    }
    this.sparkPool.update(dt); this.bloodPool.update(dt); this.firePool.update(dt); this.flyPool.update(dt);
    for (const t of this.trails) t.update(dt);
    if (this.flashLight) this.flashLight.intensity *= Math.exp(-dt * 18);

    // leaves around focus
    const ls = this.leafScale ?? 1; const winter = this.seasonKey === 'winter';
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(ls, ls, ls);
    const wd = env.windDir, ws = env.windStrength;
    for (let i = 0; i < this.leafN; i++) {
      const L = this.leafData[i];
      L.p.y -= L.fall * dt * (winter ? 0.7 : 1); L.p.x += (wd.x * ws * (winter ? 0.6 : 1.4) + Math.sin(this.t * 1.3 + L.ph) * 0.5) * dt; L.p.z += (wd.y * ws * 1.4 + Math.cos(this.t * 1.1 + L.ph) * 0.5) * dt;
      L.r.x += L.sp.x * dt; L.r.y += L.sp.y * dt; L.r.z += L.sp.z * dt;
      const wx = focus.x + L.p.x, wz = focus.z + L.p.z;
      const gy = heightAt(wx, wz);
      if (L.p.y + focus.y < gy || Math.abs(L.p.x) > 40 || Math.abs(L.p.z) > 40) { L.p.set(rr(-40, 40), rr(10, 22), rr(-40, 40)); }
      q.setFromEuler(L.r);
      m.compose(new THREE.Vector3(wx, focus.y + L.p.y, wz), q, s);
      this.leaves.setMatrixAt(i, m);
    }
    this.leaves.instanceMatrix.needsUpdate = true;
    const sk = this.seasonKey;
    this.leaves.count = Math.floor(this.leafN * (sk === 'winter' ? (env.weather === 'snow' ? 1 : 0.12) : sk === 'summer' ? 0.08 : sk === 'spring' ? clamp(0.35 + ws * 0.3, 0.3, 1) : clamp(0.25 + ws * 0.35, 0.2, 1)));

    // rain
    const rainAmt = this.seasonKey === 'winter' ? 0 : env.rain;
    this.rain.visible = rainAmt > 0.05;
    if (this.rain.visible) {
      const arr = this.rain.geometry.attributes.position.array; const n = Math.floor(this.rainN * rainAmt);
      for (let i = 0; i < this.rainN; i++) {
        const d = this.rainDrops[i];
        d.y -= dt * 22; d.x += wd.x * ws * dt * 3; d.z += wd.y * ws * dt * 3;
        if (d.y < -2 || Math.abs(d.x) > 40 || Math.abs(d.z) > 40) d.set(rr(-40, 40), rr(18, 30), rr(-40, 40));
        const x = focus.x + d.x, y = focus.y + d.y, z = focus.z + d.z;
        if (i < n) arr.set([x, y, z, x + wd.x * 0.2, y + 0.7, z + wd.y * 0.2], i * 6); else arr.set([0, -999, 0, 0, -999, 0], i * 6);
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }

    // fireflies at night
    if (env.nightBlend > 0.6 && rand() < 0.5) {
      const p = new THREE.Vector3(focus.x + rr(-35, 35), 0, focus.z + rr(-35, 35)); p.y = heightAt(p.x, p.z) + rr(0.4, 2);
      this.flyPool.emit(p, new THREE.Vector3(rr(-0.3, 0.3), rr(-0.1, 0.2), rr(-0.3, 0.3)), new THREE.Color('#c8ff70'), rr(0.06, 0.1), rr(3, 6), 0);
    }
    // dust motes in sunlight (golden hour)
    if (env.golden > 0.3 && env.nightBlend < 0.3 && rand() < 0.6) {
      const p = new THREE.Vector3(focus.x + rr(-20, 20), 0, focus.z + rr(-20, 20)); p.y = heightAt(p.x, p.z) + rr(0.5, 4);
      this.flyPool.emit(p, new THREE.Vector3(wd.x * 0.5, rr(-0.05, 0.1), wd.y * 0.5), new THREE.Color('#ffd9a0').multiplyScalar(0.5), rr(0.03, 0.06), rr(3, 5), 0);
    }

    // fires
    this.fires.forEach((f, i) => {
      const l = this.fireLights[i];
      l.intensity = (f.small ? 2.5 : 7) * (0.8 + Math.sin(this.t * 13 + i) * 0.1 + Math.sin(this.t * 7.3) * 0.1) * (0.4 + env.nightBlend * 0.8);
      const near = Math.hypot(f.x - focus.x, f.z - focus.z) < 120;
      if (near && rand() < (f.small ? 0.4 : 0.9)) {
        const p = new THREE.Vector3(f.x + rr(-0.4, 0.4), f.y + 0.2, f.z + rr(-0.4, 0.4));
        this.firePool.emit(p, new THREE.Vector3(rr(-0.2, 0.2), rr(1.2, 2.4), rr(-0.2, 0.2)), new THREE.Color().setHSL(rr(0.03, 0.1), 1, 0.55), f.small ? rr(0.2, 0.35) : rr(0.35, 0.7), rr(0.4, 0.9), -0.5);
        if (rand() < 0.15) this.firePool.emit(p, new THREE.Vector3(rr(-0.5, 0.5), rr(2, 4), rr(-0.5, 0.5)), new THREE.Color('#ffb060'), 0.06, rr(1, 2), 0);
      }
    });

    // sky lanterns
    for (const L of this.skyLanterns) {
      L.life -= dt; L.m.position.y += L.v * dt; L.m.position.x += (wd.x * 0.6 + Math.sin(this.t + L.ph) * 0.2) * dt; L.m.position.z += (wd.y * 0.6) * dt;
      if (L.life <= 0) this.scene.remove(L.m);
    }
    this.skyLanterns = this.skyLanterns.filter((L) => L.life > 0);

    // lantern light pool
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.5;
      const lan = this.world.lanterns.map((L) => [Math.hypot(L.x - focus.x, L.z - focus.z), L]).sort((a, b) => a[0] - b[0]).slice(0, this.lanternLights.length);
      lan.forEach(([, L], i) => this.lanternLights[i].position.set(L.x, L.y - 0.1, L.z));
    }
    for (const l of this.lanternLights) l.intensity = env.nightBlend * 4.0;
  }
}
