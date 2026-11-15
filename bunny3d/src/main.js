import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createCharacterMaterials } from './toon.js';
import {
  FaceTextureController,
  createBokehTexture,
  createFishnetTexture,
  createHeartTexture,
  createShadowTexture,
} from './textures.js';
import { createBunnyCharacter } from './character.js';
import { BackgroundSparkles, HeartParticleSystem, SparkleBurstSystem } from './particles.js';

const VALID_EXPRS = new Set(['normal', 'blink', 'half', 'kiss', 'smile', 'shy']);
const VALID_POSES = new Set(['sit', 'stand']);
const VALID_QUALITIES = new Set(['high', 'mid', 'low']);

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

function fillVertexColor(geometry, hexColor) {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  if (geometry.index) geometry.dispose();
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const col = new THREE.Color(hexColor);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function lerpEuler(target, a, b, t) {
  target.x = lerp(a.x, b.x, t);
  target.y = lerp(a.y, b.y, t);
  target.z = lerp(a.z, b.z, t);
}

function quadBezierEuler(target, a, mid, b, t) {
  const mt = 1 - t;
  const c0 = mt * mt;
  const c1 = 2 * mt * t;
  const c2 = t * t;
  target.x = c0 * a.x + c1 * mid.x + c2 * b.x;
  target.y = c0 * a.y + c1 * mid.y + c2 * b.y;
  target.z = c0 * a.z + c1 * mid.z + c2 * b.z;
}

function quadBezierVec3(target, a, mid, b, t) {
  const mt = 1 - t;
  const c0 = mt * mt;
  const c1 = 2 * mt * t;
  const c2 = t * t;
  target.x = c0 * a.x + c1 * mid.x + c2 * b.x;
  target.y = c0 * a.y + c1 * mid.y + c2 * b.y;
  target.z = c0 * a.z + c1 * mid.z + c2 * b.z;
}

function init() {
  const canvas = document.getElementById('stage');
  const exprBar = document.getElementById('expr-bar');
  const exprButtons = Array.from(document.querySelectorAll('.expr-btn'));
  const poseButtons = Array.from(document.querySelectorAll('.pose-btn'));
  const autoRotateBtn = document.getElementById('btn-autorotate');
  const snapshotBtn = document.getElementById('btn-snapshot');
  const loadingOverlay = document.getElementById('loading-overlay');
  const shutterFlash = document.getElementById('shutter-flash');
  const hintText = document.getElementById('hint-text');
  const toastEl = document.getElementById('reaction-toast');
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false;

  // --- Renderer ---
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  // --- Scene & Camera ---
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
  const lookTarget = new THREE.Vector3(0, 1.02, 0);

  // --- Lighting (Pastel Rose-Lavender Hemisphere + Soft Key + Dual Pastel Rim) ---
  const hemiLight = new THREE.HemisphereLight(0xfff7ff, 0xc98be8, 1.38);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff6f2, 1.06);
  keyLight.position.set(2.3, 3.6, 3.8);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xffcaf8, 0.96);
  rimLight.position.set(-2.3, 2.8, -2.8);
  scene.add(rimLight);

  const backFillRim = new THREE.DirectionalLight(0xe4c6ff, 0.36);
  backFillRim.position.set(2.2, 2.2, -2.6);
  scene.add(backFillRim);

  // --- Textures & Materials ---
  const faceCtrl = new FaceTextureController();
  const fishnetTex = createFishnetTexture();
  const shadowTex = createShadowTexture();
  const heartTex = createHeartTexture();
  const bokehTex = createBokehTexture();
  const materials = createCharacterMaterials(fishnetTex);

  // --- Turntable (Character + Pedestal rotate together) ---
  const turntable = new THREE.Group();
  turntable.name = 'turntable_group';
  scene.add(turntable);

  // Circular Figure Pedestal (base + rim merged into 1 draw call + subtle glowing rim line)
  const pedestalGroup = new THREE.Group();
  pedestalGroup.name = 'pedestal_group';

  const baseGeoRaw = new THREE.CylinderGeometry(0.88, 0.96, 0.11, 44);
  baseGeoRaw.translate(0, -0.055, 0);
  const rimGeoRaw = new THREE.TorusGeometry(0.88, 0.016, 10, 44);
  rimGeoRaw.rotateX(Math.PI * 0.5);
  rimGeoRaw.translate(0, -0.002, 0);

  const baseColored = fillVertexColor(baseGeoRaw, 0x2b1d45);
  const rimColored = fillVertexColor(rimGeoRaw, 0x9e70d9);
  const mergedPedestalGeo = mergeGeometries([baseColored, rimColored], false);
  baseColored.dispose();
  rimColored.dispose();

  const pedestalMat = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: materials.gradients.softGradient,
  });
  const pedestalMesh = new THREE.Mesh(mergedPedestalGeo, pedestalMat);
  pedestalGroup.add(pedestalMesh);

  const glowRimGeo = new THREE.TorusGeometry(0.882, 0.0055, 6, 48);
  glowRimGeo.rotateX(Math.PI * 0.5);
  const glowRimMat = new THREE.MeshBasicMaterial({
    color: 0xf6ceff,
    transparent: true,
    opacity: 0.68,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glowRimMesh = new THREE.Mesh(glowRimGeo, glowRimMat);
  glowRimMesh.position.y = 0.003;
  pedestalGroup.add(glowRimMesh);

  const shadowGeo = new THREE.PlaneGeometry(1.38, 1.38);
  shadowGeo.rotateX(-Math.PI * 0.5);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.set(0.02, 0.002, 0.0);
  pedestalGroup.add(shadowMesh);

  turntable.add(pedestalGroup);

  // --- Character & Particles ---
  const character = createBunnyCharacter(materials, faceCtrl.texture);
  turntable.add(character.root);

  const bgSparkles = new BackgroundSparkles(scene, bokehTex);
  bgSparkles.setPixelRatio(renderer.getPixelRatio());
  bgSparkles.setReducedMotion(prefersReducedMotion);
  const heartParticles = new HeartParticleSystem(turntable, heartTex);
  const poseSparkles = new SparkleBurstSystem(turntable, bokehTex);
  const _mouthWorld = new THREE.Vector3();
  const _floorWorld = new THREE.Vector3();

  function getKissOrigin() {
    turntable.updateMatrixWorld(true);
    character.mouthAnchor.getWorldPosition(_mouthWorld);
    return turntable.worldToLocal(_mouthWorld.clone());
  }

  // --- State ---
  const state = {
    mode: 'idle',
    userExpression: 'normal',
    poseTarget: 'sit',
    poseMix: 0, // 0 = sit, 1 = stand
    poseTransition: {
      active: false,
      from: 'sit',
      to: 'stand',
      progress: 0,
      duration: 1.0,
    },
    frozen: false,
    autoRotate: false,
    rotationY: 0,
    rotVelocity: 0,
    zoom: 1.0,
    baseCamDist: 4.4,
    time: 0,
    fps: 60,

    // Blink scheduler
    nextBlinkIn: 2.8,
    blinkTimer: 0,

    // Smooth expression eyelid transition (0.12s)
    renderedExpr: 'normal',
    exprTrans: {
      active: false,
      from: 'normal',
      to: 'normal',
      progress: 1,
      duration: 0.12,
    },

    // Temporary tap expression override
    tapExpr: null,
    tapExprTimer: 0,

    // Kiss sequence
    kissTimer: 0,
    kissMix: 0,
    kissBurstDone: false,

    // Tap reactions
    earPop: 0,
    blushBoost: 0,
    wigglePop: 0,
    highFivePop: 0,
    toastTimer: null,

    // Idle gestures & 20s "こっち見て" appeal
    idleSinceInput: 0,
    appealDoneThisStretch: false,
    nextGestureIn: 6.5,
    lastGesture: '',
    gesture: {
      active: false,
      type: '',
      dir: 1,
      progress: 0,
      duration: 1.8,
    },

    // Performance quality tier & initial 2s auto-tuning
    quality: 'high',
    qualityLocked: false,
    qualityEvalTimer: 0,
    qualityEvalFrames: 0,
    qualityDone: false,

    // 1.5s pop-in entrance choreography
    intro: {
      active: false,
      progress: 1,
      duration: prefersReducedMotion ? 0.75 : 1.55,
      sparkleDone: false,
      smileDone: false,
      smileEndDone: false,
    },

    // Secondary spring-damper physics for hair & bunny ears
    springs: {
      hairYaw: 0,
      hairYawVel: 0,
      hairPitch: 0,
      hairPitchVel: 0,
      earTilt: 0,
      earTiltVel: 0,
      prevY: 0.35,
      prevRotY: 0,
    },
  };

  function getDprForQuality(level) {
    const raw = window.devicePixelRatio || 1;
    if (level === 'low') return 1.0;
    if (level === 'mid') return Math.min(raw, 1.5);
    return Math.min(raw, 2.0);
  }

  function applyQuality(level) {
    const valid = VALID_QUALITIES.has(level) ? level : 'high';
    state.quality = valid;
    const dpr = getDprForQuality(valid);
    renderer.setPixelRatio(dpr);
    bgSparkles.setPixelRatio(dpr);
    updateCameraFraming();
  }

  // --- Responsive Framing (adapts smoothly to sit/stand bounding height) ---
  function computeCameraDistance() {
    const aspect = Math.max(0.3, camera.aspect || 1);
    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    const halfTan = Math.tan(fovRad * 0.5);
    const vertSpan = lerp(3.16, 3.74, state.poseMix);
    const distVert = vertSpan / (2 * halfTan);
    const distHoriz = 1.76 / (2 * halfTan * aspect);
    state.baseCamDist = Math.max(distVert, distHoriz);
  }

  function updateExprScrollFade() {
    if (!exprBar) return;
    const remaining = exprBar.scrollWidth - exprBar.clientWidth - exprBar.scrollLeft;
    exprBar.classList.toggle('has-fade', remaining > 8);
  }

  if (exprBar) {
    exprBar.addEventListener('scroll', updateExprScrollFade, { passive: true });
  }

  function updateCameraFraming() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = Math.max(0.3, w / Math.max(1, h));

    renderer.setSize(w, h, false);
    camera.aspect = aspect;
    applyCameraZoom();
    camera.updateProjectionMatrix();
    updateExprScrollFade();
  }

  function applyCameraZoom() {
    computeCameraDistance();
    const dist = state.baseCamDist / state.zoom;
    const baseLookY = lerp(1.02, 1.24, state.poseMix);
    const zoomUp = Math.max(0, state.zoom - 1.0) * 0.44;
    lookTarget.set(0, baseLookY + zoomUp, 0);
    camera.position.set(0, lookTarget.y + dist * 0.08, dist);
    camera.lookAt(lookTarget);

    // Keep outline pixel weight natural when zooming in closely
    materials.outlineUniforms.uOutlineScale.value = clamp(
      1.0 / (0.68 + 0.32 * state.zoom),
      0.78,
      1.06
    );
  }

  window.addEventListener('resize', updateCameraFraming);
  updateCameraFraming();

  // --- UI, Poses & Expressions ---
  function syncExprButtons() {
    for (const btn of exprButtons) {
      btn.classList.toggle('active', btn.dataset.expr === state.userExpression);
    }
  }

  function syncPoseButtons() {
    for (const btn of poseButtons) {
      const isActive = btn.dataset.pose === state.poseTarget;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    }
  }

  function setPose(poseName, instant = false) {
    const next = VALID_POSES.has(poseName) ? poseName : 'sit';
    state.poseTarget = next;
    syncPoseButtons();

    if (instant) {
      state.poseTransition.active = false;
      state.poseTransition.progress = 1;
      state.poseMix = next === 'stand' ? 1 : 0;
      applyCameraZoom();
      applyPose(0);
      return;
    }

    const currentlyStand = state.poseMix >= 0.5;
    const currentPose = currentlyStand ? 'stand' : 'sit';
    if (next === currentPose && !state.poseTransition.active) {
      return;
    }

    state.poseTransition.active = true;
    state.poseTransition.from = currentPose;
    state.poseTransition.to = next;
    state.poseTransition.progress = 0;

    // Ears pop happily & pastel sparkles burst on pose switch
    state.earPop = 1.0;
    poseSparkles.emit(lerp(0.88, 1.18, state.poseMix));
    if (next === 'stand') {
      showToast('よいしょ♪');
    } else {
      showToast('ちょこん♪');
    }
  }

  function showToast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('visible');
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      toastEl.classList.remove('visible');
    }, 1500);
  }

  function registerUserActivity() {
    state.idleSinceInput = 0;
    state.appealDoneThisStretch = false;
  }

  function hasClosedEyeShape(expr) {
    return expr === 'blink' || expr === 'smile';
  }

  function startExprTransition(fromExpr, toExpr) {
    if (fromExpr === toExpr) return;
    if (state.frozen || (hasClosedEyeShape(fromExpr) && hasClosedEyeShape(toExpr))) {
      state.renderedExpr = toExpr;
      state.exprTrans.active = false;
      faceCtrl.update(toExpr, state.blushBoost, 0);
      return;
    }
    state.exprTrans.active = true;
    state.exprTrans.from = fromExpr;
    state.exprTrans.to = toExpr;
    state.exprTrans.progress = 0;
  }

  function setExpression(name, instant = false) {
    const next = VALID_EXPRS.has(name) ? name : 'normal';
    const prevBase = state.tapExpr || state.userExpression;
    state.userExpression = next;
    state.tapExpr = null;
    state.tapExprTimer = 0;
    state.blinkTimer = 0;

    if (next === 'kiss') {
      state.mode = 'kiss';
      state.kissTimer = 0;
      state.kissBurstDone = false;
      const origin = getKissOrigin();
      if (state.frozen) {
        state.kissMix = 1;
        heartParticles.showStaticKissPreview(origin);
      } else {
        heartParticles.emitBurst(origin, 4);
      }
    } else {
      state.mode = 'idle';
      if (state.frozen) {
        state.kissMix = 0;
        heartParticles.clear();
      }
    }

    syncExprButtons();
    if (instant || state.frozen) {
      state.renderedExpr = next;
      state.exprTrans.active = false;
      faceCtrl.update(next, state.blushBoost, 0);
    } else {
      startExprTransition(prevBase, next);
    }
    applyPose(0);
  }

  function setRotation(yRadians) {
    if (Number.isFinite(yRadians)) {
      state.rotationY = yRadians;
      state.rotVelocity = 0;
      state.springs.prevRotY = yRadians;
      turntable.rotation.y = yRadians;
    }
  }

  function setZoom(z) {
    if (Number.isFinite(z)) {
      state.zoom = clamp(z, 0.75, 1.28);
      applyCameraZoom();
    }
  }

  function setAutoRotate(enabled) {
    state.autoRotate = Boolean(enabled);
    if (autoRotateBtn) {
      autoRotateBtn.classList.toggle('active', state.autoRotate);
      autoRotateBtn.setAttribute('aria-pressed', String(state.autoRotate));
    }
  }

  function detectTapZone(hitObject) {
    let cur = hitObject;
    while (cur && cur !== character.root) {
      const n = cur.name || '';
      if (
        n === 'left_arm_pivot' ||
        n === 'left_elbow_pivot' ||
        n === 'left_wrist_pivot' ||
        n === 'right_arm_pivot' ||
        n === 'right_elbow_pivot' ||
        n === 'right_wrist_pivot'
      ) {
        return 'hand';
      }
      if (n === 'head_pivot') {
        return 'head';
      }
      cur = cur.parent;
    }
    return 'body';
  }

  function triggerTapReaction(zone = null) {
    registerUserActivity();
    const chosenZone =
      zone === 'head' || zone === 'body' || zone === 'hand'
        ? zone
        : ['head', 'body', 'hand'][Math.floor(Math.random() * 3)];

    if (chosenZone === 'head') {
      state.earPop = 1.0;
      if (state.userExpression !== 'kiss') {
        const prev = state.tapExpr || state.userExpression;
        state.tapExpr = 'smile';
        state.tapExprTimer = 1.25;
        startExprTransition(prev, 'smile');
      }
      poseSparkles.emit(lerp(1.22, 1.62, state.poseMix));
      showToast('えへっ♪');
    } else if (chosenZone === 'hand') {
      state.highFivePop = 1.0;
      state.wigglePop = 0.7;
      if (state.userExpression !== 'kiss') {
        const prev = state.tapExpr || state.userExpression;
        state.tapExpr = 'smile';
        state.tapExprTimer = 1.1;
        startExprTransition(prev, 'smile');
      }
      showToast('はいたっち♪');
    } else {
      state.blushBoost = 1.0;
      state.wigglePop = 0.65;
      if (state.userExpression !== 'kiss') {
        const prev = state.tapExpr || state.userExpression;
        state.tapExpr = 'shy';
        state.tapExprTimer = 1.4;
        startExprTransition(prev, 'shy');
      }
      heartParticles.emitBurst(getKissOrigin(), 2);
      showToast('きゃっ…♪');
    }
  }

  function captureSnapshotDataUrl() {
    renderer.render(scene, camera);
    const w = renderer.domElement.width || Math.max(1, window.innerWidth);
    const h = renderer.domElement.height || Math.max(1, window.innerHeight);
    const outCanvas = document.createElement('canvas');
    outCanvas.width = w;
    outCanvas.height = h;
    const ctx = outCanvas.getContext('2d');

    // Match the app's pastel purple radial stage backdrop behind the transparent WebGL buffer
    const maxR = Math.max(w, h) * 0.68;
    const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, maxR);
    bgGrad.addColorStop(0, '#532c76');
    bgGrad.addColorStop(0.54, '#2c194d');
    bgGrad.addColorStop(1, '#1d1033');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    const glowGrad = ctx.createRadialGradient(w * 0.5, h * 0.38, 0, w * 0.5, h * 0.38, Math.min(w, h) * 0.52);
    glowGrad.addColorStop(0, 'rgba(235, 148, 220, 0.26)');
    glowGrad.addColorStop(1, 'rgba(117, 62, 146, 0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, w, h);

    ctx.drawImage(renderer.domElement, 0, 0, w, h);
    return outCanvas.toDataURL('image/png');
  }

  function triggerShutterFlash() {
    if (!shutterFlash) return;
    shutterFlash.classList.add('is-flashing');
    setTimeout(() => {
      shutterFlash.classList.remove('is-flashing');
    }, 140);
  }

  function formatDateStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  function takeSnapshot() {
    registerUserActivity();
    const dataUrl = captureSnapshotDataUrl();
    triggerShutterFlash();
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `bunny3d-${formatDateStamp()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('パシャッ♪ 保存しました');
  }

  function setFrozen(flag) {
    state.frozen = Boolean(flag);
    if (state.frozen) {
      state.intro.active = false;
      character.root.scale.setScalar(1);
      state.exprTrans.active = false;
      state.tapExpr = null;
      state.tapExprTimer = 0;
      state.gesture.active = false;
      state.renderedExpr = state.userExpression;
      state.springs.hairYaw = 0;
      state.springs.hairYawVel = 0;
      state.springs.hairPitch = 0;
      state.springs.hairPitchVel = 0;
      state.springs.earTilt = 0;
      state.springs.earTiltVel = 0;
      faceCtrl.update(state.userExpression, state.blushBoost, 0);
      if (state.userExpression === 'kiss') {
        state.kissMix = 1;
        applyPose(0);
        heartParticles.showStaticKissPreview(getKissOrigin());
      } else {
        state.kissMix = 0;
        heartParticles.clear();
        applyPose(0);
      }
    }
  }

  for (const btn of exprButtons) {
    btn.addEventListener('click', () => {
      registerUserActivity();
      setExpression(btn.dataset.expr);
    });
  }

  for (const btn of poseButtons) {
    btn.addEventListener('click', () => {
      registerUserActivity();
      setPose(btn.dataset.pose, false);
    });
  }

  if (autoRotateBtn) {
    autoRotateBtn.addEventListener('click', () => {
      registerUserActivity();
      setAutoRotate(!state.autoRotate);
    });
  }

  if (snapshotBtn) {
    snapshotBtn.addEventListener('click', takeSnapshot);
  }

  // --- Pointer Interactions (Drag Rotation + Inertia, Pinch/Wheel Zoom, Tap) ---
  const activePointers = new Map();
  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();
  let lastPinchDist = 0;
  let tapCandidate = null;

  function getPinchDistance() {
    const pts = Array.from(activePointers.values());
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  canvas.addEventListener('pointerdown', (e) => {
    registerUserActivity();
    canvas.setPointerCapture(e.pointerId);
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 1) {
      state.rotVelocity = 0;
      tapCandidate = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        maxDist: 0,
      };
    } else if (activePointers.size === 2) {
      tapCandidate = null;
      lastPinchDist = getPinchDistance();
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const prev = activePointers.get(e.pointerId);
    if (!prev) return;

    registerUserActivity();
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;

    if (activePointers.size === 1) {
      if (tapCandidate && tapCandidate.id === e.pointerId) {
        const dist = Math.hypot(e.clientX - tapCandidate.startX, e.clientY - tapCandidate.startY);
        if (dist > tapCandidate.maxDist) tapCandidate.maxDist = dist;
      }
      const rotDelta = dx * 0.0085;
      state.rotationY += rotDelta;
      state.rotVelocity = rotDelta * 55;
      turntable.rotation.y = state.rotationY;
    } else if (activePointers.size === 2) {
      const pinchDist = getPinchDistance();
      if (lastPinchDist > 0 && pinchDist > 0) {
        const ratio = pinchDist / lastPinchDist;
        setZoom(state.zoom * ratio);
      }
      lastPinchDist = pinchDist;
    }
  });

  function handlePointerEnd(e) {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) {
      lastPinchDist = 0;
    }

    if (tapCandidate && tapCandidate.id === e.pointerId) {
      if (tapCandidate.maxDist < 9) {
        // Raycast against character to confirm tap hit and detect head / body / hand zone
        const rect = canvas.getBoundingClientRect();
        pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointerNDC, camera);
        const hits = raycaster.intersectObject(character.root, true);
        if (hits.length > 0) {
          triggerTapReaction(detectTapZone(hits[0].object));
        }
      }
      tapCandidate = null;
    }
  }

  canvas.addEventListener('pointerup', handlePointerEnd);
  canvas.addEventListener('pointercancel', handlePointerEnd);

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      registerUserActivity();
      const factor = Math.exp(-e.deltaY * 0.0011);
      setZoom(state.zoom * factor);
    },
    { passive: false }
  );

  // Reusable scratch transforms for kiss & transition evaluation
  const _baseLeftArm = new THREE.Euler();
  const _baseLeftElbow = new THREE.Euler();
  const _baseLeftWrist = new THREE.Euler();
  const _baseKissArm = new THREE.Euler();
  const _baseKissElbow = new THREE.Euler();
  const _baseKissWrist = new THREE.Euler();

  function evaluateRigPose() {
    const p = character.poses;
    const tr = state.poseTransition;

    if (tr.active) {
      const fromPose = tr.from === 'stand' ? p.stand : p.sit;
      const toPose = tr.to === 'stand' ? p.stand : p.sit;
      const midPose = tr.to === 'stand' ? p.midStand : p.midSit;
      const u = easeInOutCubic(clamp(tr.progress, 0, 1));

      quadBezierVec3(character.hipsGroup.position, fromPose.hipsPos, midPose.hipsPos, toPose.hipsPos, u);
      quadBezierEuler(character.hipsGroup.rotation, fromPose.hipsRot, midPose.hipsRot, toPose.hipsRot, u);
      quadBezierEuler(character.torsoPivot.rotation, fromPose.torsoRot, midPose.torsoRot, toPose.torsoRot, u);
      quadBezierEuler(character.headPivot.rotation, fromPose.headRot, midPose.headRot, toPose.headRot, u);

      quadBezierEuler(character.rightLeg.hipPivot.rotation, fromPose.rightHipRot, midPose.rightHipRot, toPose.rightHipRot, u);
      quadBezierEuler(character.rightLeg.kneePivot.rotation, fromPose.rightKneeRot, midPose.rightKneeRot, toPose.rightKneeRot, u);
      quadBezierEuler(character.rightLeg.anklePivot.rotation, fromPose.rightAnkleRot, midPose.rightAnkleRot, toPose.rightAnkleRot, u);

      quadBezierEuler(character.leftLeg.hipPivot.rotation, fromPose.leftHipRot, midPose.leftHipRot, toPose.leftHipRot, u);
      quadBezierEuler(character.leftLeg.kneePivot.rotation, fromPose.leftKneeRot, midPose.leftKneeRot, toPose.leftKneeRot, u);
      quadBezierEuler(character.leftLeg.anklePivot.rotation, fromPose.leftAnkleRot, midPose.leftAnkleRot, toPose.leftAnkleRot, u);

      quadBezierEuler(character.rightArmPivot.rotation, fromPose.rightArmRot, midPose.rightArmRot, toPose.rightArmRot, u);
      quadBezierEuler(character.rightElbowPivot.rotation, fromPose.rightElbowRot, midPose.rightElbowRot, toPose.rightElbowRot, u);
      quadBezierEuler(character.rightWristPivot.rotation, fromPose.rightWristRot, midPose.rightWristRot, toPose.rightWristRot, u);

      quadBezierEuler(_baseLeftArm, fromPose.leftArmRot, midPose.leftArmRot, toPose.leftArmRot, u);
      quadBezierEuler(_baseLeftElbow, fromPose.leftElbowRot, midPose.leftElbowRot, toPose.leftElbowRot, u);
      quadBezierEuler(_baseLeftWrist, fromPose.leftWristRot, midPose.leftWristRot, toPose.leftWristRot, u);
      return;
    }

    const active = state.poseMix >= 0.5 ? p.stand : p.sit;
    character.hipsGroup.position.copy(active.hipsPos);
    character.hipsGroup.rotation.copy(active.hipsRot);
    character.torsoPivot.rotation.copy(active.torsoRot);
    character.headPivot.rotation.copy(active.headRot);

    character.rightLeg.hipPivot.rotation.copy(active.rightHipRot);
    character.rightLeg.kneePivot.rotation.copy(active.rightKneeRot);
    character.rightLeg.anklePivot.rotation.copy(active.rightAnkleRot);

    character.leftLeg.hipPivot.rotation.copy(active.leftHipRot);
    character.leftLeg.kneePivot.rotation.copy(active.leftKneeRot);
    character.leftLeg.anklePivot.rotation.copy(active.leftAnkleRot);

    character.rightArmPivot.rotation.copy(active.rightArmRot);
    character.rightElbowPivot.rotation.copy(active.rightElbowRot);
    character.rightWristPivot.rotation.copy(active.rightWristRot);

    _baseLeftArm.copy(active.leftArmRot);
    _baseLeftElbow.copy(active.leftElbowRot);
    _baseLeftWrist.copy(active.leftWristRot);
  }

  // --- Idle Gesture Scheduler & Secondary Spring-Damper Physics ---
  function startIdleGesture(type, dir = 1) {
    state.gesture.active = true;
    state.gesture.type = type;
    state.gesture.dir = dir;
    state.gesture.progress = 0;
    state.lastGesture = type;
    if (type === 'appealWave') {
      state.gesture.duration = 2.5;
      showToast('こっち見て〜♪');
      if (state.userExpression === 'normal') {
        const prev = state.tapExpr || state.userExpression;
        state.tapExpr = 'smile';
        state.tapExprTimer = 1.6;
        startExprTransition(prev, 'smile');
      }
    } else if (type === 'earTuck') {
      state.gesture.duration = 2.2;
    } else if (type === 'waveHand') {
      state.gesture.duration = 1.9;
    } else if (type === 'headTilt') {
      state.gesture.duration = 2.0;
    } else if (type === 'earTwitch') {
      state.gesture.duration = 1.3;
    } else {
      state.gesture.duration = 1.4;
    }
  }

  function stepSpring(pos, vel, target, stiffness, damping, dt) {
    const acc = -stiffness * (pos - target) - damping * vel;
    const nextVel = vel + acc * dt;
    const nextPos = pos + nextVel * dt;
    return [nextPos, nextVel];
  }

  function updateSprings(dt) {
    const sp = state.springs;
    if (state.frozen || dt <= 0) {
      sp.prevY = character.hipsGroup.position.y;
      sp.prevRotY = state.rotationY;
      return;
    }
    const dy = (character.hipsGroup.position.y - sp.prevY) / dt;
    sp.prevY = character.hipsGroup.position.y;

    let dRot = state.rotationY - sp.prevRotY;
    while (dRot > Math.PI) dRot -= Math.PI * 2;
    while (dRot < -Math.PI) dRot += Math.PI * 2;
    const omega = dRot / dt;
    sp.prevRotY = state.rotationY;

    const targetYaw = clamp(-omega * 0.045, -0.24, 0.24);
    const targetPitch = clamp(-dy * 0.08, -0.18, 0.18);
    const targetEarTilt = clamp(-omega * 0.055 - dy * 0.14, -0.26, 0.26);

    [sp.hairYaw, sp.hairYawVel] = stepSpring(sp.hairYaw, sp.hairYawVel, targetYaw, 52, 8.2, dt);
    [sp.hairPitch, sp.hairPitchVel] = stepSpring(sp.hairPitch, sp.hairPitchVel, targetPitch, 58, 7.8, dt);
    [sp.earTilt, sp.earTiltVel] = stepSpring(sp.earTilt, sp.earTiltVel, targetEarTilt, 72, 6.8, dt);
  }

  // --- Pose & Idle Animation Evaluator ---
  function applyPose(dt) {
    const t = state.time;
    const p = character.poses;
    const standW = state.poseMix;
    const inTrans = state.poseTransition.active;

    evaluateRigPose();

    // 1. Breathing & lively idle motion (zeroed out when frozen)
    const breathe = state.frozen ? 0 : Math.sin(t * 2.1);
    const sway = state.frozen ? 0 : Math.sin(t * 1.18);
    const earBob = state.frozen ? 0 : Math.sin(t * 3.1) + Math.sin(t * 6.2) * 0.25;
    const wiggle = state.frozen ? 0 : Math.sin(t * 14.0) * state.wigglePop;
    const earPopLift = state.frozen ? 0 : Math.sin(state.earPop * Math.PI) * 0.32;
    const highFiveLift = state.frozen ? 0 : Math.sin(state.highFivePop * Math.PI);

    // Random gesture & 20s appeal offsets
    let gEnv = 0;
    let gU = 0;
    let gType = '';
    let gDir = 1;
    if (!state.frozen && state.gesture.active) {
      gType = state.gesture.type;
      gDir = state.gesture.dir;
      gU = clamp(state.gesture.progress, 0, 1);
      gEnv = Math.sin(gU * Math.PI);
    }

    const gestureBounce =
      gType === 'happyBounce' ? Math.pow(Math.max(0, Math.sin(gU * Math.PI * 2)), 1.4) : 0;

    // Standing idle extras: slow weight shift + occasional playful knee bend & tiptoe bounce
    const standBounce = state.frozen
      ? 0
      : (Math.pow(Math.max(0, Math.sin(t * 0.92)), 10) * 0.8 + gestureBounce * 1.1) *
        standW *
        (1 - (inTrans ? 0.8 : 0));
    const standSway = state.frozen ? 0 : sway * standW * (inTrans ? 0.25 : 1);

    character.hipsGroup.position.x += standSway * 0.018;
    character.hipsGroup.position.y += standBounce * 0.024 + (gType === 'happyBounce' ? gestureBounce * (1 - standW) * 0.012 : 0);
    character.hipsGroup.rotation.z += standSway * 0.024;
    character.rightLeg.kneePivot.rotation.x += standBounce * 0.14;
    character.leftLeg.kneePivot.rotation.x += standBounce * 0.14;
    character.rightLeg.anklePivot.rotation.x -= standBounce * 0.10;
    character.leftLeg.anklePivot.rotation.x -= standBounce * 0.12;

    character.torsoPivot.position.y = 0.43 + breathe * 0.009 + Math.abs(wiggle) * 0.01;
    character.torsoPivot.rotation.x += breathe * 0.014;
    character.torsoPivot.rotation.y += wiggle * 0.08;
    character.torsoPivot.rotation.z += sway * 0.012 - standSway * 0.020;

    // Head sway + kiss head tilt + shy blush dip + headTilt/earTuck gesture
    const kissTilt = state.kissMix * 0.07;
    const shyDip = state.frozen ? 0 : state.blushBoost * 0.06;
    const gHeadTilt = gType === 'headTilt' ? gEnv * 0.16 * gDir : 0;
    const gEarTuckHead = gType === 'earTuck' ? gEnv * -0.10 : 0;
    character.headPivot.rotation.x += breathe * 0.016 + shyDip;
    character.headPivot.rotation.y += sway * 0.025 + wiggle * 0.06 + (gType === 'earTuck' ? gEnv * 0.14 : 0);
    character.headPivot.rotation.z += sway * 0.02 + kissTilt + gHeadTilt + gEarTuckHead;

    // Livelier bunny ears wiggle + single-ear twitch + spring trailing lag
    const sp = state.springs;
    const earBaseR = p.sit.rightEarRot;
    const earBaseL = p.sit.leftEarRot;
    const earTwitchVal =
      gType === 'earTwitch' ? Math.pow(Math.max(0, Math.sin(gU * Math.PI * 3)), 1.5) * 0.24 : 0;
    const rightTwitch = gDir < 0 ? earTwitchVal : 0;
    const leftTwitch = gDir > 0 ? earTwitchVal : 0;

    character.rightBunnyEarPivot.rotation.set(
      earBaseR.x + earBob * 0.075 + sp.earTilt * 0.45 + rightTwitch,
      earBaseR.y,
      earBaseR.z - earBob * 0.095 - earPopLift + sp.earTilt - rightTwitch * 0.7
    );
    character.leftBunnyEarPivot.rotation.set(
      earBaseL.x - earBob * 0.055 + sp.earTilt * 0.35 + leftTwitch,
      earBaseL.y,
      earBaseL.z + earBob * 0.072 + earPopLift * 0.8 + sp.earTilt * 0.85 + leftTwitch * 0.7
    );

    // Hair & tail gentle sway + secondary spring-damper lag (reacts to bounce & turntable spin)
    character.backHairPivot.rotation.x = sway * 0.028 + breathe * 0.01 + sp.hairPitch * 0.65;
    character.backHairPivot.rotation.y = sp.hairYaw * 0.9;
    character.backHairPivot.rotation.z = -sp.hairYaw * 0.35;
    character.leftSideHairPivot.rotation.z = sway * 0.022 + sp.hairYaw * 0.55;
    character.leftSideHairPivot.rotation.x = sp.hairPitch * 0.4;
    character.rightSideHairPivot.rotation.z = -sway * 0.022 + sp.hairYaw * 0.55;
    character.rightSideHairPivot.rotation.x = sp.hairPitch * 0.4;
    character.tailPivot.rotation.y = sway * 0.08 + wiggle * 0.28 + sp.hairYaw * 0.7;

    // Left arm: interpolate smoothly between active pose welcome gesture, blown-kiss, high-five, wave, or ear-tuck
    const handFloat = state.frozen ? 0 : Math.sin(t * 2.1 - 0.8) * 0.035 * (1 - state.kissMix);
    lerpEuler(_baseKissArm, p.kissArmRot, p.standKissArmRot, standW);
    lerpEuler(_baseKissElbow, p.kissElbowRot, p.standKissElbowRot, standW);
    lerpEuler(_baseKissWrist, p.kissWristRot, p.standKissWristRot, standW);
    lerpEuler(character.leftArmPivot.rotation, _baseLeftArm, _baseKissArm, state.kissMix);
    lerpEuler(character.leftElbowPivot.rotation, _baseLeftElbow, _baseKissElbow, state.kissMix);
    lerpEuler(character.leftWristPivot.rotation, _baseLeftWrist, _baseKissWrist, state.kissMix);

    if (highFiveLift > 0) {
      character.leftArmPivot.rotation.x -= highFiveLift * 0.52;
      character.leftArmPivot.rotation.z -= highFiveLift * 0.20;
      character.leftElbowPivot.rotation.x -= highFiveLift * 0.28;
      character.leftWristPivot.rotation.z -= highFiveLift * 0.24;
    }

    if (gType === 'waveHand' || gType === 'appealWave') {
      const waveBeats = gType === 'appealWave' ? 5 : 4;
      const waveOsc = Math.sin(gU * Math.PI * waveBeats) * gEnv;
      const lift = gType === 'appealWave' ? 0.56 : 0.38;
      character.leftArmPivot.rotation.x -= gEnv * lift;
      character.leftArmPivot.rotation.z += gEnv * 0.14;
      character.leftElbowPivot.rotation.x -= gEnv * 0.32;
      character.leftElbowPivot.rotation.z += waveOsc * 0.22;
      character.leftWristPivot.rotation.z += waveOsc * 0.32;
    } else if (gType === 'earTuck') {
      const tuckW = Math.pow(gEnv, 0.85) * (1 - state.kissMix);
      character.leftArmPivot.rotation.x = lerp(character.leftArmPivot.rotation.x, -0.98, tuckW);
      character.leftArmPivot.rotation.y = lerp(character.leftArmPivot.rotation.y, 0.22, tuckW);
      character.leftArmPivot.rotation.z = lerp(character.leftArmPivot.rotation.z, 0.52, tuckW);
      character.leftElbowPivot.rotation.x = lerp(character.leftElbowPivot.rotation.x, -1.32, tuckW);
      character.leftElbowPivot.rotation.y = lerp(character.leftElbowPivot.rotation.y, 0.34, tuckW);
      character.leftElbowPivot.rotation.z = lerp(character.leftElbowPivot.rotation.z, -0.52, tuckW);
      character.leftWristPivot.rotation.x = lerp(character.leftWristPivot.rotation.x, 0.16, tuckW);
      character.leftWristPivot.rotation.z = lerp(character.leftWristPivot.rotation.z, 0.28, tuckW);
    } else {
      character.leftArmPivot.rotation.x += handFloat;
      character.leftWristPivot.rotation.z += handFloat * 0.7;
    }

    // 1.5s pop-in entrance animation (small elastic pop -> ear hop -> smile -> welcome arm raise)
    if (!state.frozen && state.intro.active) {
      const u = clamp(state.intro.progress, 0, 1);
      const popT = clamp(u / 0.48, 0, 1);
      const popScale = clamp(lerp(0.06, 1.0, easeOutBack(popT)), 0.05, 1.09);
      character.root.scale.setScalar(popScale);

      const armSweep = easeInOutCubic(clamp((u - 0.32) / 0.56, 0, 1));
      if (armSweep < 1) {
        const restX = character.leftArmPivot.rotation.x + 0.52;
        const restZ = character.leftArmPivot.rotation.z - 0.42;
        character.leftArmPivot.rotation.x = lerp(restX, character.leftArmPivot.rotation.x, armSweep);
        character.leftArmPivot.rotation.z = lerp(restZ, character.leftArmPivot.rotation.z, armSweep);
      }
    } else {
      character.root.scale.setScalar(1);
    }

    glowRimMat.opacity = state.frozen ? 0.68 : 0.56 + 0.16 * Math.sin(t * 1.7);

    updateSprings(dt);

    // Exact pedestal floor clamp: prevents feet or knees from ever dipping below y = 0.002
    character.hipsGroup.updateMatrixWorld(true);
    let minWorldY = Infinity;
    for (const marker of character.floorMarkers) {
      marker.getWorldPosition(_floorWorld);
      if (_floorWorld.y < minWorldY) minWorldY = _floorWorld.y;
    }
    if (minWorldY < 0.002) {
      character.hipsGroup.position.y += 0.002 - minWorldY;
    }

    // Ground shadow scales nicely between wider sitting stance & narrower standing stance
    const shScale = lerp(1.0, 0.78, standW);
    shadowMesh.scale.set(shScale, shScale, 1);

    // Update particles
    if (!state.frozen) {
      heartParticles.update(dt);
      poseSparkles.update(dt);
    }
  }

  // --- URL Params Initialization ---
  const params = new URLSearchParams(window.location.search);
  const initExpr = params.get('expr');
  const initPose = params.get('pose');
  const initRot = params.get('rot');
  const initZoom = params.get('zoom');
  const initFreeze = params.get('freeze');
  const initQuality = params.get('quality');

  if (initQuality && VALID_QUALITIES.has(initQuality)) {
    state.qualityLocked = true;
    state.qualityDone = true;
    applyQuality(initQuality);
  } else {
    applyQuality('high');
  }

  if (initPose && VALID_POSES.has(initPose)) {
    setPose(initPose, true);
  } else {
    setPose('sit', true);
  }
  if (initRot !== null && Number.isFinite(Number(initRot))) {
    setRotation(Number(initRot));
  }
  if (initZoom !== null && Number.isFinite(Number(initZoom))) {
    setZoom(Number(initZoom));
  }
  if (initExpr && VALID_EXPRS.has(initExpr)) {
    setExpression(initExpr, true);
  }

  const startFrozen = initFreeze === '1' || initFreeze === 'true';
  if (startFrozen) {
    setFrozen(true);
    if (loadingOverlay) loadingOverlay.style.display = 'none';
  } else {
    state.intro.active = true;
    state.intro.progress = 0;
    if (loadingOverlay) {
      requestAnimationFrame(() => {
        loadingOverlay.classList.add('is-done');
        setTimeout(() => {
          loadingOverlay.style.display = 'none';
        }, 300);
      });
    }
  }

  // Auto-hide the bottom hint line cleanly after a few seconds
  if (hintText) {
    setTimeout(() => {
      hintText.classList.add('is-hidden');
    }, 4500);
  }

  // --- Expose Test Hook ---
  window.__bunny = {
    get state() {
      return state.frozen ? 'frozen' : state.mode;
    },
    get pose() {
      return state.poseTransition.active ? 'transition' : state.poseTarget;
    },
    get expression() {
      return state.userExpression;
    },
    get fps() {
      return state.fps;
    },
    get quality() {
      return state.quality;
    },
    api: {
      setExpression,
      setPose,
      setRotation,
      setZoom,
      setAutoRotate,
      tap: triggerTapReaction,
      freeze: setFrozen,
      snapshot: captureSnapshotDataUrl,
      stats() {
        return {
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
        };
      },
    },
  };

  // --- Main Render Loop with Visibility Pause & 2s Auto-Quality Tuning ---
  let lastTime = performance.now();
  let fpsAccum = 0;
  let fpsFrames = 0;
  let rafId = null;

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    } else if (rafId === null) {
      lastTime = performance.now();
      rafId = requestAnimationFrame(tick);
    }
  });

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    const rawDt = (now - lastTime) * 0.001;
    lastTime = now;
    const dt = Math.min(0.05, Math.max(0.0001, rawDt));

    // FPS counter (updated every ~0.5s)
    fpsAccum += rawDt;
    fpsFrames++;
    if (fpsAccum >= 0.5) {
      state.fps = Math.round(fpsFrames / fpsAccum);
      fpsAccum = 0;
      fpsFrames = 0;
    }

    // Automatic DPR quality scaling over first ~2s when FPS < 45
    if (!state.qualityDone && !state.qualityLocked && !state.frozen && !document.hidden) {
      state.qualityEvalTimer += rawDt;
      state.qualityEvalFrames++;
      const threshold = state.quality === 'high' ? 2.0 : 1.5;
      if (state.qualityEvalTimer >= threshold) {
        const avgFps = state.qualityEvalFrames / state.qualityEvalTimer;
        if (avgFps < 45) {
          if (state.quality === 'high') {
            applyQuality('mid');
            state.qualityEvalTimer = 0;
            state.qualityEvalFrames = 0;
          } else if (state.quality === 'mid') {
            applyQuality('low');
            state.qualityDone = true;
          } else {
            state.qualityDone = true;
          }
        } else {
          state.qualityDone = true;
        }
      }
    }

    // Turntable inertia & auto-rotate (works even when pose is frozen if user drags)
    if (activePointers.size === 0) {
      if (Math.abs(state.rotVelocity) > 0.001) {
        state.rotationY += state.rotVelocity * dt;
        state.rotVelocity *= Math.exp(-5.5 * dt);
        turntable.rotation.y = state.rotationY;
      } else if (state.autoRotate && !state.frozen) {
        state.rotationY += 0.42 * dt;
        turntable.rotation.y = state.rotationY;
      }
    }

    if (!state.frozen) {
      state.time += dt;
      state.idleSinceInput += dt;

      // 1.5s pop-in entrance choreography
      if (state.intro.active) {
        state.intro.progress += dt / state.intro.duration;
        const u = state.intro.progress;
        if (u >= 0.16 && !state.intro.sparkleDone) {
          state.intro.sparkleDone = true;
          state.earPop = 0.85;
          poseSparkles.emit(lerp(0.88, 1.18, state.poseMix));
        }
        if (u >= 0.22 && !state.intro.smileDone && state.userExpression === 'normal' && !state.tapExpr) {
          state.intro.smileDone = true;
          state.tapExpr = 'smile';
          startExprTransition('normal', 'smile');
        }
        if (u >= 0.78 && !state.intro.smileEndDone) {
          state.intro.smileEndDone = true;
          if (state.tapExpr === 'smile' && state.tapExprTimer <= 0) {
            state.tapExpr = null;
            startExprTransition('smile', state.userExpression);
          }
        }
        if (u >= 1) {
          state.intro.active = false;
          state.intro.progress = 1;
        }
      }

      // Pose transition timeline (~1.0s choreographed sit <-> stand)
      if (state.poseTransition.active) {
        state.poseTransition.progress += dt / state.poseTransition.duration;
        if (state.poseTransition.progress >= 1) {
          state.poseTransition.progress = 1;
          state.poseTransition.active = false;
          state.poseMix = state.poseTransition.to === 'stand' ? 1 : 0;
        } else {
          const u = easeInOutCubic(state.poseTransition.progress);
          const fromVal = state.poseTransition.from === 'stand' ? 1 : 0;
          const toVal = state.poseTransition.to === 'stand' ? 1 : 0;
          state.poseMix = lerp(fromVal, toVal, u);
        }
        applyCameraZoom();
      }

      // Tap reaction decays
      if (state.earPop > 0) state.earPop = Math.max(0, state.earPop - dt * 1.9);
      if (state.blushBoost > 0) state.blushBoost = Math.max(0, state.blushBoost - dt * 0.45);
      if (state.wigglePop > 0) state.wigglePop = Math.max(0, state.wigglePop - dt * 1.3);
      if (state.highFivePop > 0) state.highFivePop = Math.max(0, state.highFivePop - dt * 1.5);

      if (state.tapExprTimer > 0) {
        state.tapExprTimer -= dt;
        if (state.tapExprTimer <= 0) {
          const prev = state.tapExpr || state.userExpression;
          state.tapExpr = null;
          state.tapExprTimer = 0;
          startExprTransition(prev, state.userExpression);
        }
      }

      // Random idle gesture scheduler + 20s "こっち見て" camera appeal
      if (state.gesture.active) {
        state.gesture.progress += dt / state.gesture.duration;
        if (state.gesture.type === 'appealWave' && !state.autoRotate && activePointers.size === 0) {
          let diff = -state.rotationY;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          state.rotationY += diff * Math.min(1, dt * 3.2);
          turntable.rotation.y = state.rotationY;
        }
        if (state.gesture.progress >= 1) {
          state.gesture.active = false;
          state.gesture.progress = 0;
        }
      } else if (state.mode === 'idle' && !state.poseTransition.active && !state.intro.active) {
        if (!state.appealDoneThisStretch && state.idleSinceInput >= 20 && !prefersReducedMotion) {
          state.appealDoneThisStretch = true;
          startIdleGesture('appealWave', 1);
          state.nextGestureIn = 8.0;
        } else {
          state.nextGestureIn -= dt;
          if (state.nextGestureIn <= 0) {
            state.nextGestureIn = prefersReducedMotion
              ? 13.0 + Math.random() * 6.0
              : 6.0 + Math.random() * 5.0;
            const pool = prefersReducedMotion
              ? ['headTilt', 'waveHand']
              : ['headTilt', 'waveHand', 'earTwitch', 'happyBounce'];
            if (!prefersReducedMotion && state.poseMix > 0.9) pool.push('earTuck');
            const filtered = pool.filter((g) => g !== state.lastGesture);
            const pick = filtered[Math.floor(Math.random() * filtered.length)];
            const dir = Math.random() < 0.5 ? -1 : 1;
            startIdleGesture(pick, dir);
          }
        }
      }

      // Kiss animation timeline (auto-returns to normal after ~2.6s)
      if (state.userExpression === 'kiss') {
        state.kissTimer += dt;
        state.kissMix = Math.min(1, state.kissMix + dt * 5.2);
        if (state.kissTimer > 0.45 && !state.kissBurstDone) {
          state.kissBurstDone = true;
          heartParticles.emitBurst(getKissOrigin(), 5);
        }
        if (state.kissTimer >= 2.7) {
          setExpression('normal');
        }
      } else {
        state.kissMix = Math.max(0, state.kissMix - dt * 4.5);
      }

      bgSparkles.update(state.time);

      // Smooth 0.12s eye close -> open animation for expression transitions
      let displayExpr = state.tapExpr || state.userExpression;
      let lidClose = 0;

      if (state.exprTrans.active) {
        state.exprTrans.progress += dt / state.exprTrans.duration;
        if (state.exprTrans.progress >= 1) {
          state.exprTrans.active = false;
          state.exprTrans.progress = 1;
          state.renderedExpr = state.exprTrans.to;
          displayExpr = state.exprTrans.to;
          lidClose = 0;
        } else if (state.exprTrans.progress < 0.5) {
          displayExpr = state.exprTrans.from;
          lidClose = state.exprTrans.progress * 2;
        } else {
          displayExpr = state.exprTrans.to;
          lidClose = (1 - state.exprTrans.progress) * 2;
        }
      } else if (displayExpr === 'normal') {
        // Automatic random blink (2 to 6s) with smooth eye close curve
        if (state.blinkTimer > 0) {
          state.blinkTimer -= dt;
          const u = clamp(1 - state.blinkTimer / 0.14, 0, 1);
          lidClose = Math.sin(u * Math.PI);
          if (lidClose > 0.88) displayExpr = 'blink';
        } else {
          state.nextBlinkIn -= dt;
          if (state.nextBlinkIn <= 0) {
            state.blinkTimer = 0.14;
            state.nextBlinkIn = 2.0 + Math.random() * 4.0;
          }
        }
      }

      faceCtrl.update(displayExpr, state.blushBoost, lidClose);
      applyPose(dt);
    }

    renderer.render(scene, camera);
  }

  rafId = requestAnimationFrame(tick);
}

init();
