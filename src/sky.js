import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { clamp, lerp, smoothstep, rr, pick, chance } from './noise.js';

const tmpC = new THREE.Color();

function lerpColor(stops, t) {
  // stops: [[t, '#hex'], ...]
  for (let i = 0; i < stops.length - 1; i++) {
    if (t <= stops[i + 1][0]) {
      const k = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
      return new THREE.Color(stops[i][1]).lerp(new THREE.Color(stops[i + 1][1]), clamp(k, 0, 1));
    }
  }
  return new THREE.Color(stops[stops.length - 1][1]);
}

export class Environment {
  constructor(scene, renderer, quality) {
    this.scene = scene; this.renderer = renderer;
    this.hour = 7.2; this.day = 1;
    this.weather = 'clear'; this.weatherTimer = 240; this.rain = 0; this.cloudiness = 0.2; this.targetCloud = 0.2;
    this.windDir = new THREE.Vector2(1, 0.35).normalize();
    this.windStrength = 1; this.gust = 0; this.spiritWindTarget = null; this.spiritWindTimer = 0;

    this.sky = new Sky(); this.sky.scale.setScalar(5000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 5.5; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.86;
    scene.add(this.sky);

    // separate sky for environment reflections
    this.envScene = new THREE.Scene();
    this.envSky = new Sky(); this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null; this.envTimer = 0;

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const ss = quality === 'high' ? 4096 : 2048;
    this.sun.shadow.mapSize.set(ss, ss);
    const S = 75;
    Object.assign(this.sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 500 });
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun); scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x5a4a30, 0.8);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0xb8c4cc, 0.0016);

    // stars
    const sg = new THREE.BufferGeometry(); const sp = [];
    for (let i = 0; i < 2500; i++) {
      const v = new THREE.Vector3().randomDirection(); v.y = Math.abs(v.y) * 0.95 + 0.05; v.normalize().multiplyScalar(2400);
      sp.push(v.x, v.y, v.z);
    }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sg, this.starMat); scene.add(this.stars);

    // moon
    const moonTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      const grd = g.createRadialGradient(64, 64, 10, 64, 64, 64);
      grd.addColorStop(0, 'rgba(255,250,235,1)'); grd.addColorStop(0.45, 'rgba(255,245,220,1)'); grd.addColorStop(0.5, 'rgba(255,240,210,0.35)'); grd.addColorStop(1, 'rgba(255,240,210,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
      g.fillStyle = 'rgba(180,170,150,0.25)'; [[50, 50, 10], [75, 70, 7], [60, 80, 6]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); });
      return new THREE.CanvasTexture(c);
    })();
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, color: 0xffffff, fog: false, depthWrite: false, transparent: true }));
    this.moon.scale.setScalar(260); scene.add(this.moon);

    // cloud layer
    this.cloudMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { uTime: { value: 0 }, uCover: { value: 0.3 }, uSunCol: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uWind: { value: new THREE.Vector2(1, 0.3) } },
      vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uTime; uniform float uCover; uniform vec3 uSunCol; uniform vec3 uShade; uniform vec2 uWind; varying vec2 vUv; varying vec3 vW;
        float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
        float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<6;i++){s+=a*n(p);p*=2.03;a*=.5;}return s;}
        void main(){ vec2 p=vW.xz*0.0016 + uWind*uTime*0.004; float f=fbm(p); float f2=fbm(p*2.3+7.);
          float c=smoothstep(1.0-uCover-0.15, 1.0-uCover+0.35, f*0.75+f2*0.35);
          float edge=length(vW.xz)/2600.; float fade=1.-smoothstep(0.55,1.0,edge);
          vec3 col=mix(uShade,uSunCol,smoothstep(0.2,0.9,f2));
          gl_FragColor=vec4(col, c*fade*0.92); }`,
    });
    const cloud = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), this.cloudMat);
    cloud.rotation.x = Math.PI / 2; cloud.position.y = 420; cloud.renderOrder = -1;
    scene.add(cloud);

    this.farMats = [];
    this.sunDir = new THREE.Vector3();
    this.isNight = false;
    this.setWeather('clear');
  }

  get timeLabel() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  setWeather(w) {
    this.weather = w;
    this.targetCloud = { clear: 0.18, cloudy: 0.55, rain: 0.8, mist: 0.4, windy: 0.3, snow: 0.75 }[w];
    this.targetRain = w === 'rain' ? 1 : 0;
    this.targetWind = { clear: 0.9, cloudy: 1.2, rain: 1.6, mist: 0.5, windy: 2.2, snow: 0.7 }[w];
    this.weatherTimer = rr(180, 420);
  }

  advance(gameMinutes) {
    this.hour += gameMinutes / 60;
    if (this.hour >= 24) { this.hour -= 24; this.day++; }
    this.weatherTimer -= gameMinutes;
    if (this.weatherTimer <= 0) {
      const pool = { spring: ['clear', 'clear', 'clear', 'mist', 'windy', 'rain'], summer: ['clear', 'clear', 'rain', 'rain', 'cloudy', 'mist'], autumn: ['clear', 'clear', 'clear', 'cloudy', 'windy', 'mist', 'rain'], winter: ['snow', 'snow', 'clear', 'cloudy', 'clear', 'windy'] }[this.seasonKey || 'autumn'];
      this.setWeather(pick(pool));
      return this.weather;
    }
    return null;
  }

  update(dt, t, focus) {
    const h = this.hour;
    // sun path
    const dayT = (h - 6) / 12; // 0 at sunrise, 1 at sunset
    const elev = Math.sin(dayT * Math.PI) * (this.maxElev ?? 56); // deg
    const azim = lerp(100, 260, clamp(dayT, 0, 1));
    const phi = THREE.MathUtils.degToRad(90 - elev);
    const theta = THREE.MathUtils.degToRad(azim);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    const sunUp = smoothstep(-6, 6, elev);
    this.isNight = elev < -4;

    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir);
    const cloudy = this.cloudiness;
    u.turbidity.value = lerp(5, 12, cloudy);
    u.rayleigh.value = lerp(1.3, 0.6, cloudy) + (1 - sunUp) * 0.8;
    const eu = this.envSky.material.uniforms;
    for (const k of ['sunPosition', 'turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) {
      if (eu[k].value.copy) eu[k].value.copy(u[k].value); else eu[k].value = u[k].value;
    }

    // moon opposite-ish
    const moonDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - Math.sin(((h + 12) % 24 - 6) / 12 * Math.PI) * 50), THREE.MathUtils.degToRad(lerp(100, 260, clamp(((h + 12) % 24 - 6) / 12, 0, 1))));
    this.moon.position.copy(moonDir).multiplyScalar(2200).add(focus);
    this.moon.material.opacity = (1 - sunUp) * (1 - cloudy * 0.7);
    this.stars.position.copy(focus);
    this.starMat.opacity = (1 - smoothstep(-8, 4, elev)) * (1 - cloudy);

    // light
    const golden = 1 - smoothstep(4, 28, elev);
    const lightDir = elev > -4 ? this.sunDir : moonDir;
    const sunCol = lerpColor([[0, '#ff8a4a'], [0.4, '#ffc58a'], [1, '#fff4e0']], smoothstep(0, 35, elev));
    const nightBlend = 1 - smoothstep(-6, 2, elev);
    const lc = sunCol.clone().lerp(new THREE.Color('#9db4ff'), nightBlend);
    this.sun.color.copy(lc);
    const dim = 1 - cloudy * 0.55;
    this.sun.intensity = lerp(lerp(0.0, 3.4, smoothstep(-4, 10, elev)), 1.1, nightBlend) * dim * (1 - this.rain * 0.4);
    this.sun.position.copy(focus).addScaledVector(lightDir, 250);
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();

    const skyC = lerpColor([[0, '#3a4a7a'], [0.18, '#5a5878'], [0.3, '#e8a878'], [0.45, '#e8c8a8'], [0.65, '#c4d0e0'], [1, '#aac4e6']], smoothstep(-12, 40, elev));
    this.hemi.color.copy(skyC);
    this.hemi.groundColor.set(nightBlend > 0.5 ? '#202436' : golden > 0.5 ? '#7a5a3a' : '#5a4a30');
    this.hemi.groundColor.lerp(new THREE.Color(nightBlend > 0.5 ? '#3a4058' : '#c8ccd4'), Math.min(1, (this.snowCover || 0) * 0.7));
    this.hemi.intensity = lerp(1.05 + golden * 0.35, 1.0, nightBlend) * (1 - cloudy * 0.2);

    // fog color
    const fogC = lerpColor([[0, '#1a2238'], [0.35, '#3b3a4d'], [0.5, '#e0a678'], [0.65, '#d8c2a6'], [1, '#bccbd6']], smoothstep(-10, 45, elev));
    fogC.lerp(new THREE.Color('#9aa3a8'), cloudy * 0.5);
    const sw = this.seasonW || [0, 0, 1, 0];
    fogC.lerp(new THREE.Color('#c4d0dc'), sw[3] * 0.35 * (1 - nightBlend * 0.7));
    this.maxElev = 56 * sw[0] + 68 * sw[1] + 50 * sw[2] + 36 * sw[3];
    this.scene.fog.color.copy(fogC);
    const mistBoost = this.weather === 'mist' ? 0.004 : 0;
    this.scene.fog.density = lerp(this.scene.fog.density, 0.0016 + mistBoost + this.rain * 0.0025 + golden * 0.0006, 0.02);
    this.renderer.toneMappingExposure = lerp(0.5 + golden * 0.12, 0.8, nightBlend);

    // far mountains tint
    const mtnShade = lerp(1, 0.18, nightBlend);
    for (const m of this.farMats) { m.color.copy(m.userData.base).multiplyScalar(mtnShade).lerp(fogC, 0.35); }

    // clouds
    this.cloudiness = lerp(this.cloudiness, this.targetCloud, 0.004);
    this.rain = lerp(this.rain, this.targetRain || 0, 0.005);
    this.cloudMat.uniforms.uTime.value = t;
    this.cloudMat.uniforms.uCover.value = this.cloudiness;
    this.cloudMat.uniforms.uSunCol.value.copy(sunCol).lerp(new THREE.Color('#202838'), nightBlend * 0.9).lerp(new THREE.Color('#9a9ea4'), cloudy * 0.5);
    this.cloudMat.uniforms.uShade.value.copy(fogC).multiplyScalar(0.8);
    this.cloudMat.uniforms.uWind.value.copy(this.windDir);

    // wind
    this.gust = Math.max(0, Math.sin(t * 0.21) * Math.sin(t * 0.37 + 1.3)) * 0.8;
    let target = this.targetWind ?? 1;
    if (this.spiritWindTimer > 0) {
      this.spiritWindTimer -= dt; target = 2.6;
      if (this.spiritWindTarget) {
        const d = new THREE.Vector2(this.spiritWindTarget.x - focus.x, this.spiritWindTarget.z - focus.z).normalize();
        this.windDir.lerp(d, 0.05).normalize();
      }
    } else {
      const base = new THREE.Vector2(Math.cos(t * 0.01), Math.sin(t * 0.01) * 0.5 + 0.35).normalize();
      this.windDir.lerp(base, 0.002).normalize();
    }
    this.windStrength = lerp(this.windStrength, target + this.gust, 0.02);

    // env map
    this.envTimer -= dt;
    if (this.envTimer <= 0) {
      this.envTimer = 2.5;
      if (this.envRT) this.envRT.dispose();
      this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 2000);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = lerp(0.9, 0.35, nightBlend);
    }
    this.nightBlend = nightBlend; this.elev = elev; this.golden = golden;
  }
}
