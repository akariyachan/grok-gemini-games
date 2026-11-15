import * as THREE from 'three';
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

const VALID_EXPRS = new Set(['normal', 'blink', 'half', 'kiss']);
const VALID_POSES = new Set(['sit', 'stand']);

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
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
  const exprButtons = Array.from(document.querySelectorAll('.expr-btn'));
  const poseButtons = Array.from(document.querySelectorAll('.pose-btn'));
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
  const lookTarget = new THREE.Vector3(0, 1.02, 0);

  // --- Lighting (Pastel Hemisphere + Key + Pink-Lavender Rim Light) ---
  const hemiLight = new THREE.HemisphereLight(0xfff6ff, 0x926ab8, 1.36);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff5f0, 1.18);
  keyLight.position.set(2.3, 3.6, 3.8);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xffd0f6, 0.92);
  rimLight.position.set(-2.3, 2.8, -2.8);
  scene.add(rimLight);

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

  // --- Character & Particles ---
  const character = createBunnyCharacter(materials, faceCtrl.texture);
  turntable.add(character.root);

  const bgSparkles = new BackgroundSparkles(scene, bokehTex);
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

  function updateCameraFraming() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = Math.max(0.3, w / Math.max(1, h));

    renderer.setSize(w, h, false);
    camera.aspect = aspect;
    applyCameraZoom();
    camera.updateProjectionMatrix();
  }

  function applyCameraZoom() {
    computeCameraDistance();
    const dist = state.baseCamDist / state.zoom;
    const baseLookY = lerp(1.02, 1.24, state.poseMix);
    const zoomUp = Math.max(0, state.zoom - 1.0) * 0.44;
    lookTarget.set(0, baseLookY + zoomUp, 0);
    camera.position.set(0, lookTarget.y + dist * 0.08, dist);
    camera.lookAt(lookTarget);
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

  function setExpression(name) {
    const next = VALID_EXPRS.has(name) ? name : 'normal';
    state.userExpression = next;
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
      setExpression(btn.dataset.expr);
    });
  }

  for (const btn of poseButtons) {
    btn.addEventListener('click', () => {
      setPose(btn.dataset.pose, false);
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
    const earPopLift = state.frozen ? 0 : Math.sin(state.earPop * Math.PI) * 0.30;

    // Standing idle extras: slow weight shift + occasional playful knee bend & tiptoe bounce
    const standBounce = state.frozen ? 0 : Math.pow(Math.max(0, Math.sin(t * 0.92)), 10) * standW * (1 - (inTrans ? 0.8 : 0));
    const standSway = state.frozen ? 0 : sway * standW * (inTrans ? 0.25 : 1);

    character.hipsGroup.position.x += standSway * 0.018;
    character.hipsGroup.position.y += standBounce * 0.022;
    character.hipsGroup.rotation.z += standSway * 0.024;
    character.rightLeg.kneePivot.rotation.x += standBounce * 0.14;
    character.leftLeg.kneePivot.rotation.x += standBounce * 0.14;
    character.rightLeg.anklePivot.rotation.x -= standBounce * 0.10;
    character.leftLeg.anklePivot.rotation.x -= standBounce * 0.12;

    character.torsoPivot.position.y = 0.43 + breathe * 0.009 + Math.abs(wiggle) * 0.01;
    character.torsoPivot.rotation.x += breathe * 0.014;
    character.torsoPivot.rotation.y += wiggle * 0.08;
    character.torsoPivot.rotation.z += sway * 0.012 - standSway * 0.020;

    // Head sway + kiss head tilt + shy blush dip
    const kissTilt = state.kissMix * 0.07;
    const shyDip = state.frozen ? 0 : state.blushBoost * 0.06;
    character.headPivot.rotation.x += breathe * 0.016 + shyDip;
    character.headPivot.rotation.y += sway * 0.025 + wiggle * 0.06;
    character.headPivot.rotation.z += sway * 0.02 + kissTilt;

    // Livelier bunny ears wiggle + tap/transition ear pop
    const earBaseR = p.sit.rightEarRot;
    const earBaseL = p.sit.leftEarRot;
    character.rightBunnyEarPivot.rotation.set(
      earBaseR.x + earBob * 0.075,
      earBaseR.y,
      earBaseR.z - earBob * 0.095 - earPopLift
    );
    character.leftBunnyEarPivot.rotation.set(
      earBaseL.x - earBob * 0.055,
      earBaseL.y,
      earBaseL.z + earBob * 0.072 + earPopLift * 0.8
    );

    // Hair & tail gentle sway
    character.backHairPivot.rotation.x = sway * 0.028 + breathe * 0.01 + standBounce * 0.06;
    character.leftSideHairPivot.rotation.z = sway * 0.022;
    character.rightSideHairPivot.rotation.z = -sway * 0.022;
    character.tailPivot.rotation.y = sway * 0.08 + wiggle * 0.28;

    // Left arm: interpolate smoothly between active pose welcome gesture and blown-kiss pose
    const handFloat = state.frozen ? 0 : Math.sin(t * 2.1 - 0.8) * 0.035 * (1 - state.kissMix);
    lerpEuler(_baseKissArm, p.kissArmRot, p.standKissArmRot, standW);
    lerpEuler(_baseKissElbow, p.kissElbowRot, p.standKissElbowRot, standW);
    lerpEuler(_baseKissWrist, p.kissWristRot, p.standKissWristRot, standW);
    lerpEuler(character.leftArmPivot.rotation, _baseLeftArm, _baseKissArm, state.kissMix);
    lerpEuler(character.leftElbowPivot.rotation, _baseLeftElbow, _baseKissElbow, state.kissMix);
    lerpEuler(character.leftWristPivot.rotation, _baseLeftWrist, _baseKissWrist, state.kissMix);
    character.leftArmPivot.rotation.x += handFloat;
    character.leftWristPivot.rotation.z += handFloat * 0.7;

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
    get pose() {
      return state.poseTransition.active ? 'transition' : state.poseTarget;
    },
    get expression() {
      return state.userExpression;
    },
    get fps() {
      return state.fps;
    },
    api: {
      setExpression,
      setPose,
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
