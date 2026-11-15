import * as THREE from 'three';
import { createCharacterMaterials } from './toon.js';
import {
  FaceTextureController,
  createFishnetTexture,
  createHeartTexture,
  createShadowTexture,
} from './textures.js';
import { createBunnyCharacter } from './character.js';
import { HeartParticleSystem } from './particles.js';

const VALID_EXPRS = new Set(['normal', 'blink', 'half', 'kiss']);

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpEuler(target, a, b, t) {
  target.x = lerp(a.x, b.x, t);
  target.y = lerp(a.y, b.y, t);
  target.z = lerp(a.z, b.z, t);
}

function init() {
  const canvas = document.getElementById('stage');
  const exprButtons = Array.from(document.querySelectorAll('.expr-btn'));
  const autoRotateBtn = document.getElementById('btn-autorotate');
  const toastEl = document.getElementById('reaction-toast');

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
  const lookTarget = new THREE.Vector3(0, 0.96, 0);

  // --- Lighting (Hemisphere + 2 Directional lights, no shadow maps) ---
  const hemiLight = new THREE.HemisphereLight(0xfff4ff, 0x4b2f6e, 1.32);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff6ee, 1.32);
  keyLight.position.set(2.4, 3.8, 3.6);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xc79eff, 0.48);
  rimLight.position.set(-2.6, 2.4, -2.8);
  scene.add(rimLight);

  // --- Textures & Materials ---
  const faceCtrl = new FaceTextureController();
  const fishnetTex = createFishnetTexture();
  const shadowTex = createShadowTexture();
  const heartTex = createHeartTexture();
  const materials = createCharacterMaterials(fishnetTex);

  // --- Turntable (Character + Pedestal rotate together) ---
  const turntable = new THREE.Group();
  turntable.name = 'turntable_group';
  scene.add(turntable);

  // Circular Figure Pedestal
  const pedestalGroup = new THREE.Group();
  pedestalGroup.name = 'pedestal_group';

  const baseGeo = new THREE.CylinderGeometry(0.88, 0.96, 0.11, 44);
  const baseMat = new THREE.MeshToonMaterial({
    color: 0x281b40,
    gradientMap: materials.gradients.softGradient,
  });
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.position.y = -0.055;
  pedestalGroup.add(baseMesh);

  const rimGeo = new THREE.TorusGeometry(0.88, 0.016, 10, 44);
  rimGeo.rotateX(Math.PI * 0.5);
  const rimMat = new THREE.MeshToonMaterial({
    color: 0x9b6ed4,
    gradientMap: materials.gradients.crispGradient,
  });
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  rimMesh.position.y = -0.002;
  pedestalGroup.add(rimMesh);

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

  // --- Character ---
  const character = createBunnyCharacter(materials, faceCtrl.texture);
  turntable.add(character.root);

  // Heart particles attached to turntable so they orient nicely with the character
  const heartParticles = new HeartParticleSystem(turntable, heartTex);
  const kissOrigin = new THREE.Vector3(0.14, 1.24, 0.36);

  // --- State ---
  const state = {
    mode: 'idle',
    userExpression: 'normal',
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

    // Kiss sequence
    kissTimer: 0,
    kissMix: 0,
    kissBurstDone: false,

    // Tap reactions
    earPop: 0,
    blushBoost: 0,
    wigglePop: 0,
    toastTimer: null,
  };

  // --- Responsive Framing ---
  function updateCameraFraming() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = Math.max(0.3, w / Math.max(1, h));

    renderer.setSize(w, h, false);
    camera.aspect = aspect;

    // Fit full height (pedestal to ear tips + UI margins) on both 390x844 mobile and 1280x800 PC
    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    const halfTan = Math.tan(fovRad * 0.5);
    const distVert = 2.98 / (2 * halfTan);
    const distHoriz = 1.72 / (2 * halfTan * aspect);
    state.baseCamDist = Math.max(distVert, distHoriz);

    applyCameraZoom();
    camera.updateProjectionMatrix();
  }

  function applyCameraZoom() {
    const dist = state.baseCamDist / state.zoom;
    camera.position.set(0, 0.96 + dist * 0.085, dist);
    camera.lookAt(lookTarget);
  }

  window.addEventListener('resize', updateCameraFraming);
  updateCameraFraming();

  // --- UI & Expressions ---
  function syncExprButtons() {
    for (const btn of exprButtons) {
      btn.classList.toggle('active', btn.dataset.expr === state.userExpression);
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

  function setExpression(name) {
    const next = VALID_EXPRS.has(name) ? name : 'normal';
    state.userExpression = next;
    state.blinkTimer = 0;

    if (next === 'kiss') {
      state.mode = 'kiss';
      state.kissTimer = 0;
      state.kissBurstDone = false;
      if (state.frozen) {
        state.kissMix = 1;
        heartParticles.showStaticKissPreview(kissOrigin);
      } else {
        heartParticles.emitBurst(kissOrigin, 4);
      }
    } else {
      state.mode = 'idle';
      if (state.frozen) {
        state.kissMix = 0;
        heartParticles.clear();
      }
    }

    syncExprButtons();
    faceCtrl.update(next, state.blushBoost);
    applyPose(0);
  }

  function setRotation(yRadians) {
    if (Number.isFinite(yRadians)) {
      state.rotationY = yRadians;
      state.rotVelocity = 0;
      turntable.rotation.y = yRadians;
    }
  }

  function setZoom(z) {
    if (Number.isFinite(z)) {
      state.zoom = clamp(z, 0.75, 1.55);
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

  function triggerTapReaction() {
    const reactions = ['earPop', 'blush', 'happyWiggle'];
    const choice = reactions[Math.floor(Math.random() * reactions.length)];
    if (choice === 'earPop') {
      state.earPop = 1.0;
      showToast('ぴょこん♪');
    } else if (choice === 'blush') {
      state.blushBoost = 1.0;
      showToast('えへへ…♪');
    } else {
      state.wigglePop = 1.0;
      showToast('いらっしゃいませ♪');
    }
  }

  function setFrozen(flag) {
    state.frozen = Boolean(flag);
    if (state.frozen) {
      if (state.userExpression === 'kiss') {
        state.kissMix = 1;
        heartParticles.showStaticKissPreview(kissOrigin);
      } else {
        state.kissMix = 0;
        heartParticles.clear();
      }
      applyPose(0);
    }
  }

  for (const btn of exprButtons) {
    btn.addEventListener('click', () => {
      setExpression(btn.dataset.expr);
    });
  }

  if (autoRotateBtn) {
    autoRotateBtn.addEventListener('click', () => {
      setAutoRotate(!state.autoRotate);
    });
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
        // Raycast against character to confirm tap hit
        const rect = canvas.getBoundingClientRect();
        pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointerNDC, camera);
        const hits = raycaster.intersectObject(character.root, true);
        if (hits.length > 0) {
          triggerTapReaction();
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
      const factor = Math.exp(-e.deltaY * 0.0011);
      setZoom(state.zoom * factor);
    },
    { passive: false }
  );

  // --- Pose & Idle Animation Evaluator ---
  function applyPose(dt) {
    const t = state.time;
    const p = character.poses;

    // 1. Breathing & subtle idle motion (zeroed out when frozen)
    const breathe = state.frozen ? 0 : Math.sin(t * 2.1);
    const sway = state.frozen ? 0 : Math.sin(t * 1.25);
    const earBob = state.frozen ? 0 : Math.sin(t * 2.9);
    const wiggle = state.frozen ? 0 : Math.sin(t * 14.0) * state.wigglePop;
    const earPopLift = state.frozen ? 0 : Math.sin(state.earPop * Math.PI) * 0.24;

    character.torsoPivot.position.y = 0.44 + breathe * 0.009 + Math.abs(wiggle) * 0.01;
    character.torsoPivot.rotation.set(
      p.torsoBase.x + breathe * 0.014,
      p.torsoBase.y + wiggle * 0.08,
      p.torsoBase.z + sway * 0.012
    );

    // Head sway + kiss head tilt + shy blush dip
    const kissTilt = state.kissMix * 0.07;
    const shyDip = state.frozen ? 0 : state.blushBoost * 0.06;
    character.headPivot.rotation.set(
      p.headBase.x + breathe * 0.016 + shyDip,
      p.headBase.y + sway * 0.025 + wiggle * 0.06,
      p.headBase.z + sway * 0.02 + kissTilt
    );

    // Bunny ears wiggle + tap ear pop
    character.rightBunnyEarPivot.rotation.set(
      p.rightEarBase.x + earBob * 0.045,
      p.rightEarBase.y,
      p.rightEarBase.z - earBob * 0.055 - earPopLift
    );
    character.leftBunnyEarPivot.rotation.set(
      p.leftEarBase.x - earBob * 0.035,
      p.leftEarBase.y,
      p.leftEarBase.z + earBob * 0.04 + earPopLift * 0.75
    );

    // Hair gentle sway
    character.backHairPivot.rotation.x = sway * 0.028 + breathe * 0.01;
    character.leftSideHairPivot.rotation.z = sway * 0.022;
    character.rightSideHairPivot.rotation.z = -sway * 0.022;

    // Tail wag
    character.tailPivot.rotation.y = sway * 0.08 + wiggle * 0.28;

    // Left arm: interpolate smoothly between welcome gesture and blown-kiss pose
    const handFloat = state.frozen ? 0 : Math.sin(t * 2.1 - 0.8) * 0.035 * (1 - state.kissMix);
    lerpEuler(character.leftArmPivot.rotation, p.welcomeArmRot, p.kissArmRot, state.kissMix);
    lerpEuler(character.leftElbowPivot.rotation, p.welcomeElbowRot, p.kissElbowRot, state.kissMix);
    lerpEuler(character.leftWristPivot.rotation, p.welcomeWristRot, p.kissWristRot, state.kissMix);
    character.leftArmPivot.rotation.x += handFloat;
    character.leftWristPivot.rotation.z += handFloat * 0.7;

    // Update particles
    if (!state.frozen) {
      heartParticles.update(dt);
    }
  }

  // --- URL Params Initialization ---
  const params = new URLSearchParams(window.location.search);
  const initExpr = params.get('expr');
  const initRot = params.get('rot');
  const initZoom = params.get('zoom');
  const initFreeze = params.get('freeze');

  if (initRot !== null && Number.isFinite(Number(initRot))) {
    setRotation(Number(initRot));
  }
  if (initZoom !== null && Number.isFinite(Number(initZoom))) {
    setZoom(Number(initZoom));
  }
  if (initExpr && VALID_EXPRS.has(initExpr)) {
    setExpression(initExpr);
  }
  if (initFreeze === '1' || initFreeze === 'true') {
    setFrozen(true);
  }

  // --- Expose Test Hook ---
  window.__bunny = {
    get state() {
      return state.frozen ? 'frozen' : state.mode;
    },
    get expression() {
      return state.userExpression;
    },
    get fps() {
      return state.fps;
    },
    api: {
      setExpression,
      setRotation,
      setZoom,
      setAutoRotate,
      tap: triggerTapReaction,
      freeze: setFrozen,
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

  // --- Main Render Loop ---
  let lastTime = performance.now();
  let fpsAccum = 0;
  let fpsFrames = 0;

  function tick(now) {
    requestAnimationFrame(tick);
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

      // Tap reaction decays
      if (state.earPop > 0) state.earPop = Math.max(0, state.earPop - dt * 1.9);
      if (state.blushBoost > 0) state.blushBoost = Math.max(0, state.blushBoost - dt * 0.45);
      if (state.wigglePop > 0) state.wigglePop = Math.max(0, state.wigglePop - dt * 1.3);

      // Kiss animation timeline (auto-returns to normal after ~2.6s)
      if (state.userExpression === 'kiss') {
        state.kissTimer += dt;
        state.kissMix = Math.min(1, state.kissMix + dt * 5.2);
        if (state.kissTimer > 0.45 && !state.kissBurstDone) {
          state.kissBurstDone = true;
          heartParticles.emitBurst(kissOrigin, 6);
        }
        if (state.kissTimer >= 2.7) {
          setExpression('normal');
        }
      } else {
        state.kissMix = Math.max(0, state.kissMix - dt * 4.5);
      }

      // Automatic random blink (2 to 6s) when expression is 'normal'
      let displayExpr = state.userExpression;
      if (state.userExpression === 'normal') {
        if (state.blinkTimer > 0) {
          state.blinkTimer -= dt;
          displayExpr = 'blink';
        } else {
          state.nextBlinkIn -= dt;
          if (state.nextBlinkIn <= 0) {
            state.blinkTimer = 0.14;
            state.nextBlinkIn = 2.0 + Math.random() * 4.0;
            displayExpr = 'blink';
          }
        }
      }

      faceCtrl.update(displayExpr, state.blushBoost);
      applyPose(dt);
    }

    renderer.render(scene, camera);
  }

  requestAnimationFrame(tick);
}

init();
