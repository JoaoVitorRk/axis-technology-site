// AXIS · cenas 3D do site (three.js r160)
// 1) Abertura: a palmilha é impressa camada por camada, o eixo sobe e as vértebras se alinham.
// 2) Card "Projeto 3D": o mesmo modelo da palmilha, em contornos ou em distribuição de cargas.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const MINT = 0x45e0c2, TEAL = 0x13a487, INK = 0x03090d, CREAM = 0xece3ce;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const eo = x => 1 - Math.pow(1 - clamp(x), 3);
const eio = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const back = x => { x = clamp(x); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const lerp = (a, b, t) => a + (b - a) * t;
function cr(ts, vs, t) { // Catmull-Rom
  let i = 1; while (i < ts.length - 1 && t > ts[i]) i++;
  const i0 = Math.max(0, i - 2), i1 = i - 1, i2 = i, i3 = Math.min(ts.length - 1, i + 1);
  const u = (t - ts[i1]) / ((ts[i2] - ts[i1]) || 1), p0 = vs[i0], p1 = vs[i1], p2 = vs[i2], p3 = vs[i3];
  return .5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
}
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
// ajuste fino por endereço (só para teste): ?t=2.5 congela o tempo da abertura; ?yaw=.5 etc.
const Q = new URLSearchParams(location.search);
const P = (k, d) => (Q.has(k) ? parseFloat(Q.get(k)) : d);
const FREEZE = Q.has('t') ? parseFloat(Q.get('t')) : null;

function webglOk() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}

/* ================= palmilha (mm; comprimento no eixo Y, altura no Z) ================= */
const T = [0, .12, .25, .38, .5, .62, .72, .8, .88, .94, 1];
const LAT = [31, 31, 31.5, 32.5, 34, 37.5, 40.5, 41.5, 39.5, 35, 30];
const MED = [31, 30, 27, 22.5, 20.5, 26, 35, 40.5, 42, 39, 33];
function halfWidths(u) {
  let lat = cr(T, LAT, u), med = cr(T, MED, u);
  const d = u * 260, dt = (1 - u) * 260;
  const hc = d < 31 ? Math.sqrt(Math.max(0, 62 * d - d * d)) : 1e9;
  const tc = dt < 40 ? Math.sqrt(Math.max(0, 80 * dt - dt * dt)) : 1e9;
  return [Math.min(lat, hc, tc * .93), Math.min(med, hc, tc)];
}
function topZ(u, v) {
  const av = Math.abs(v);
  let z = 2.6 + 5.4 * Math.pow(1 - u, 1.6);
  z += 15 * (1 - sm(.1, .55, u)) * Math.pow(sm(.5, 1, av), 1.7);          // calcanhar em concha
  if (v > 0) z += 5 * (1 - sm(.4, .72, u)) * Math.pow(sm(.6, 1, v), 1.7);   // borda lateral
  z += 14 * Math.exp(-Math.pow((u - .42) / .14, 2)) * sm(.15, -.95, v);     // arco medial
  z += 2.6 * Math.exp(-Math.pow((u - .67) / .06, 2)) * Math.exp(-v * v / .18); // apoio metatarsal
  return z;
}
function loadAt(u, v) {
  const av = Math.abs(v);
  let l = .95 * Math.exp(-Math.pow((u - .1) / .09, 2)) * Math.exp(-v * v / .5)
    + .82 * Math.exp(-Math.pow((u - .72) / .065, 2)) * (v < 0 ? 1 : .78)
    + .66 * Math.exp(-Math.pow((u - .93) / .04, 2)) * (v < 0 ? 1 : .35)
    + .4 * Math.exp(-Math.pow((u - .45) / .12, 2)) * sm(-.1, .7, v);
  return clamp(l * (1 - .8 * Math.pow(av, 6)));
}
function buildInsole(NU, NV) {
  const pos = [], uv = [], col = [], ld = [], hz = [], idx = [];
  const cTeal = new THREE.Color(TEAL), cDark = new THREE.Color(0x14191c), tmp = new THREE.Color();
  const grid = (top) => {
    const start = pos.length / 3;
    for (let i = 0; i <= NU; i++) {
      const u = (1 - Math.cos(Math.PI * i / NU)) / 2, [lat, med] = halfWidths(u);
      for (let j = 0; j <= NV; j++) {
        const w = -1 + 2 * j / NV, v = Math.sin(w * Math.PI / 2);
        const x = v < 0 ? v * med : v * lat, y = (u - .5) * 260, zt = topZ(u, v);
        const th = (2.2 + 3.4 * Math.pow(1 - u, 1.5)) * (1 - .45 * sm(.6, 1, Math.abs(v)));
        const z = top ? zt : zt - th;   // casca: a parte de baixo acompanha o arco (oca embaixo)
        pos.push(x, y, z); uv.push((v + 1) / 2, u); ld.push(loadAt(u, v)); hz.push(z / 22);
        tmp.copy(cTeal).lerp(cDark, sm(.34, .48, u)); col.push(tmp.r, tmp.g, tmp.b);
      }
    }
    return start;
  };
  const t0 = grid(true), b0 = grid(false), R = NV + 1;
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = t0 + i * R + j, b = a + R; idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const topCount = idx.length;
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = b0 + i * R + j, b = a + R; idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  // paredes laterais (vértices duplicados para a aresta ficar nítida)
  for (const j of [0, NV]) {
    const s0 = pos.length / 3;
    for (let i = 0; i <= NU; i++) {
      for (const g of [t0, b0]) {
        const k = g + i * R + j;
        pos.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]); uv.push(uv[k * 2], uv[k * 2 + 1]);
        ld.push(ld[k]); hz.push(hz[k]); col.push(col[k * 3], col[k * 3 + 1], col[k * 3 + 2]);
      }
    }
    for (let i = 0; i < NU; i++) {
      const T0 = s0 + i * 2, B0 = T0 + 1, T1 = T0 + 2, B1 = T0 + 3;
      if (j === NV) idx.push(B0, B1, T0, B1, T1, T0); else idx.push(B0, T0, B1, B1, T0, T1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aLoad', new THREE.Float32BufferAttribute(ld, 1));
  g.setAttribute('aZ', new THREE.Float32BufferAttribute(hz, 1));
  g.setIndex(idx);
  g.addGroup(0, topCount, 0); g.addGroup(topCount, idx.length - topCount, 1);
  g.translate(0, 0, -7);
  g.computeVertexNormals();
  return g;
}
function knitTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 1536;
  const x = c.getContext('2d');
  x.fillStyle = '#8a9094'; x.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < c.height; y += 7) for (let i = 0; i < c.width; i += 8) {
    const l = 105 + Math.random() * 50;
    x.strokeStyle = `rgb(${l},${l + 4},${l + 6})`; x.lineWidth = 2.2;
    x.beginPath(); x.moveTo(i, y); x.lineTo(i + 4, y + 5); x.lineTo(i + 8, y); x.stroke();
  }
  x.save(); x.translate(c.width * .5, c.height * .73); x.rotate(-Math.PI / 2);
  x.fillStyle = 'rgba(28,32,35,.55)'; x.font = '300 112px Archivo, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('A X I S', 0, 0); x.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/* ================= vértebras ================= */
function vertebra(r, h, reg) {
  const prof = [[0, -h / 2], [r * .84, -h / 2], [r * .98, -h * .38], [r * .9, 0], [r * .98, h * .38], [r * .84, h / 2], [0, h / 2]].map(p => new THREE.Vector2(p[0], p[1]));
  const body = new THREE.LatheGeometry(prof, 36); body.scale(1.22, 1, .84); body.translate(0, 0, -r * .15);
  const parts = [body];
  const arch = new THREE.TorusGeometry(r * .55, r * .13, 10, 28, Math.PI); arch.rotateX(Math.PI / 2); arch.translate(0, 0, r * .6); parts.push(arch);
  const spLen = reg === 'L' ? r * 1.15 : reg === 'T' ? r * 1.55 : r * 1.0, tilt = reg === 'L' ? .18 : reg === 'T' ? .8 : .4;
  const sp = new THREE.CylinderGeometry(r * .055, r * .15, spLen, 10); sp.rotateX(Math.PI / 2 + tilt);
  sp.translate(0, -Math.sin(tilt) * spLen / 2, r * 1.12 + Math.cos(tilt) * spLen / 2); parts.push(sp);
  const tpLen = reg === 'L' ? r * 1.05 : reg === 'T' ? r * .8 : r * .55, a = reg === 'T' ? .55 : .25;
  for (const s of [-1, 1]) {
    const dir = new THREE.Vector3(s * Math.cos(a), reg === 'T' ? .14 : 0, Math.sin(a)).normalize();
    const tp = new THREE.CylinderGeometry(r * .05, r * .1, tpLen, 8);
    tp.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    tp.translate(s * r * .5 + dir.x * tpLen / 2, dir.y * tpLen / 2, r * .78 + dir.z * tpLen / 2); parts.push(tp);
    for (const yy of [-1, 1]) { const fa = new THREE.SphereGeometry(r * .1, 10, 8); fa.scale(1, 1.3, 1); fa.translate(s * r * .34, yy * h * .44, r * .98); parts.push(fa); }
  }
  return mergeGeometries(parts);
}

/* ================= ABERTURA ================= */
function hero3D(insoleGeo) {
  const stage = document.getElementById('stage'), hero = document.querySelector('.hero');
  const hudBase = document.getElementById('hudBase'), hudEixo = document.getElementById('hudEixo');
  const mobile = () => innerWidth < 981;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(mobile() ? 1.6 : 2, devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.localClippingEnabled = true;
  renderer.setClearColor(INK, 0);
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x041016, .022);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(renderer), .04).texture;
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 300);

  // luz
  scene.add(new THREE.HemisphereLight(0x3d6670, 0x020608, 1.1));
  const key = new THREE.DirectionalLight(0xfff0d8, P('key', 2.3)); key.position.set(10, 16, 18); scene.add(key);
  const fill = new THREE.DirectionalLight(0xbfe9e0, .9); fill.position.set(-12, 4, 14); scene.add(fill);
  const rim = new THREE.DirectionalLight(MINT, 3.4); rim.position.set(-9, 10, -14); scene.add(rim);
  const rim2 = new THREE.PointLight(MINT, 70, 40, 2); rim2.position.set(7, 4, -6); scene.add(rim2);
  const under = new THREE.PointLight(MINT, 0, 18, 2); under.position.set(0, 1.5, 2.5); scene.add(under);
  // contraluz: um halo verde-água atrás da coluna recorta a silhueta
  const hc = document.createElement('canvas'); hc.width = 512; hc.height = 512; const hx = hc.getContext('2d');
  const hg = hx.createRadialGradient(256, 256, 4, 256, 256, 250); hg.addColorStop(0, 'rgba(69,224,194,.55)'); hg.addColorStop(.35, 'rgba(19,164,135,.18)'); hg.addColorStop(1, 'rgba(19,164,135,0)');
  hx.fillStyle = hg; hx.fillRect(0, 0, 512, 512);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(14, 34), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(hc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 }));
  halo.position.set(0, 9, -7); scene.add(halo);

  // chão: grade fina que some nas bordas
  const fc = document.createElement('canvas'); fc.width = fc.height = 1024; const fx = fc.getContext('2d');
  const gr = fx.createRadialGradient(512, 512, 0, 512, 512, 512); gr.addColorStop(0, 'rgba(69,224,194,.22)'); gr.addColorStop(.45, 'rgba(69,224,194,.06)'); gr.addColorStop(1, 'rgba(69,224,194,0)');
  fx.fillStyle = gr; fx.fillRect(0, 0, 1024, 1024);
  fx.globalCompositeOperation = 'destination-in';
  const mask = document.createElement('canvas'); mask.width = mask.height = 1024; const mx = mask.getContext('2d');
  mx.strokeStyle = '#fff'; mx.lineWidth = 1.2; for (let i = 0; i <= 1024; i += 32) { mx.beginPath(); mx.moveTo(i, 0); mx.lineTo(i, 1024); mx.stroke(); mx.beginPath(); mx.moveTo(0, i); mx.lineTo(1024, i); mx.stroke(); }
  mx.fillStyle = 'rgba(255,255,255,.35)'; mx.fillRect(0, 0, 1024, 1024);
  fx.drawImage(mask, 0, 0);
  const floorTex = new THREE.CanvasTexture(fc); floorTex.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -2.4; scene.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.96, 1, 96), new THREE.MeshBasicMaterial({ color: MINT, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = -2.35; scene.add(ring);
  const ring2 = ring.clone(); ring2.material = ring.material.clone(); scene.add(ring2);

  // palmilha
  const clipLocal = new THREE.Plane(new THREE.Vector3(0, -1, 0), -140), clipWorld = new THREE.Plane();
  const knit = knitTexture();
  const topMat = new THREE.MeshPhysicalMaterial({ map: knit, bumpMap: knit, bumpScale: 1.4, roughness: .86, sheen: .7, sheenColor: new THREE.Color(0x9fc9bf), sheenRoughness: .45, clippingPlanes: [clipWorld], side: THREE.DoubleSide, envMapIntensity: .5 });
  const shellMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .32, clearcoat: .7, clearcoatRoughness: .25, clippingPlanes: [clipWorld], side: THREE.DoubleSide, envMapIntensity: .8 });
  const insole = new THREE.Mesh(insoleGeo, [topMat, shellMat]);
  const insoleRoot = new THREE.Group(); insoleRoot.add(insole); scene.add(insoleRoot);
  insole.scale.setScalar(10 / 260);
  insole.rotation.set(-Math.PI / 2, 0, 0);
  insoleRoot.rotation.set(P('irx', .62), P('iry', .9), P('irz', -.1));
  insoleRoot.position.set(P('ix', .4), P('iy', .3), P('iz', 2.6));
  const IY = insoleRoot.position.y, IRY = insoleRoot.rotation.y;
  // projeto (malha de arame) que vira peça impressa
  const ghost = new THREE.Mesh(buildInsole(46, 14), new THREE.MeshBasicMaterial({ color: MINT, wireframe: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  insole.add(ghost);
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(96, 30), new THREE.MeshBasicMaterial({ color: MINT, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
  bar.rotation.x = Math.PI / 2; bar.position.z = 3; insole.add(bar);
  const barLine = new THREE.Mesh(new THREE.BoxGeometry(98, .9, .9), new THREE.MeshBasicMaterial({ color: 0xbffff0, toneMapped: false, transparent: true, opacity: 0 }));
  barLine.position.z = 15; insole.add(barLine);

  // coluna
  const LEV = [];
  for (let i = 0; i < 5; i++) LEV.push({ reg: 'L', r: .95 - .025 * i, h: .62 - .01 * i, gap: .24 });
  for (let i = 0; i < 12; i++) LEV.push({ reg: 'T', r: .82 - .026 * i, h: .54 - .014 * i, gap: .15 });
  for (let i = 0; i < 7; i++) LEV.push({ reg: 'C', r: .48 - .016 * i, h: .3 - .006 * i, gap: .11 });
  const spine = new THREE.Group(); scene.add(spine);
  const boneBase = new THREE.MeshPhysicalMaterial({ color: 0xf2eadb, roughness: .38, clearcoat: .45, clearcoatRoughness: .35, sheen: .3, sheenColor: new THREE.Color(0xfff6e6), envMapIntensity: .7, emissive: MINT, emissiveIntensity: 0 });
  const discBase = new THREE.MeshPhysicalMaterial({ color: 0x0f5c52, roughness: .25, transparent: true, opacity: .92, emissive: MINT, emissiveIntensity: 0 });
  let y = 4.75; const N = LEV.length, V = [];
  for (let i = 0; i < N; i++) {
    const L = LEV[i];
    const n = i / (N - 1);
    const m = new THREE.Mesh(vertebra(L.r, L.h, L.reg), boneBase.clone());
    spine.add(m);
    const ay = y + L.h / 2;
    const az = .42 * Math.sin(Math.PI * 2 * n - .35) - .1;
    const mis = {
      x: 1.35 * Math.sin(Math.PI * 2 * (n * .92 + .04)) * (.6 + .5 * n) + (rnd() - .5) * .25,
      y: .5 + i * .085 + (rnd() - .5) * .14,
      z: (rnd() - .5) * .5,
      rx: (rnd() - .5) * .5, ry: (rnd() - .5) * .9,
      rz: -.42 * Math.cos(Math.PI * 2 * (n * .92 + .04)) + (rnd() - .5) * .3
    };
    let disc = null;
    if (i < N - 1) {
      disc = new THREE.Mesh(new THREE.CylinderGeometry(L.r * 1.02, L.r * 1.02, L.gap * .72, 36), discBase.clone());
      disc.geometry.scale(1.22, 1, .84); disc.geometry.translate(0, 0, -L.r * .15);
      spine.add(disc);
    }
    V.push({ m, disc, ay, az, mis, h: L.h, gap: L.gap, lock: 0 });
    y += L.h + L.gap;
  }
  const spineTop = y;
  const sacrum = new THREE.Mesh(new THREE.CylinderGeometry(1.25, .32, 2.5, 30, 1), boneBase.clone());
  sacrum.geometry.scale(1, 1, .46); sacrum.position.set(0, 3.3, .1); sacrum.rotation.x = -.28; spine.add(sacrum);
  const coccyx = new THREE.Mesh(new THREE.ConeGeometry(.22, .7, 16), boneBase.clone()); coccyx.rotation.x = Math.PI - .5; coccyx.position.set(0, 1.85, .45); spine.add(coccyx);
  const sacMis = { x: .35, rz: .12, y: .3 };

  // eixo
  const beamBottom = -2.3, beamH = spineTop + 1.6 - beamBottom;
  const beamMat = new THREE.MeshBasicMaterial({ color: MINT, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, 1, 8, 1, true), beamMat);
  const glowMat = new THREE.MeshBasicMaterial({ color: MINT, transparent: true, opacity: .07, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, 1, 16, 1, true), glowMat);
  scene.add(beam, glow);
  const pulse = new THREE.Mesh(new THREE.SphereGeometry(.14, 16, 12), new THREE.MeshBasicMaterial({ color: 0xd8fff6, transparent: true, opacity: 0, toneMapped: false }));
  scene.add(pulse);

  // partículas subindo pelo eixo
  const PN = mobile() ? 260 : 520, pp = new Float32Array(PN * 3), ps = new Float32Array(PN);
  for (let i = 0; i < PN; i++) { const a = rnd() * Math.PI * 2, r = .3 + Math.pow(rnd(), 1.6) * 7; pp[i * 3] = Math.cos(a) * r; pp[i * 3 + 1] = beamBottom + rnd() * (beamH + 2); pp[i * 3 + 2] = Math.sin(a) * r; ps[i] = .2 + rnd() * .8; }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: MINT, size: .06, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  scene.add(pts);

  // pós-processamento
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .35, .5, .9);
  composer.addPass(bloom); composer.addPass(new OutputPass());

  // enquadramento: desktop à direita do texto; celular entre o título e os botões
  const h1 = hero.querySelector('h1'), ctas = hero.querySelector('.ctas');
  let W = 1, H = 1, FIT = { d: 40, ty: 8.4 };
  function resize() {
    W = stage.clientWidth; H = stage.clientHeight;
    renderer.setSize(W, H, false); composer.setSize(W, H);
    bloom.resolution.set(W / 2, H / 2);
    const hr = hero.getBoundingClientRect();
    let top, bot, cx;
    if (mobile()) { top = h1.getBoundingClientRect().bottom - hr.top + 6; bot = ctas.getBoundingClientRect().top - hr.top - 8; cx = W / 2; }
    else { top = 40; bot = H * 1.02; cx = W * P('cx', .66); }
    const worldH = P('wh', mobile() ? 19 : 17.5), f = Math.max(.25, (bot - top) / H);
    camera.aspect = W / H;
    FIT.d = worldH / (f * 2 * Math.tan(camera.fov * Math.PI / 360));
    camera.setViewOffset(W, H, W / 2 - cx, H / 2 - (top + bot) / 2, W, H);
    camera.updateProjectionMatrix();
  }
  resize(); addEventListener('resize', resize);
  if (document.fonts) document.fonts.ready.then(resize);

  // interação
  let speed = 1, mxp = 0, myp = 0, mxs = 0, mys = 0, visible = true;
  const hurry = () => { if (clock < 3.4) speed = 3.2; };
  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(ev => addEventListener(ev, hurry, { passive: true, once: true }));
  addEventListener('pointermove', e => { mxp = e.clientX / innerWidth - .5; myp = e.clientY / innerHeight - .5; }, { passive: true });
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0 }).observe(hero);

  let clock = 0, last = performance.now(), hudStep = 0;
  const target = new THREE.Vector3();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    const s = window.__heroScroll || 0;
    if (!visible || s >= 1) return;
    clock += dt * speed; if (FREEZE !== null) clock = FREEZE; const c = clock, t = now / 1000;
    halo.material.opacity = sm(1.2, 2.6, c) * (1 - .6 * s);

    // 1. projeto em arame e impressão camada por camada (calcanhar → dedos)
    ghost.material.opacity = .28 * eo(c / .4) * (1 - sm(.9, 1.6, c));
    const pr = eio((c - .25) / 1.15);
    const cut = -135 + 272 * pr;
    clipLocal.constant = cut; insole.updateMatrixWorld(); clipWorld.copy(clipLocal).applyMatrix4(insole.matrixWorld);
    bar.position.y = barLine.position.y = cut;
    const barOn = pr > 0 && pr < 1 ? 1 : 0;
    bar.material.opacity = .16 * barOn; barLine.material.opacity = barOn;

    // 2. impacto: anel no chão, luz por baixo, eixo sobe
    const sh = (c - 1.35) / 1.3;
    ring.material.opacity = sh > 0 && sh < 1 ? (1 - sh) * .9 : 0; ring.scale.setScalar(.6 + 17 * eo(sh));
    const sh2 = (c - 1.55) / 1.6;
    ring2.material.opacity = sh2 > 0 && sh2 < 1 ? (1 - sh2) * .5 : 0; ring2.scale.setScalar(.6 + 22 * eo(sh2));
    under.intensity = 40 * Math.exp(-Math.pow((c - 1.45) / .35, 2)) + 6 * sm(1.4, 2.2, c);
    const bm = eo((c - 1.3) / .55);
    beam.scale.y = glow.scale.y = Math.max(.001, beamH * bm);
    beam.position.y = glow.position.y = beamBottom + beamH * bm / 2;
    beamMat.opacity = .95 * bm; glowMat.opacity = .07 * bm + .05 * Math.exp(-Math.pow((c - 1.6) / .3, 2));

    // 3. as vértebras se encaixam de baixo para cima, no ritmo do pulso
    let pulseY = -99, pulseA = 0;
    const lockStart = 1.45, lockStep = .045;
    const pc = (c - lockStart) / (lockStep * N + .2);
    if (pc > 0 && pc < 1) { pulseY = 3 + (spineTop - 3) * pc; pulseA = 1; }
    const idle = c > 3.6 ? ((c - 3.6) % 6.5) / 2.2 : -1;
    if (idle >= 0 && idle < 1) { pulseY = beamBottom + (beamH) * eio(idle); pulseA = Math.sin(Math.PI * idle); }
    pulse.position.set(0, pulseY, 0); pulse.material.opacity = pulseA;
    const ex = s;
    for (let i = 0; i < N; i++) {
      const v = V[i], ti = lockStart + i * lockStep;
      const k = back((c - ti) / .6), kk = clamp((c - ti) / .6);
      const fl = Math.exp(-Math.pow((c - ti - .32) / .16, 2));
      const ip = idle >= 0 ? Math.exp(-Math.pow((v.ay - pulseY) / .7, 2)) * pulseA : 0;
      const a = 1 - k, mm = v.mis, br = Math.sin(t * .9 + i * .35) * .012;
      v.m.position.set(mm.x * a + Math.sin(i * 1.7) * .5 * ex, v.ay + mm.y * a + br + i * .2 * ex, v.az + mm.z * a + .4 * ex * Math.cos(i));
      v.m.rotation.set(mm.rx * a, mm.ry * a + ex * (i % 2 ? .7 : -.7), mm.rz * a);
      v.m.material.emissiveIntensity = .55 * fl + .25 * ip;
      v.lock = kk;
      if (v.disc) {
        const n2 = V[i + 1], a2 = 1 - back((c - ti - lockStep) / .6);
        const dy = v.ay + v.h / 2 + v.gap / 2;
        v.disc.position.set((mm.x * a + n2.mis.x * a2) / 2 + Math.sin(i * 1.7 + .8) * .5 * ex, dy + (mm.y * a + n2.mis.y * a2) / 2 + br + (i + .5) * .2 * ex, (v.az + n2.az) / 2 + (mm.z * a + n2.mis.z * a2) / 2);
        v.disc.rotation.set((mm.rx * a + n2.mis.rx * a2) / 2, (mm.ry * a + n2.mis.ry * a2) / 2, (mm.rz * a + n2.mis.rz * a2) / 2);
        const on = sm(.55, 1, clamp((c - ti - lockStep) / .6));
        v.disc.material.emissiveIntensity = 2.2 * fl + .55 * on + 1.4 * ip;
        v.disc.scale.setScalar(.75 + .25 * on);
      }
    }
    const ks = back((c - 1.35) / .6), as = 1 - ks;
    sacrum.position.x = sacMis.x * as; sacrum.position.y = 3.3 + sacMis.y * as; sacrum.rotation.z = sacMis.rz * as;
    coccyx.position.x = sacMis.x * as * 1.1;

    // partículas
    pts.material.opacity = .55 * sm(1.4, 2.4, c);
    const pa = pg.attributes.position.array;
    for (let i = 0; i < PN; i++) { pa[i * 3 + 1] += dt * ps[i] * .6; if (pa[i * 3 + 1] > beamBottom + beamH + 2) pa[i * 3 + 1] = beamBottom; }
    pg.attributes.position.needsUpdate = true;

    // palmilha flutua
    insoleRoot.position.y = IY + Math.sin(t * .8) * .08 * sm(2.5, 3.5, c) + ex * -1.5;
    insoleRoot.rotation.y = IRY + Math.sin(t * .35) * .05 + ex * .8;

    // câmera: começa perto da palmilha e sobe até enquadrar tudo; na rolagem sobe pela coluna
    mxs += (mxp - mxs) * .05; mys += (myp - mys) * .05;
    const e = eio(c / 3.0);
    const yaw = lerp(1.1, P('yaw', .5), e) + .07 * Math.sin(t * .15) + mxs * .14 + ex * .9;
    const pitch = lerp(.26, P('pitch', -.03), e) - mys * .06 + ex * .05;
    const dist = lerp(FIT.d * .42, FIT.d, e) * (1 - .3 * ex);
    target.set(0, lerp(.8, P('ty', 7.4), e) + ex * 6.5, 0);
    camera.position.set(target.x + dist * Math.sin(yaw) * Math.cos(pitch), target.y + dist * Math.sin(pitch), target.z + dist * Math.cos(yaw) * Math.cos(pitch));
    camera.lookAt(target);
    renderer.toneMappingExposure = 1.05 * (1 - .55 * ex);
    bloom.strength = .32 + .55 * Math.exp(-Math.pow((c - 1.5) / .3, 2)) + .1 * sm(2.4, 3.2, c);

    if (hudStep === 0 && c > 1.2) { hudBase.textContent = 'palmilha AXIS'; hudStep = 1; }
    if (hudStep === 1 && c > 2.9) { hudEixo.textContent = 'alinhado'; hudStep = 2; }
    composer.render();
  }
  requestAnimationFrame(t => { last = t; frame(t); });
  return insoleGeo;
}

/* ================= CARD "PROJETO 3D" ================= */
function scan3D(geo) {
  const box = document.getElementById('scanStage'), card = document.getElementById('scanCard');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  box.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, .1, 100);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMode: { value: 0 }, uScan: { value: -1 } },
    vertexShader: `attribute float aLoad; attribute float aZ; varying float vL; varying float vZ; varying float vU; varying vec3 vN; varying vec3 vV;
      void main(){ vL=aLoad; vZ=aZ; vU=uv.y; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform float uMode; uniform float uScan; varying float vL; varying float vZ; varying float vU; varying vec3 vN; varying vec3 vV;
      vec3 ramp(float l){ vec3 a=vec3(.04,.22,.22), b=vec3(.075,.643,.529), c=vec3(.27,.88,.76), d=vec3(.93,.89,.81);
        return l<.45? mix(a,b,l/.45) : l<.75? mix(b,c,(l-.45)/.3) : mix(c,d,(l-.75)/.25); }
      void main(){ float rim=pow(1.-abs(dot(vN,vV)),2.2);
        float f=fract(vZ*18.); float ln=1.-smoothstep(0.,.09,min(f,1.-f));
        float g=fract(vU*46.); float lg=1.-smoothstep(0.,.05,min(g,1.-g));
        vec3 base=vec3(.012,.05,.065);
        vec3 contour=base+vec3(.27,.88,.76)*(ln*.85+lg*.18)+vec3(.27,.88,.76)*rim*.55;
        vec3 heat=ramp(vL)*(.55+.45*vL)+rim*.12;
        vec3 col=mix(contour,heat,uMode);
        float sb=exp(-pow((vU-uScan)/.018,2.));
        col+=vec3(.6,1.,.92)*sb*(1.-uMode);
        gl_FragColor=vec4(col,1.); }`,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.scale.setScalar(10 / 260); mesh.rotation.x = -Math.PI / 2;
  const root = new THREE.Group(); root.add(mesh); scene.add(root);
  let mode = 0, mt = 0, yaw = -.7, drag = null, vis = false, last = performance.now();
  card.querySelectorAll('.scan-ui button').forEach(b => b.addEventListener('click', () => { mode = +b.dataset.mode; card.querySelectorAll('.scan-ui button').forEach(x => x.classList.toggle('on', x === b)); }));
  card.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; drag = { x: e.clientX, y: yaw }; });
  addEventListener('pointermove', e => { if (drag) yaw = drag.y + (e.clientX - drag.x) * .01; });
  addEventListener('pointerup', () => { drag = null; });
  new IntersectionObserver(es => { vis = es[0].isIntersecting; }).observe(card);
  function size() { const w = box.clientWidth, h = box.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  size(); addEventListener('resize', size);
  const up0 = new THREE.Vector3(0, 1, 0), up1 = new THREE.Vector3(0, 0, -1);
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!vis) return;
    mt += (mode - mt) * Math.min(1, dt * 4);
    if (!drag) yaw += dt * .25 * (1 - mt);
    root.rotation.y = yaw * (1 - mt) + Math.round(yaw / (Math.PI * 2)) * Math.PI * 2 * mt;
    const sc = ((now / 1000) % 3.4) / 2.8; mat.uniforms.uScan.value = sc > 1.05 ? -1 : sc; mat.uniforms.uMode.value = mt;
    camera.position.set(0, lerp(6.4, 25, mt), lerp(13.5, .001, mt));
    camera.up.copy(up0).lerp(up1, mt).normalize();
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

// a abertura usa o vídeo; se ele não existir ou falhar, cai para a cena 3D
if (webglOk()) {
  try {
    const g = buildInsole(150, 44);
    scan3D(g);
    const hv = document.getElementById('heroVideo');
    let started = false;
    const go3D = () => { if (started) return; started = true; document.getElementById('heroVideo')?.remove(); hero3D(g); };
    if (!hv || !hv.isConnected) go3D();
    else { hv.addEventListener('error', go3D); if (hv.error) go3D(); }
  } catch (e) { console.error(e); document.documentElement.classList.add('no3d'); }
} else document.documentElement.classList.add('no3d');
