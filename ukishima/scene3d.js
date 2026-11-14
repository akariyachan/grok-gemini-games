import * as THREE from 'three';
import { NIGHT_DURATION } from './gameLogic.js';

function createGlowTexture(innerColor, midColor) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  grad.addColorStop(0, innerColor);
  grad.addColorStop(0.38, midColor);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSunDiskTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const grad = ctx.createRadialGradient(cx, cx, 4, cx, cx, cx);
  grad.addColorStop(0, 'rgba(255, 250, 224, 1)');
  grad.addColorStop(0.32, 'rgba(255, 224, 120, 0.98)');
  grad.addColorStop(0.45, 'rgba(255, 166, 62, 0.86)');
  grad.addColorStop(0.62, 'rgba(255, 118, 42, 0.24)');
  grad.addColorStop(1, 'rgba(255, 90, 20, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSunRaysTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  ctx.translate(cx, cx);
  const rayCount = 12;
  for (let i = 0; i < rayCount; i++) {
    ctx.save();
    ctx.rotate((i / rayCount) * Math.PI * 2);
    const width = i % 2 === 0 ? 0.14 : 0.08;
    const len = i % 2 === 0 ? cx * 0.98 : cx * 0.82;
    const grad = ctx.createRadialGradient(0, 0, cx * 0.12, 0, 0, len);
    grad.addColorStop(0, 'rgba(255, 235, 155, 0.52)');
    grad.addColorStop(0.5, 'rgba(255, 178, 72, 0.22)');
    grad.addColorStop(1, 'rgba(255, 130, 40, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, len, -width, width);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createProgressSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.4, 1.4, 1);
  sprite.renderOrder = 20;
  sprite.userData = { canvas, ctx, tex, lastBucket: -1 };
  return sprite;
}

function updateProgressSprite(sprite, progress) {
  const bucket = Math.floor(progress * 40);
  if (bucket === sprite.userData.lastBucket) return;
  sprite.userData.lastBucket = bucket;

  const { canvas, ctx, tex } = sprite.userData;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const r = 32;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.beginPath();
  ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10, 15, 34, 0.78)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 8;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, progress));
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.fillStyle = '#fff8e1';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.floor(progress * 100)}%`, cx, cy + 1);

  tex.needsUpdate = true;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
}

export class Scene3D {
  constructor(container, onTap) {
    this.container = container;
    this.onTap = onTap;

    this.scene = new THREE.Scene();
    this.bgColor = new THREE.Color(0x0c1633);
    this.scene.background = this.bgColor;
    this.scene.fog = new THREE.FogExp2(0x0c1633, 0.0068);

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    const aspect = w / Math.max(1, h);

    this.camera = new THREE.PerspectiveCamera(aspect < 0.75 ? 54 : 46, aspect, 0.9, 260);
    this.quality = 'high';
    this.islandPulses = new Map();

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    container.appendChild(this.renderer.domElement);

    this.target = new THREE.Vector3(0, 0.2, -0.8);
    const initRadius = aspect < 0.75 ? 26 : 23;
    this.orbit = {
      theta: 0.32,
      phi: 0.86,
      radius: initRadius,
      targetTheta: 0.32,
      targetPhi: 0.86,
      targetRadius: initRadius,
    };
    this._dawnCamStart = null;
    this._updateCameraPosition();

    // Shared textures
    this.warmGlowTex = createGlowTexture('rgba(255, 242, 185, 0.98)', 'rgba(255, 175, 50, 0.42)');
    this.groundGlowTex = createGlowTexture('rgba(255, 224, 140, 0.65)', 'rgba(255, 168, 48, 0.22)');
    this.cyanGlowTex = createGlowTexture('rgba(200, 255, 255, 0.95)', 'rgba(80, 235, 235, 0.4)');
    this.sunGlowTex = createSunDiskTexture();
    this.sunRaysTex = createSunRaysTexture();

    // Lightweight Lights
    this.hemiLight = new THREE.HemisphereLight(0x8faeff, 0x22294a, 1.25);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xdceaff, 1.05);
    this.dirLight.position.set(22, 36, -20);
    this.scene.add(this.dirLight);

    // World groups
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);

    this.islandsGroup = new THREE.Group();
    this.bridgesGroup = new THREE.Group();
    this.routesGroup = new THREE.Group();
    this.buildingsGroup = new THREE.Group();
    this.shipsGroup = new THREE.Group();
    this.previewGroup = new THREE.Group();
    this.skyConstellationGroup = new THREE.Group();
    this.loopPulseGroup = new THREE.Group();
    this.worldGroup.add(
      this.islandsGroup,
      this.bridgesGroup,
      this.routesGroup,
      this.buildingsGroup,
      this.shipsGroup,
      this.previewGroup,
      this.skyConstellationGroup,
      this.loopPulseGroup
    );

    this._lastPreviewKey = '';
    this._lastConstellationKey = '';
    this.activeLoopPulses = [];
    this._tmpGlowPos = new THREE.Vector3();

    this.islandVisuals = new Map();
    this.bridgeVisuals = new Map();
    this.routeVisuals = new Map();
    this.buildingVisuals = new Map();
    this.shipVisuals = new Map();
    this.hitMeshes = [];

    this._buildSkyAndClouds();
    this._setupInput();

    this._resizeHandler = () => this.resize();
    window.addEventListener('resize', this._resizeHandler);
  }

  _buildSkyAndClouds() {
    // グラデーションスカイドーム（東の空の夜明けヒント＆日の出の橙〜薄桃〜水色表現）
    const skyGeo = new THREE.SphereGeometry(155, 24, 16);
    this.skyUniforms = {
      uZenithColor: { value: new THREE.Color(0x070e24) },
      uMidColor: { value: new THREE.Color(0x132046) },
      uHorizonColor: { value: new THREE.Color(0x1d2952) },
      uEastColor: { value: new THREE.Color(0xff9f68) },
      uEastIntensity: { value: 0.0 },
      uSunDir: { value: new THREE.Vector3(0, 0.14, -1).normalize() },
    };
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: this.skyUniforms,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uZenithColor;
        uniform vec3 uMidColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uEastColor;
        uniform float uEastIntensity;
        uniform vec3 uSunDir;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 base = mix(uHorizonColor, uMidColor, smoothstep(-0.02, 0.22, h));
          base = mix(base, uZenithColor, smoothstep(0.18, 0.52, h));
          float eastDot = max(0.0, dot(normalize(vec3(vDir.x, max(vDir.y, -0.05), vDir.z)), uSunDir));
          float horizonBand = 1.0 - smoothstep(0.0, 0.42, abs(h - 0.06));
          float eastGlow = pow(eastDot, 3.5) * horizonBand * uEastIntensity;
          vec3 col = mix(base, uEastColor, clamp(eastGlow, 0.0, 0.85));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyDome);

    // Stars
    const starCount = 380;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(0.12 + 0.88 * v);
      const r = 92 + Math.random() * 14;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) - 4;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xeef4ff,
      size: 0.8,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.scene.add(this.stars);

    // Moon (in the west-northwest sky, opposite/aside from east sunrise)
    const moonGeo = new THREE.SphereGeometry(2.6, 16, 12);
    this.moonMat = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
    this.moon = new THREE.Mesh(moonGeo, this.moonMat);
    this.moon.position.set(-34, 34, -46);
    this.moonHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.warmGlowTex,
        color: 0xdce8ff,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.moonHalo.scale.set(15, 15, 1);
    this.moon.add(this.moonHalo);
    this.scene.add(this.moon);

    // Rising Sun (on the East horizon: z = -68, centered when camera swings toward theta=0)
    this.sunGroup = new THREE.Group();
    this.sunCore = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.sunGlowTex,
        transparent: true,
        opacity: 1,
        blending: THREE.NormalBlending,
        depthWrite: false,
      })
    );
    this.sunCore.scale.set(15.5, 15.5, 1);

    this.sunHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.sunGlowTex,
        color: 0xff9f45,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.sunHalo.scale.set(34, 34, 1);

    this.sunRays = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.sunRaysTex,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.sunRays.scale.set(46, 46, 1);

    this.sunGroup.add(this.sunHalo, this.sunRays, this.sunCore);
    this.sunGroup.position.set(0, -14, -68);
    this.sunGroup.visible = false;
    this.scene.add(this.sunGroup);

    // Golden rim glow along the sea of clouds at dawn
    this.cloudHorizonGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.sunGlowTex,
        color: 0xffa840,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.cloudHorizonGlow.position.set(0, -8.2, -44);
    this.cloudHorizonGlow.scale.set(86, 15, 1);
    this.scene.add(this.cloudHorizonGlow);

    // Sea of Clouds
    this.clouds = [];
    this.cloudMat = new THREE.MeshLambertMaterial({
      color: 0x2a3966,
      emissive: 0x101836,
      transparent: true,
      opacity: 0.76,
      flatShading: true,
    });
    const puffGeo = new THREE.IcosahedronGeometry(1, 1);

    for (let i = 0; i < 30; i++) {
      const cluster = new THREE.Group();
      const puffs = 2 + (i % 3);
      for (let p = 0; p < puffs; p++) {
        const m = new THREE.Mesh(puffGeo, this.cloudMat);
        const s = 3.2 + Math.random() * 4.4;
        m.scale.set(s * 1.4, s * 0.36, s * 1.1);
        m.position.set((p - 1) * 2.8, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 2.2);
        cluster.add(m);
      }
      const angle = (i / 30) * Math.PI * 2 + Math.random() * 0.3;
      const dist = 6 + Math.random() * 42;
      cluster.position.set(
        Math.cos(angle) * dist,
        -6.5 - Math.random() * 4.5,
        Math.sin(angle) * dist
      );
      cluster.userData = {
        speed: 0.35 + Math.random() * 0.45,
        baseY: cluster.position.y,
        phase: Math.random() * Math.PI * 2,
      };
      this.scene.add(cluster);
      this.clouds.push(cluster);
    }

    const mistGeo = new THREE.CircleGeometry(88, 24);
    mistGeo.rotateX(-Math.PI / 2);
    this.mistMat = new THREE.MeshBasicMaterial({
      color: 0x182447,
      transparent: true,
      opacity: 0.8,
    });
    const mistPlane = new THREE.Mesh(mistGeo, this.mistMat);
    mistPlane.position.y = -11.5;
    this.scene.add(mistPlane);
  }

  _setupInput() {
    const dom = this.renderer.domElement;
    const pointers = new Map();
    let dragMode = 'none';
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let movedDist = 0;
    let pinchLastDist = 0;
    let tapCandidate = false;

    const TAP_THRESHOLD = 10;

    dom.addEventListener('pointerdown', (e) => {
      try { dom.setPointerCapture?.(e.pointerId); } catch {}
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 1) {
        dragMode = 'orbit';
        startX = e.clientX;
        startY = e.clientY;
        lastX = e.clientX;
        lastY = e.clientY;
        movedDist = 0;
        tapCandidate = true;
      } else if (pointers.size === 2) {
        dragMode = 'pinch';
        tapCandidate = false;
        const pts = [...pointers.values()];
        pinchLastDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
    });

    dom.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 1 && dragMode === 'orbit') {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        movedDist = Math.max(movedDist, Math.hypot(e.clientX - startX, e.clientY - startY));

        if (movedDist > TAP_THRESHOLD) {
          tapCandidate = false;
        }

        this.orbit.targetTheta -= dx * 0.0075;
        this.orbit.targetPhi = Math.max(
          0.32,
          Math.min(1.32, this.orbit.targetPhi - dy * 0.0065)
        );
      } else if (pointers.size === 2 && dragMode === 'pinch') {
        const pts = [...pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const delta = dist - pinchLastDist;
        pinchLastDist = dist;
        this.orbit.targetRadius = Math.max(
          18,
          Math.min(68, this.orbit.targetRadius - delta * 0.09)
        );
      }
    });

    const onPointerEnd = (e) => {
      if (!pointers.has(e.pointerId)) return;
      const wasTap = tapCandidate && pointers.size === 1 && dragMode === 'orbit';
      const tapX = e.clientX;
      const tapY = e.clientY;
      pointers.delete(e.pointerId);

      if (pointers.size === 1) {
        const rem = [...pointers.values()][0];
        lastX = rem.x;
        lastY = rem.y;
        dragMode = 'orbit';
        tapCandidate = false;
      } else if (pointers.size === 0) {
        dragMode = 'none';
        if (wasTap) {
          this._handleTap(tapX, tapY);
        }
        tapCandidate = false;
      }
    };

    dom.addEventListener('pointerup', onPointerEnd);
    dom.addEventListener('pointercancel', onPointerEnd);

    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.orbit.targetRadius = Math.max(
          18,
          Math.min(68, this.orbit.targetRadius + e.deltaY * 0.025)
        );
      },
      { passive: false }
    );
  }

  _handleTap(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera);

    const hits = raycaster.intersectObjects(this.hitMeshes, false);
    if (hits.length === 0) {
      this.onTap(null);
      return;
    }

    let chosen = hits[0].object.userData;
    for (const h of hits) {
      if (h.object.userData.kind === 'slot') {
        chosen = h.object.userData;
        break;
      }
    }
    this.onTap(chosen);
  }

  _updateCameraPosition() {
    const { theta, phi, radius } = this.orbit;
    const sinPhi = Math.sin(phi);
    this.camera.position.set(
      this.target.x + radius * sinPhi * Math.sin(theta),
      this.target.y + radius * Math.cos(phi),
      this.target.z + radius * sinPhi * Math.cos(theta)
    );
    this.camera.lookAt(this.target);
  }

  resetCameraForNewGame() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const aspect = w / Math.max(1, h);
    const initRadius = aspect < 0.75 ? 26 : 23;
    this._dawnCamStart = null;
    this.target.set(0, 0.2, -0.8);
    this.orbit.theta = 0.32;
    this.orbit.phi = 0.86;
    this.orbit.radius = initRadius;
    this.orbit.targetTheta = 0.32;
    this.orbit.targetPhi = 0.86;
    this.orbit.targetRadius = initRadius;
    this._updateCameraPosition();
  }

  focusOn(x, y, z, radius = 22) {
    const safeRadius = Math.max(18, Math.min(68, radius));
    this.target.set(x, y + 0.2, z);
    this.orbit.radius = safeRadius;
    this.orbit.targetRadius = safeRadius;
    this._updateCameraPosition();
  }

  setQuality(quality) {
    const next = quality === 'low' ? 'low' : 'high';
    if (this.quality === next) return;
    this.quality = next;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(
      next === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.renderer.setSize(w, h);
  }

  triggerIslandPulse(islandId, timeSec = performance.now() / 1000) {
    this.islandPulses.set(islandId, timeSec);
  }

  triggerLoopPulse(cycleIslandIds, timeSec = performance.now() / 1000) {
    if (!Array.isArray(cycleIslandIds) || cycleIslandIds.length < 3) return;
    const orb = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.warmGlowTex,
        color: 0xfff0a0,
        transparent: true,
        opacity: 0.98,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    orb.scale.set(2.4, 2.4, 1);
    this.loopPulseGroup.add(orb);
    this.activeLoopPulses.push({
      islandIds: [...cycleIslandIds],
      startTime: timeSec,
      duration: 2.8,
      orb,
    });
  }

  updateBridgePreview(sim, originId, targetId, isHigh, blockedRoutes = []) {
    const key =
      originId === null || targetId === null
        ? ''
        : `${originId}->${targetId}:${isHigh ? 1 : 0}:${blockedRoutes.map((b) => `${b.fromIsland.id}-${b.toIsland.id}`).join(',')}`;
    if (key === this._lastPreviewKey) return;
    this._lastPreviewKey = key;

    while (this.previewGroup.children.length > 0) {
      this.previewGroup.remove(this.previewGroup.children[0]);
    }
    if (!key) return;

    const a = sim.getIsland(originId);
    const b = sim.getIsland(targetId);
    if (!a || !b) return;

    // 橋プレビュー点線
    const bridgePts = [];
    const peak = isHigh ? 2.1 : 0.75;
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      bridgePts.push(
        new THREE.Vector3(
          a.x + (b.x - a.x) * t,
          a.y + (b.y - a.y) * t + Math.sin(t * Math.PI) * peak + 0.35,
          a.z + (b.z - a.z) * t
        )
      );
    }
    const bridgeGeo = new THREE.BufferGeometry().setFromPoints(bridgePts);
    const bridgeMat = new THREE.LineDashedMaterial({
      color: blockedRoutes.length > 0 ? 0xffd166 : 0x64dfdf,
      dashSize: 0.65,
      gapSize: 0.35,
      transparent: true,
      opacity: 0.95,
    });
    const bridgeLine = new THREE.Line(bridgeGeo, bridgeMat);
    bridgeLine.computeLineDistances();
    this.previewGroup.add(bridgeLine);

    // 交差してふさがれる将来航路の赤い点線プレビュー
    for (const blk of blockedRoutes) {
      const rA = blk.fromIsland;
      const rB = blk.toIsland;
      const routePts = [
        new THREE.Vector3(rA.x, rA.y + 0.35, rA.z),
        new THREE.Vector3(rB.x, rB.y + 0.35, rB.z),
      ];
      const routeGeo = new THREE.BufferGeometry().setFromPoints(routePts);
      const routeMat = new THREE.LineDashedMaterial({
        color: 0xff5252,
        dashSize: 0.85,
        gapSize: 0.45,
        transparent: true,
        opacity: 0.95,
      });
      const routeLine = new THREE.Line(routeGeo, routeMat);
      routeLine.computeLineDistances();
      this.previewGroup.add(routeLine);
    }
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const aspect = w / Math.max(1, h);
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 0.75 ? 54 : 46;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  clearDynamicWorld() {
    for (const g of [
      this.islandsGroup,
      this.bridgesGroup,
      this.routesGroup,
      this.buildingsGroup,
      this.shipsGroup,
      this.previewGroup,
      this.skyConstellationGroup,
      this.loopPulseGroup,
    ]) {
      while (g.children.length > 0) {
        g.remove(g.children[0]);
      }
    }
    this._lastPreviewKey = '';
    this._lastConstellationKey = '';
    this.activeLoopPulses = [];
    this._tmpGlowPos = new THREE.Vector3();
    this.islandVisuals.clear();
    this.bridgeVisuals.clear();
    this.routeVisuals.clear();
    this.buildingVisuals.clear();
    this.shipVisuals.clear();
    this.hitMeshes = [];
  }

  buildIslands(islands) {
    this.clearDynamicWorld();
    const rockMatBase = new THREE.MeshLambertMaterial({
      color: 0x54506a,
      emissive: 0x16192e,
      flatShading: true,
    });

    for (const isl of islands) {
      const group = new THREE.Group();
      group.position.set(isl.x, isl.y, isl.z);

      const rockGeo = new THREE.ConeGeometry(isl.radius * 0.96, isl.radius * 1.45, 7);
      rockGeo.rotateX(Math.PI);
      const rockMesh = new THREE.Mesh(rockGeo, rockMatBase);
      rockMesh.position.y = -isl.radius * 0.72 - 0.15;
      group.add(rockMesh);

      const subRock = new THREE.Mesh(
        new THREE.ConeGeometry(isl.radius * 0.42, isl.radius * 0.7, 5),
        rockMatBase
      );
      subRock.rotation.x = Math.PI;
      subRock.position.set(isl.radius * 0.35, -isl.radius * 0.6, -isl.radius * 0.2);
      group.add(subRock);

      const topMat = new THREE.MeshLambertMaterial({
        color: isl.connected ? 0x3b7a4f : 0x2d4a4b,
        emissive: isl.connected ? 0x1a3a22 : 0x0e1d26,
        flatShading: true,
      });
      const topGeo = new THREE.CylinderGeometry(isl.radius, isl.radius * 0.94, 0.55, 8);
      const topMesh = new THREE.Mesh(topGeo, topMat);
      topMesh.position.y = 0;
      group.add(topMesh);

      const groundGlow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.groundGlowTex,
          color: 0xffcf70,
          transparent: true,
          opacity: isl.connected ? 0.32 : 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      groundGlow.scale.set(isl.radius * 2.8, isl.radius * 2.8, 1);
      groundGlow.position.y = 0.45;
      group.add(groundGlow);

      const glowSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.warmGlowTex,
          color: 0xffc864,
          transparent: true,
          opacity: isl.connected ? 0.42 : 0.0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      glowSprite.scale.set(isl.radius * 3.4, isl.radius * 3.4, 1);
      glowSprite.position.y = 0.75;
      group.add(glowSprite);

      const ringGeo = new THREE.RingGeometry(isl.radius * 1.07, isl.radius * 1.26, 28);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x64dfdf,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.y = 0.33;
      group.add(ringMesh);

      const hitMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(isl.radius * 1.06, isl.radius * 1.06, 1.4, 10),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitMesh.position.y = 0.25;
      hitMesh.userData = { kind: 'island', islandId: isl.id };
      group.add(hitMesh);
      this.hitMeshes.push(hitMesh);

      let beaconFlame = null;
      if (isl.id === 0) {
        const brazier = new THREE.Mesh(
          new THREE.CylinderGeometry(0.36, 0.48, 0.44, 6),
          new THREE.MeshLambertMaterial({ color: 0x6e6885, flatShading: true })
        );
        brazier.position.y = 0.45;
        group.add(brazier);

        const flameMesh = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.28, 0),
          new THREE.MeshBasicMaterial({ color: 0xffdf78 })
        );
        flameMesh.position.y = 0.84;
        group.add(flameMesh);

        beaconFlame = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: this.warmGlowTex,
            transparent: true,
            opacity: 0.92,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        beaconFlame.scale.set(3.2, 3.2, 1);
        flameMesh.add(beaconFlame);
      }

      const slotVisuals = [];
      for (const slot of isl.slots) {
        const slotGroup = new THREE.Group();
        slotGroup.position.set(slot.localX, 0.31, slot.localZ);

        const markerMat = new THREE.MeshBasicMaterial({
          color: 0x9be7ff,
          transparent: true,
          opacity: isl.connected ? 0.62 : 0.14,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const markerGeo = new THREE.RingGeometry(0.32, 0.45, 18);
        markerGeo.rotateX(-Math.PI / 2);
        const marker = new THREE.Mesh(markerGeo, markerMat);
        slotGroup.add(marker);

        const slotHit = new THREE.Mesh(
          new THREE.CylinderGeometry(0.64, 0.64, 1.0, 8),
          new THREE.MeshBasicMaterial({ visible: false })
        );
        slotHit.position.y = 0.38;
        slotHit.userData = { kind: 'slot', islandId: isl.id, slotIndex: slot.index };
        slotGroup.add(slotHit);
        this.hitMeshes.push(slotHit);

        group.add(slotGroup);
        slotVisuals.push({ slotGroup, marker, markerMat });
      }

      this.islandsGroup.add(group);
      this.islandVisuals.set(isl.id, {
        group,
        topMat,
        groundGlow,
        glowSprite,
        ringMesh,
        ringMat,
        slotVisuals,
        beaconFlame,
        baseY: isl.y,
        bobPhase: isl.id * 0.9,
      });
    }
  }

  _createBuildingMesh(type) {
    const group = new THREE.Group();
    const visualRoot = new THREE.Group();
    visualRoot.scale.setScalar(1.5);
    group.add(visualRoot);

    if (type === 'house') {
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.64, 0.46, 0.58),
        new THREE.MeshLambertMaterial({ color: 0xf2e1c9, flatShading: true })
      );
      base.position.y = 0.23;
      visualRoot.add(base);

      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(0.56, 0.46, 4),
        new THREE.MeshLambertMaterial({ color: 0xc8523f, flatShading: true })
      );
      roof.rotation.y = Math.PI / 4;
      roof.position.y = 0.68;
      visualRoot.add(roof);

      const winMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
      const win1 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.62), winMat);
      win1.position.y = 0.24;
      const win2 = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.18, 0.22), winMat);
      win2.position.y = 0.24;
      visualRoot.add(win1, win2);

      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.warmGlowTex,
          transparent: true,
          opacity: 0.88,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      glow.scale.set(2.4, 2.4, 1);
      glow.position.y = 0.36;
      visualRoot.add(glow);
      group.userData.glow = glow;
      group.userData.glowBaseScale = 2.4;
    } else if (type === 'streetlight') {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.065, 0.88, 6),
        new THREE.MeshLambertMaterial({ color: 0x3b4257, flatShading: true })
      );
      post.position.y = 0.44;
      visualRoot.add(post);

      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xfff099 })
      );
      bulb.position.y = 0.92;
      visualRoot.add(bulb);

      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.warmGlowTex,
          transparent: true,
          opacity: 0.98,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      glow.scale.set(2.8, 2.8, 1);
      glow.position.y = 0.88;
      visualRoot.add(glow);
      group.userData.glow = glow;
      group.userData.glowBaseScale = 2.8;
    } else if (type === 'stall') {
      const counter = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.3, 0.48),
        new THREE.MeshLambertMaterial({ color: 0xa66546, flatShading: true })
      );
      counter.position.y = 0.15;
      visualRoot.add(counter);

      const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(0.82, 0.15, 0.58),
        new THREE.MeshLambertMaterial({ color: 0xe63946, emissive: 0x3b0c10, flatShading: true })
      );
      canopy.position.y = 0.56;
      visualRoot.add(canopy);

      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.16, 0.6),
        new THREE.MeshLambertMaterial({ color: 0xfff3d6, flatShading: true })
      );
      stripe.position.y = 0.56;
      visualRoot.add(stripe);

      const lanternMat = new THREE.MeshBasicMaterial({ color: 0xffc329 });
      for (const sx of [-0.28, 0, 0.28]) {
        const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), lanternMat);
        lantern.position.set(sx, 0.42, 0.28);
        visualRoot.add(lantern);
      }

      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.warmGlowTex,
          transparent: true,
          opacity: 0.92,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      glow.scale.set(2.7, 2.7, 1);
      glow.position.y = 0.44;
      visualRoot.add(glow);
      group.userData.glow = glow;
      group.userData.glowBaseScale = 2.7;
    } else if (type === 'lighthouse') {
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.36, 1.58, 8),
        new THREE.MeshLambertMaterial({ color: 0xf7f4e4, flatShading: true })
      );
      tower.position.y = 0.79;
      visualRoot.add(tower);

      const stripe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.3, 0.38, 8),
        new THREE.MeshLambertMaterial({ color: 0xd93030, flatShading: true })
      );
      stripe.position.y = 0.79;
      visualRoot.add(stripe);

      const lampRoom = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.19, 0.27, 8),
        new THREE.MeshBasicMaterial({ color: 0xfff6be })
      );
      lampRoom.position.y = 1.68;
      visualRoot.add(lampRoom);

      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(0.26, 0.24, 8),
        new THREE.MeshLambertMaterial({ color: 0x2b2d42, flatShading: true })
      );
      cap.position.y = 1.92;
      visualRoot.add(cap);

      const beamPivot = new THREE.Group();
      beamPivot.position.y = 1.68;
      const beamGeo = new THREE.ConeGeometry(0.88, 3.2, 10, 1, true);
      beamGeo.rotateZ(Math.PI / 2);
      beamGeo.translate(1.6, 0, 0);
      const beamMat = new THREE.MeshBasicMaterial({
          color: 0xffea9f,
          transparent: true,
          opacity: 0.22,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
      const beamMesh = new THREE.Mesh(beamGeo, beamMat);
      beamPivot.add(beamMesh);
      visualRoot.add(beamPivot);

      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.warmGlowTex,
          transparent: true,
          opacity: 1.0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      glow.scale.set(3.4, 3.4, 1);
      glow.position.y = 1.68;
      visualRoot.add(glow);

      group.userData.glow = glow;
      group.userData.glowBaseScale = 3.4;
      group.userData.beamPivot = beamPivot;
      group.userData.beamMat = beamMat;
    }

    return group;
  }

  _createBridgeVisual(bridge, islA, islB) {
    const group = new THREE.Group();
    const start = new THREE.Vector3(islA.x, islA.y + 0.3, islA.z);
    const end = new THREE.Vector3(islB.x, islB.y + 0.3, islB.z);
    const dist = start.distanceTo(end);
    const segments = bridge.high ? 16 : 12;
    const peak = bridge.high ? 4.4 : 0.5;

    const plankMeshes = [];
    const plankMat = new THREE.MeshLambertMaterial({
      color: bridge.high ? 0xe6d0b3 : 0xb57c4e,
      emissive: bridge.high ? 0x382b18 : 0x291a0d,
      flatShading: true,
    });
    const railMat = new THREE.MeshLambertMaterial({
      color: bridge.high ? 0xf3e4cd : 0x8d5b34,
      flatShading: true,
    });
    const postMat = new THREE.MeshBasicMaterial({ color: bridge.high ? 0x8ef9f3 : 0xffd166 });

    const width = bridge.high ? 0.92 : 0.78;

    for (let i = 0; i < segments; i++) {
      const t = (i + 0.5) / segments;
      const pos = new THREE.Vector3().lerpVectors(start, end, t);
      pos.y += Math.sin(t * Math.PI) * peak;

      const nextT = Math.min(1, (i + 1) / segments);
      const p2 = new THREE.Vector3().lerpVectors(start, end, nextT);
      p2.y += Math.sin(nextT * Math.PI) * peak;

      const segLen = (dist / segments) * 1.08;
      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(width, 0.18, segLen),
        plankMat
      );
      plank.position.copy(pos);
      plank.lookAt(p2);

      const sideOffset = width * 0.44;
      for (const sx of [-sideOffset, sideOffset]) {
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 0.22, segLen),
          railMat
        );
        rail.position.set(sx, 0.18, 0);
        plank.add(rail);
      }

      if (i % 3 === 1) {
        for (const sx of [-sideOffset, sideOffset]) {
          const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), postMat);
          lantern.position.set(sx, 0.36, 0);
          plank.add(lantern);
        }
      }

      plank.visible = false;
      group.add(plank);
      plankMeshes.push(plank);
    }

    if (bridge.high) {
      for (const t of [0.16, 0.84]) {
        const p = new THREE.Vector3().lerpVectors(start, end, t);
        const h = Math.sin(t * Math.PI) * peak;
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.22, h, 6),
          plankMat
        );
        pillar.position.set(p.x, p.y + h / 2, p.z);
        group.add(pillar);
      }
    }

    // 指でタップしやすい太めの見えないヒットボックス
    const mid = new THREE.Vector3().lerpVectors(start, end, 0.5);
    mid.y += peak * 0.55;
    const hitBox = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, bridge.high ? 3.8 : 2.2, dist * 0.85),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitBox.position.copy(mid);
    hitBox.lookAt(end.x, mid.y, end.z);
    hitBox.userData = { kind: 'bridge', bridgeId: bridge.id };
    group.add(hitBox);
    this.hitMeshes.push(hitBox);

    const particles = [];
    const maxP = 8;
    for (let k = 0; k < maxP; k++) {
      const pSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: bridge.high ? this.cyanGlowTex : this.warmGlowTex,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      pSprite.scale.set(0.85, 0.85, 1);
      pSprite.visible = false;
      group.add(pSprite);
      particles.push({ sprite: pSprite, offset: k / maxP });
    }

    this.bridgesGroup.add(group);
    return {
      group,
      start,
      end,
      peak,
      plankMeshes,
      hitBox,
      particles,
    };
  }

  _createRouteVisual(route, islA, islB) {
    const group = new THREE.Group();
    const start = new THREE.Vector3(islA.x, islA.y + 0.55, islA.z);
    const end = new THREE.Vector3(islB.x, islB.y + 0.55, islB.z);
    const dotCount = Math.max(12, Math.floor(route.distance * 1.8));
    const positions = new Float32Array(dotCount * 3);

    for (let i = 0; i < dotCount; i++) {
      const t = i / (dotCount - 1);
      const p = new THREE.Vector3().lerpVectors(start, end, t);
      p.y += Math.sin(t * Math.PI) * 0.65;
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x7ef7f7,
      size: 0.62,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });
    const dots = new THREE.Points(geo, mat);
    group.add(dots);

    const particles = [];
    const maxP = 7;
    for (let k = 0; k < maxP; k++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.cyanGlowTex,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      s.scale.set(0.95, 0.95, 1);
      s.visible = false;
      group.add(s);
      particles.push({ sprite: s, offset: k / maxP });
    }

    this.routesGroup.add(group);
    return { group, mat, start, end, particles };
  }

  _createShipVisual() {
    const group = new THREE.Group();
    const visualRoot = new THREE.Group();
    visualRoot.scale.setScalar(0.95);
    group.add(visualRoot);

    const hull = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 1.05, 5),
      new THREE.MeshLambertMaterial({ color: 0xb87a4b, emissive: 0x2b180a, flatShading: true })
    );
    hull.rotation.x = Math.PI / 2;
    visualRoot.add(hull);

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.78, 5),
      new THREE.MeshLambertMaterial({ color: 0xebd7ba })
    );
    mast.position.y = 0.38;
    visualRoot.add(mast);

    const sail = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.52, 0.48),
      new THREE.MeshLambertMaterial({ color: 0xfff5d6, emissive: 0x6b4c1e })
    );
    sail.position.set(0, 0.46, 0.04);
    visualRoot.add(sail);

    const lantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe066 })
    );
    lantern.position.set(0, 0.28, -0.38);
    visualRoot.add(lantern);

    // 船上の積み荷アイコン（大きめで見やすい資材箱 / お客オーブ）
    const cargoGroup = new THREE.Group();
    cargoGroup.position.set(0, 1.04, 0);
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.28, 0.32),
      new THREE.MeshBasicMaterial({ color: 0xffcf56 })
    );
    const passenger = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x7ef9f3 })
    );
    const cargoGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.warmGlowTex,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    cargoGlow.scale.set(1.0, 1.0, 1);
    cargoGroup.add(crate, passenger, cargoGlow);
    visualRoot.add(cargoGroup);

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.warmGlowTex,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    glow.scale.set(2.1, 2.1, 1);
    glow.position.y = 0.36;
    visualRoot.add(glow);

    this.shipsGroup.add(group);
    return { group, cargoGroup, crate, passenger, cargoGlow, glow };
  }

  /**
   * カメラに近いグロースプライトが白飛び・画面占有しないよう距離減衰と画面比率上限を適用する
   */
  _attenuateGlowSprite(sprite, wx, wy, wz, baseWorldScale, baseOpacity, maxScreenWFrac = 0.2, parentScale = 1) {
    this._tmpGlowPos.set(wx, wy, wz);
    const d = this.camera.position.distanceTo(this._tmpGlowPos);
    const nearFade = THREE.MathUtils.clamp((d - 8.5) / 11.5, 0, 1);
    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const viewW =
      2 *
      Math.max(1, d) *
      Math.tan(fovRad * 0.5) *
      Math.max(0.38, this.camera.aspect || 0.5);
    const maxWorldScale = viewW * maxScreenWFrac;
    const clampedWorld = Math.min(baseWorldScale, maxWorldScale) * (0.45 + 0.55 * nearFade);
    const localScale = clampedWorld / Math.max(0.01, parentScale);
    sprite.scale.set(localScale, localScale, 1);
    sprite.material.opacity = baseOpacity * nearFade;
    return nearFade;
  }

  syncAndRender(sim, uiState, timeSec) {
    // 1. 空のグラデーション＆残り60秒東の空ヒント＆夜明けの太陽演出
    const nightProgress = Math.max(0, Math.min(1, 1 - sim.timeLeft / NIGHT_DURATION));
    const isDawnOrResult = sim.dawnActive || sim.state === 'dawn' || sim.state === 'result';
    const dawnProg = sim.state === 'result' ? 1 : sim.dawnProgress;

    const zNight = new THREE.Color(0x070e24);
    const mNight = new THREE.Color(0x132046);
    const hNight = new THREE.Color(0x1d2952);

    const zTwilight = new THREE.Color(0x1e1640);
    const mTwilight = new THREE.Color(0x3a245e);
    const hTwilight = new THREE.Color(0x5b3b75);

    const zPreDawn = new THREE.Color(0x313966);
    const mPreDawn = new THREE.Color(0x5e4d82);
    const hPreDawn = new THREE.Color(0x88648c);

    // 朝焼けグラデーション（橙 → 桃 → 水色）
    const zDawn = new THREE.Color(0x6ec3f5);
    const mDawn = new THREE.Color(0xf7b0c0);
    const hDawn = new THREE.Color(0xff9b52);

    if (nightProgress < 0.6) {
      const k = nightProgress / 0.6;
      this.skyUniforms.uZenithColor.value.copy(zNight).lerp(zTwilight, k);
      this.skyUniforms.uMidColor.value.copy(mNight).lerp(mTwilight, k);
      this.skyUniforms.uHorizonColor.value.copy(hNight).lerp(hTwilight, k);
    } else {
      const k = (nightProgress - 0.6) / 0.4;
      this.skyUniforms.uZenithColor.value.copy(zTwilight).lerp(zPreDawn, k);
      this.skyUniforms.uMidColor.value.copy(mTwilight).lerp(mPreDawn, k);
      this.skyUniforms.uHorizonColor.value.copy(hTwilight).lerp(hPreDawn, k);
    }

    // 残り60秒を切ったら東の空がうっすら明るみ始める
    const eastHint = sim.timeLeft < 60 ? Math.min(1, (60 - sim.timeLeft) / 60) * 0.58 : 0;

    if (isDawnOrResult) {
      this.skyUniforms.uZenithColor.value.lerp(zDawn, dawnProg);
      this.skyUniforms.uMidColor.value.lerp(mDawn, dawnProg);
      this.skyUniforms.uHorizonColor.value.lerp(hDawn, dawnProg);
      this.skyUniforms.uEastColor.value.setHex(0xffb86c);
      this.skyUniforms.uEastIntensity.value = Math.max(eastHint, 0.36 + dawnProg * 0.45);

      this.bgColor.copy(this.skyUniforms.uMidColor.value);
      this.sunGroup.visible = true;
      // 雲海の向こう（y=-11）から画面上部〜中央（y=+16）へゆっくり昇る（白飛び抑止のため初動フェード）
      const sunFade = Math.min(1, dawnProg / 0.24);
      this.sunGroup.position.set(0, -11 + easeOutCubic(dawnProg) * 27, -68);
      this.sunCore.material.opacity = 0.25 + sunFade * 0.75;
      this.sunHalo.material.opacity = 0.06 + dawnProg * 0.32;
      this.sunRays.visible = this.quality === 'high';
      this.sunRays.material.rotation = timeSec * 0.14;
      this.sunRays.material.opacity = 0.05 + dawnProg * 0.28;

      this.starMat.opacity = Math.max(0, 0.92 * (1 - dawnProg * 1.4));
      this.moonMat.color.setHex(0xfff6d8).lerp(new THREE.Color(0xd4dcf0), dawnProg);
      this.moonHalo.material.opacity = 0.6 * (1 - dawnProg);

      this.dirLight.color.setHex(0xdceaff).lerp(new THREE.Color(0xffd093), dawnProg);
      this.dirLight.intensity = 1.05 + dawnProg * 0.85;
      this.hemiLight.color.setHex(0x8faeff).lerp(new THREE.Color(0xffd8c2), dawnProg);
      this.hemiLight.intensity = 1.25 + dawnProg * 0.45;

      // 雲海の縁が金色に輝き、朝日に照らされて色づく
      this.cloudMat.color.setHex(0x2a3966).lerp(new THREE.Color(0xffcf9e), dawnProg);
      this.cloudMat.emissive.setHex(0x101836).lerp(new THREE.Color(0xa65422), dawnProg);
      this.mistMat.color.setHex(0x182447).lerp(new THREE.Color(0xf2a57a), dawnProg);
      this.cloudHorizonGlow.material.opacity = dawnProg * 0.28;

      // カメラを2〜3秒かけて少し引きつつ水平寄りに起こして太陽を画面内に収める
      if (sim.state === 'dawn') {
        if (!this._dawnCamStart) {
          const twoPi = Math.PI * 2;
          const nearestZeroTheta = Math.round(this.orbit.theta / twoPi) * twoPi;
          this._dawnCamStart = {
            theta: this.orbit.theta,
            phi: this.orbit.phi,
            radius: this.orbit.radius,
            target: this.target.clone(),
            goalTheta: nearestZeroTheta,
          };
        }
        const camT = easeOutCubic(Math.min(1, dawnProg / 0.68));
        const aspect = this.camera.aspect || 0.5;
        const goalRadius = aspect < 0.75 ? 34 : 29;
        this.orbit.theta =
          this._dawnCamStart.theta + (this._dawnCamStart.goalTheta - this._dawnCamStart.theta) * camT;
        this.orbit.phi = this._dawnCamStart.phi + (1.40 - this._dawnCamStart.phi) * camT;
        this.orbit.radius =
          this._dawnCamStart.radius + (goalRadius - this._dawnCamStart.radius) * camT;
        this.orbit.targetTheta = this.orbit.theta;
        this.orbit.targetPhi = this.orbit.phi;
        this.orbit.targetRadius = this.orbit.radius;
        this.target.lerpVectors(this._dawnCamStart.target, new THREE.Vector3(0, 2.5, -2.0), camT);
      }
    } else {
      this._dawnCamStart = null;
      this.skyUniforms.uEastColor.value.setHex(0xff9a62);
      this.skyUniforms.uEastIntensity.value = eastHint;
      this.bgColor.copy(this.skyUniforms.uHorizonColor.value);
      this.sunGroup.visible = false;
      this.starMat.opacity = 0.92 - nightProgress * 0.22;
      this.moonHalo.material.opacity = 0.6;
      this.dirLight.color.setHex(0xdceaff);
      this.dirLight.intensity = 1.05;
      this.hemiLight.color.setHex(0x8faeff);
      this.hemiLight.intensity = 1.25;
      this.cloudMat.color.setHex(0x2a3966).lerp(new THREE.Color(0x4a3d70), nightProgress);
      this.cloudMat.emissive.setHex(0x101836).lerp(new THREE.Color(0x22193d), nightProgress);
      this.mistMat.color.setHex(0x182447).lerp(new THREE.Color(0x362d59), nightProgress);
      this.cloudHorizonGlow.material.opacity = eastHint * 0.32;
    }
    this.scene.fog.color.copy(this.skyUniforms.uHorizonColor.value);

    for (const cl of this.clouds) {
      cl.position.x += cl.userData.speed * 0.008;
      if (cl.position.x > 46) cl.position.x = -46;
      cl.position.y = cl.userData.baseY + Math.sin(timeSec * 0.4 + cl.userData.phase) * 0.25;
    }

    // グロー距離計算のため先にカメラ位置を更新する
    if (sim.state !== 'dawn') {
      this.orbit.theta += (this.orbit.targetTheta - this.orbit.theta) * 0.16;
      this.orbit.phi += (this.orbit.targetPhi - this.orbit.phi) * 0.16;
      this.orbit.radius += (this.orbit.targetRadius - this.orbit.radius) * 0.16;
    }
    this._updateCameraPosition();

    // 2. 島ごとの状態同期（夜明け時は1島ずつ灯りが消える）
    const isLowQuality = this.quality === 'low';
    const islandDimMap = new Map();
    for (const isl of sim.islands) {
      let dim = 1;
      if (isDawnOrResult) {
        const delay = isl.id * 0.085;
        dim = Math.max(0, Math.min(1, 1 - (dawnProg - delay) / 0.24));
      }
      islandDimMap.set(isl.id, dim);

      const vis = this.islandVisuals.get(isl.id);
      if (!vis) continue;

      const bob = Math.sin(timeSec * 0.8 + vis.bobPhase) * 0.08;
      vis.group.position.y = vis.baseY + bob;

      const pulseStart = this.islandPulses.get(isl.id);
      let pulse = 0;
      if (pulseStart !== undefined) {
        const elapsed = timeSec - pulseStart;
        if (elapsed >= 1.1) {
          this.islandPulses.delete(isl.id);
        } else if (elapsed >= 0) {
          pulse = Math.sin((elapsed / 1.1) * Math.PI);
        }
      }

      if (isl.connected) {
        const warmth = Math.min(1, isl.light / 140);
        vis.topMat.color.setHex(0x3b7a4f).lerp(new THREE.Color(0x64b05e), warmth);
        vis.topMat.emissive.setHex(0x1a3a22).lerp(new THREE.Color(0x3d4d18), warmth * dim);
        if (pulse > 0) {
          vis.topMat.emissive.lerp(new THREE.Color(0xffc952), pulse * 0.65);
        }
        const glowBaseOp = (0.28 + warmth * 0.56 + pulse * 0.35) * dim;
        this._attenuateGlowSprite(
          vis.glowSprite,
          isl.x,
          vis.group.position.y + 0.75,
          isl.z,
          isl.radius * 3.4,
          glowBaseOp,
          0.26,
          1
        );

        const haloScale = isl.radius * (2.5 + warmth * 1.7 + pulse * 1.1);
        const groundOp =
          isLowQuality && isl.id % 2 === 1 ? 0 : (0.22 + warmth * 0.52 + pulse * 0.35) * dim;
        this._attenuateGlowSprite(
          vis.groundGlow,
          isl.x,
          vis.group.position.y + 0.45,
          isl.z,
          haloScale,
          groundOp,
          0.34,
          1
        );
      } else {
        vis.topMat.color.setHex(0x2d4a4b);
        vis.topMat.emissive.setHex(0x0e1d26);
        vis.glowSprite.material.opacity = 0;
        vis.groundGlow.material.opacity = 0;
      }

      if (vis.beaconFlame) {
        const flameOp = (0.85 + Math.sin(timeSec * 6) * 0.14) * dim;
        this._attenuateGlowSprite(
          vis.beaconFlame,
          isl.x,
          vis.group.position.y + 0.84,
          isl.z,
          3.2,
          flameOp,
          0.16,
          1
        );
      }

      const status = uiState.islandHighlight?.get(isl.id);
      if (status === 'selected') {
        vis.ringMat.color.setHex(0xffd166);
        vis.ringMat.opacity = 0.92;
      } else if (status === 'constellation') {
        vis.ringMat.color.setHex(0xffe588);
        vis.ringMat.opacity = 0.72 + Math.sin(timeSec * 5.2) * 0.24;
      } else if (status === 'candidate') {
        vis.ringMat.color.setHex(0x64dfdf);
        vis.ringMat.opacity = 0.58 + Math.sin(timeSec * 5) * 0.25;
      } else if (status === 'blocked' || status === 'tooFar') {
        vis.ringMat.color.setHex(0xff6b6b);
        vis.ringMat.opacity = status === 'blocked' ? 0.65 + Math.sin(timeSec * 5) * 0.2 : 0.38;
      } else {
        vis.ringMat.opacity = 0;
      }

      for (let i = 0; i < isl.slots.length; i++) {
        const slot = isl.slots[i];
        const sv = vis.slotVisuals[i];
        const isSelectedSlot =
          !isDawnOrResult && uiState.selectedIslandId === isl.id && uiState.selectedSlotIndex === i;
        if (isSelectedSlot) {
          sv.markerMat.color.setHex(0xffd166);
          sv.markerMat.opacity = 0.96;
          sv.marker.scale.setScalar(1.2);
        } else if (slot.buildingId) {
          sv.markerMat.color.setHex(0xffd166);
          sv.markerMat.opacity = 0.36 * dim;
          sv.marker.scale.setScalar(1.0);
        } else if (isl.connected) {
          sv.markerMat.color.setHex(0xaef2ff);
          sv.markerMat.opacity = 0.66 * dim;
          sv.marker.scale.setScalar(1.0);
        } else {
          sv.markerMat.color.setHex(0x8ea6c8);
          sv.markerMat.opacity = 0.14 * dim;
          sv.marker.scale.setScalar(0.9);
        }
      }
    }

    // 3. 建物同期
    const activeBuildingIds = new Set();
    for (const b of sim.buildings) {
      activeBuildingIds.add(b.id);
      let bv = this.buildingVisuals.get(b.id);
      const isl = sim.getIsland(b.islandId);
      const islVis = this.islandVisuals.get(b.islandId);
      if (!bv && isl && islVis) {
        const slot = isl.slots[b.slotIndex];
        const holder = new THREE.Group();
        holder.position.set(slot.localX, 0.28, slot.localZ);

        const mesh = this._createBuildingMesh(b.type);
        mesh.scale.setScalar(0.01);
        holder.add(mesh);

        const progSprite = createProgressSprite();
        progSprite.position.set(0, 1.85, 0);
        holder.add(progSprite);

        islVis.group.add(holder);
        bv = { holder, mesh, progSprite, parentGroup: islVis.group };
        this.buildingVisuals.set(b.id, bv);
      }

      if (bv) {
        const dim = islandDimMap.get(b.islandId) ?? 1;
        const isl = sim.getIsland(b.islandId);
        const islVis = this.islandVisuals.get(b.islandId);
        const slot = isl?.slots[b.slotIndex];
        const glow = bv.mesh.userData.glow;
        const glowBase = (bv.mesh.userData.glowBaseScale || 2.6) * 1.5;
        const wx = isl && slot ? isl.x + slot.localX : 0;
        const wz = isl && slot ? isl.z + slot.localZ : 0;
        const wy =
          (islVis ? islVis.group.position.y : 0) +
          0.31 +
          (glow ? glow.position.y * 1.5 : 0.8);

        if (!b.built) {
          bv.mesh.scale.set(1, 0.25 + b.progress * 0.75, 1);
          bv.progSprite.visible = !isDawnOrResult;
          if (!isDawnOrResult) {
            updateProgressSprite(bv.progSprite, b.progress);
          }
          if (glow) {
            this._attenuateGlowSprite(glow, wx, wy, wz, glowBase, 0.18 * dim, 0.14, 1.5);
          }
          if (bv.mesh.userData.beamPivot) bv.mesh.userData.beamPivot.visible = false;
        } else {
          bv.mesh.scale.set(1, 1, 1);
          bv.progSprite.visible = false;
          let nearFade = 1;
          if (glow) {
            const baseOp = b.type === 'lighthouse' ? 1.0 : 0.92;
            nearFade = this._attenuateGlowSprite(
              glow,
              wx,
              wy,
              wz,
              glowBase,
              baseOp * dim,
              b.type === 'lighthouse' ? 0.19 : 0.16,
              1.5
            );
          }
          if (bv.mesh.userData.beamPivot) {
            bv.mesh.userData.beamPivot.rotation.y = timeSec * 1.1;
            bv.mesh.userData.beamPivot.visible = dim > 0.15 && nearFade > 0.05;
            if (bv.mesh.userData.beamMat) {
              bv.mesh.userData.beamMat.opacity = 0.22 * dim * nearFade;
            }
          }
        }
      }
    }
    for (const [id, bv] of this.buildingVisuals.entries()) {
      if (!activeBuildingIds.has(id)) {
        bv.parentGroup.remove(bv.holder);
        this.buildingVisuals.delete(id);
      }
    }

    // 4. 橋同期
    const globalDawnDim = isDawnOrResult ? Math.max(0, 1 - dawnProg * 1.25) : 1;
    const activeBridgeIds = new Set();
    for (const br of sim.bridges) {
      activeBridgeIds.add(br.id);
      let brVis = this.bridgeVisuals.get(br.id);
      if (!brVis) {
        brVis = this._createBridgeVisual(
          br,
          sim.getIsland(br.islandA),
          sim.getIsland(br.islandB)
        );
        this.bridgeVisuals.set(br.id, brVis);
      }

      const count = brVis.plankMeshes.length;
      const visibleCount = br.built ? count : Math.max(1, Math.floor(br.progress * count));
      for (let i = 0; i < count; i++) {
        brVis.plankMeshes[i].visible = i < visibleCount;
      }

      const isSelectedBridge = !isDawnOrResult && uiState.selectedBridgeId === br.id;
      const flow = br.flow || 0;
      const flowNorm = Math.min(1, flow / 26);
      for (const m of brVis.plankMeshes) {
        if (isSelectedBridge) {
          m.material.emissive.setHex(0x8c1d1d);
        } else {
          const baseHex = br.high ? 0x382b18 : 0x291a0d;
          const brightHex = br.high ? 0x628098 : 0x7c501f;
          m.material.emissive.setHex(baseHex).lerp(new THREE.Color(brightHex), flowNorm * globalDawnDim);
        }
      }

      const activePCount = br.built
        ? isLowQuality
          ? 3
          : Math.max(3, Math.min(brVis.particles.length, 3 + Math.round(flowNorm * 5)))
        : 0;
      const flowSpeed = 0.24 + flowNorm * 0.34;
      const pScale = 0.66 + flowNorm * 0.54;
      const dir = br.flowDir >= 0 ? 1 : -1;
      for (let i = 0; i < brVis.particles.length; i++) {
        const p = brVis.particles[i];
        if (!br.built || globalDawnDim <= 0.1 || i >= activePCount) {
          p.sprite.visible = false;
          continue;
        }
        p.sprite.visible = true;
        const rawT = (timeSec * flowSpeed + p.offset) % 1;
        const t = dir > 0 ? rawT : 1 - rawT;
        p.sprite.position.lerpVectors(brVis.start, brVis.end, t);
        p.sprite.position.y += Math.sin(t * Math.PI) * brVis.peak + 0.42;
        p.sprite.scale.set(pScale, pScale, 1);
        p.sprite.material.opacity = (0.68 + flowNorm * 0.3) * globalDawnDim;
      }
    }
    for (const [id, brVis] of this.bridgeVisuals.entries()) {
      if (!activeBridgeIds.has(id)) {
        this.bridgesGroup.remove(brVis.group);
        this.hitMeshes = this.hitMeshes.filter((m) => m !== brVis.hitBox);
        this.bridgeVisuals.delete(id);
      }
    }

    // 5. 航路同期
    const activeRouteIds = new Set();
    for (const rt of sim.routes) {
      activeRouteIds.add(rt.id);
      let rtVis = this.routeVisuals.get(rt.id);
      if (!rtVis) {
        rtVis = this._createRouteVisual(
          rt,
          sim.getIsland(rt.islandA),
          sim.getIsland(rt.islandB)
        );
        this.routeVisuals.set(rt.id, rtVis);
      }
      const rtFlowNorm = Math.min(1, (rt.flow || 0) / 22);
      rtVis.mat.size = 0.56 + rtFlowNorm * 0.44;
      rtVis.mat.opacity = (rt.established ? 0.72 + rtFlowNorm * 0.25 : 0.6) * (0.35 + 0.65 * globalDawnDim);
      const activeRCount = rt.established
        ? isLowQuality
          ? 2
          : Math.max(2, Math.min(rtVis.particles.length, 2 + Math.round(rtFlowNorm * 5)))
        : 0;
      const rtSpeed = 0.18 + rtFlowNorm * 0.26;
      const rtScale = 0.74 + rtFlowNorm * 0.6;
      const rtDir = rt.flowDir >= 0 ? 1 : -1;
      for (let i = 0; i < rtVis.particles.length; i++) {
        const p = rtVis.particles[i];
        if (!rt.established || globalDawnDim <= 0.1 || i >= activeRCount) {
          p.sprite.visible = false;
          continue;
        }
        p.sprite.visible = true;
        const rawT = (timeSec * rtSpeed + p.offset) % 1;
        const t = rtDir > 0 ? rawT : 1 - rawT;
        p.sprite.position.lerpVectors(rtVis.start, rtVis.end, t);
        p.sprite.position.y += Math.sin(t * Math.PI) * 0.65 + 0.18;
        p.sprite.scale.set(rtScale, rtScale, 1);
        p.sprite.material.opacity = (0.72 + rtFlowNorm * 0.26) * globalDawnDim;
      }
    }
    for (const [id, rtVis] of this.routeVisuals.entries()) {
      if (!activeRouteIds.has(id)) {
        this.routesGroup.remove(rtVis.group);
        this.routeVisuals.delete(id);
      }
    }

    // 6. 船同期
    const activeShipIds = new Set();
    for (const ship of sim.ships) {
      activeShipIds.add(ship.id);
      let sv = this.shipVisuals.get(ship.id);
      if (!sv) {
        sv = this._createShipVisual();
        this.shipVisuals.set(ship.id, sv);
      }
      const fromIsl = sim.getIsland(ship.from);
      const toIsl = sim.getIsland(ship.to);
      if (fromIsl && toIsl) {
        const t = ship.progress;
        const px = fromIsl.x + (toIsl.x - fromIsl.x) * t;
        const pz = fromIsl.z + (toIsl.z - fromIsl.z) * t;
        const py =
          fromIsl.y + (toIsl.y - fromIsl.y) * t + 0.72 + Math.sin(t * Math.PI) * 0.65;
        sv.group.position.set(px, py, pz);
        const camDist = this.camera.position.distanceTo(sv.group.position);
        const distScale = Math.max(0.55, Math.min(1.08, camDist / 24));
        sv.group.scale.setScalar(distScale);
        sv.group.lookAt(toIsl.x, py, toIsl.z);
        sv.group.rotation.z = Math.sin(timeSec * 3.5 + t * 6) * 0.06;
        sv.cargoGroup.position.y = 1.04 + Math.sin(timeSec * 4.5 + t * 5) * 0.06;
        sv.crate.visible = ship.cargo !== 'visitors';
        sv.passenger.visible = ship.cargo === 'visitors';
        sv.cargoGlow.material.map =
          ship.cargo === 'visitors' ? this.cyanGlowTex : this.warmGlowTex;
        sv.glow.visible = !isLowQuality;
        const shipParentScale = Math.max(0.05, distScale * 0.95);
        this._attenuateGlowSprite(
          sv.glow,
          px,
          py + 0.36 * shipParentScale,
          pz,
          2.1 * shipParentScale,
          0.95 * globalDawnDim,
          0.14,
          shipParentScale
        );
        this._attenuateGlowSprite(
          sv.cargoGlow,
          px,
          py + sv.cargoGroup.position.y * shipParentScale,
          pz,
          1.0 * shipParentScale,
          0.92 * globalDawnDim,
          0.09,
          shipParentScale
        );
      }
    }
    for (const [id, sv] of this.shipVisuals.entries()) {
      if (!activeShipIds.has(id)) {
        this.shipsGroup.remove(sv.group);
        this.shipVisuals.delete(id);
      }
    }

    this._updateSkyConstellation(sim, timeSec, globalDawnDim);
    this._updateLoopPulses(sim, timeSec, globalDawnDim);

    this.renderer.render(this.scene, this.camera);
  }

  _updateSkyConstellation(sim, timeSec, globalDawnDim) {
    const c = sim.constellation;
    if (!c || !Array.isArray(c.islandIds) || c.islandIds.length === 0) {
      if (this._lastConstellationKey !== '') {
        this._lastConstellationKey = '';
        while (this.skyConstellationGroup.children.length > 0) {
          this.skyConstellationGroup.remove(this.skyConstellationGroup.children[0]);
        }
      }
      return;
    }

    const key = `${sim.seed || ''}:${c.islandIds.join(',')}:${c.completed ? 1 : 0}`;
    if (key !== this._lastConstellationKey) {
      this._lastConstellationKey = key;
      while (this.skyConstellationGroup.children.length > 0) {
        this.skyConstellationGroup.remove(this.skyConstellationGroup.children[0]);
      }

      const starPositions = new Map();
      c.islandIds.forEach((id, idx) => {
        const isl = sim.getIsland(id);
        if (!isl) return;
        const sx = isl.x * 0.65;
        const sz = isl.z * 0.65 - 10;
        const sy = 25 + (idx % 2) * 2.2;
        const pos = new THREE.Vector3(sx, sy, sz);
        starPositions.set(id, pos);

        const starSprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: c.completed ? this.warmGlowTex : this.cyanGlowTex,
            color: c.completed ? 0xffe699 : 0xa5e8ff,
            transparent: true,
            opacity: c.completed ? 0.95 : 0.55,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        starSprite.position.copy(pos);
        const sSize = c.completed ? 2.4 : 1.3;
        starSprite.scale.set(sSize, sSize, 1);
        this.skyConstellationGroup.add(starSprite);
      });

      for (const [u, v] of c.edges) {
        const pu = starPositions.get(u);
        const pv = starPositions.get(v);
        if (!pu || !pv) continue;
        const geo = new THREE.BufferGeometry().setFromPoints([pu, pv]);
        const mat = new THREE.LineBasicMaterial({
          color: c.completed ? 0xffdf7a : 0x7ec8f2,
          transparent: true,
          opacity: c.completed ? 0.9 : 0.25,
        });
        this.skyConstellationGroup.add(new THREE.Line(geo, mat));
      }
    }

    const pulse = 0.85 + Math.sin(timeSec * 3.0) * 0.15;
    for (const child of this.skyConstellationGroup.children) {
      if (child.isSprite) {
        child.material.opacity = (c.completed ? 0.95 * pulse : 0.55) * (0.2 + 0.8 * globalDawnDim);
      } else if (child.isLine) {
        child.material.opacity = (c.completed ? 0.88 * pulse : 0.24) * (0.2 + 0.8 * globalDawnDim);
      }
    }
  }

  _updateLoopPulses(sim, timeSec, globalDawnDim) {
    for (let i = this.activeLoopPulses.length - 1; i >= 0; i--) {
      const lp = this.activeLoopPulses[i];
      const elapsed = timeSec - lp.startTime;
      if (elapsed >= lp.duration) {
        this.loopPulseGroup.remove(lp.orb);
        this.activeLoopPulses.splice(i, 1);
        continue;
      }
      const ids = lp.islandIds;
      const segCount = ids.length;
      const u = ((elapsed / lp.duration) * 1.5 * segCount) % segCount;
      const segIdx = Math.floor(u);
      const frac = u - segIdx;
      const islA = sim.getIsland(ids[segIdx]);
      const islB = sim.getIsland(ids[(segIdx + 1) % segCount]);
      if (islA && islB) {
        lp.orb.position.set(
          islA.x + (islB.x - islA.x) * frac,
          islA.y + (islB.y - islA.y) * frac + 1.05 + Math.sin(frac * Math.PI) * 0.9,
          islA.z + (islB.z - islA.z) * frac
        );
        const fade = Math.sin((elapsed / lp.duration) * Math.PI);
        lp.orb.material.opacity = Math.max(0, fade * globalDawnDim);
      }
    }
  }

  projectToScreen(worldX, worldY, worldZ) {
    this.camera.updateMatrixWorld();
    const worldPos = new THREE.Vector3(worldX, worldY, worldZ);
    const vCam = worldPos.clone().applyMatrix4(this.camera.matrixWorldInverse);
    const v = worldPos.project(this.camera);
    const w = this.renderer.domElement.clientWidth || window.innerWidth;
    const h = this.renderer.domElement.clientHeight || window.innerHeight;
    const x = (v.x * 0.5 + 0.5) * w;
    const y = (-v.y * 0.5 + 0.5) * h;
    const inFront = vCam.z < -0.1 && v.z >= -1 && v.z <= 1;
    const len = Math.hypot(vCam.x, -vCam.y) || 1;
    return {
      x,
      y,
      inFront,
      dirX: vCam.x / len,
      dirY: -vCam.y / len,
      visible: inFront && x >= 0 && x <= w && y >= 0 && y <= h,
    };
  }
}
