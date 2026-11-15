// Procedural three.js v5 bunny, loaded as code (not glb) into the shared viewer scene.
// Keeps the original toon materials, blink, breathing/sway idle, and sit/stand poses.
import * as THREE from 'three';
import { createCharacterMaterials } from './src/toon.js';
import { FaceTextureController, createFishnetTexture } from './src/textures.js';
import { createBunnyCharacter } from './src/character.js';

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

function stepSpring(value, vel, target, stiffness, damping, dt) {
  const acc = (target - value) * stiffness - vel * damping;
  const nextVel = vel + acc * dt;
  const nextVal = value + nextVel * dt;
  return [nextVal, nextVel];
}

export function createThreeJsBunny() {
  const faceCtrl = new FaceTextureController();
  const fishnetTex = createFishnetTexture();
  const materials = createCharacterMaterials(fishnetTex);
  const character = createBunnyCharacter(materials, faceCtrl.texture);

  const root = new THREE.Group();
  root.name = 'threejs_v5_bunny';
  root.add(character.root);

  const _baseLeftArm = new THREE.Euler();
  const _baseLeftElbow = new THREE.Euler();
  const _baseLeftWrist = new THREE.Euler();
  const _floorWorld = new THREE.Vector3();

  const state = {
    time: 0,
    poseTarget: 'sit',
    poseMix: 0,
    poseTransition: { active: false, from: 'sit', to: 'stand', progress: 0, duration: 1.0 },
    nextBlinkIn: 2.8,
    blinkTimer: 0,
    springs: {
      hairYaw: 0,
      hairYawVel: 0,
      hairPitch: 0,
      hairPitchVel: 0,
      earTilt: 0,
      earTiltVel: 0,
      prevY: 0,
    },
  };

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

  function updateSprings(dt) {
    const sp = state.springs;
    if (dt <= 0) {
      sp.prevY = character.hipsGroup.position.y;
      return;
    }
    const dy = (character.hipsGroup.position.y - sp.prevY) / dt;
    sp.prevY = character.hipsGroup.position.y;
    const targetPitch = clamp(-dy * 0.08, -0.18, 0.18);
    const targetEarTilt = clamp(-dy * 0.14, -0.26, 0.26);
    [sp.hairPitch, sp.hairPitchVel] = stepSpring(sp.hairPitch, sp.hairPitchVel, targetPitch, 58, 7.8, dt);
    [sp.earTilt, sp.earTiltVel] = stepSpring(sp.earTilt, sp.earTiltVel, targetEarTilt, 72, 6.8, dt);
    [sp.hairYaw, sp.hairYawVel] = stepSpring(sp.hairYaw, sp.hairYawVel, 0, 40, 8.2, dt);
  }

  function applyIdle(dt) {
    const t = state.time;
    const p = character.poses;
    const standW = state.poseMix;
    const inTrans = state.poseTransition.active;
    evaluateRigPose();

    const breathe = Math.sin(t * 2.1);
    const sway = Math.sin(t * 1.18);
    const earBob = Math.sin(t * 3.1) + Math.sin(t * 6.2) * 0.25;
    const standBounce =
      Math.pow(Math.max(0, Math.sin(t * 0.92)), 10) * 0.8 * standW * (1 - (inTrans ? 0.8 : 0));
    const standSway = sway * standW * (inTrans ? 0.25 : 1);

    character.hipsGroup.position.x += standSway * 0.018;
    character.hipsGroup.position.y += standBounce * 0.024;
    character.hipsGroup.rotation.z += standSway * 0.024;
    character.rightLeg.kneePivot.rotation.x += standBounce * 0.14;
    character.leftLeg.kneePivot.rotation.x += standBounce * 0.14;
    character.rightLeg.anklePivot.rotation.x -= standBounce * 0.10;
    character.leftLeg.anklePivot.rotation.x -= standBounce * 0.12;

    character.torsoPivot.position.y = 0.43 + breathe * 0.009;
    character.torsoPivot.rotation.x += breathe * 0.014;
    character.torsoPivot.rotation.z += sway * 0.012 - standSway * 0.020;
    character.headPivot.rotation.x += breathe * 0.016;
    character.headPivot.rotation.y += sway * 0.025;
    character.headPivot.rotation.z += sway * 0.02;

    const sp = state.springs;
    const earBaseR = p.sit.rightEarRot;
    const earBaseL = p.sit.leftEarRot;
    character.rightBunnyEarPivot.rotation.set(
      earBaseR.x + earBob * 0.075 + sp.earTilt * 0.45,
      earBaseR.y,
      earBaseR.z - earBob * 0.095 + sp.earTilt
    );
    character.leftBunnyEarPivot.rotation.set(
      earBaseL.x - earBob * 0.055 + sp.earTilt * 0.35,
      earBaseL.y,
      earBaseL.z + earBob * 0.072 + sp.earTilt * 0.85
    );
    character.backHairPivot.rotation.x = sway * 0.028 + breathe * 0.01 + sp.hairPitch * 0.65;
    character.backHairPivot.rotation.y = sp.hairYaw * 0.9;
    character.backHairPivot.rotation.z = -sp.hairYaw * 0.35;
    character.leftSideHairPivot.rotation.z = sway * 0.022 + sp.hairYaw * 0.55;
    character.leftSideHairPivot.rotation.x = sp.hairPitch * 0.4;
    character.rightSideHairPivot.rotation.z = -sway * 0.022 + sp.hairYaw * 0.55;
    character.rightSideHairPivot.rotation.x = sp.hairPitch * 0.4;
    character.tailPivot.rotation.y = sway * 0.08 + sp.hairYaw * 0.7;

    const handFloat = Math.sin(t * 2.1 - 0.8) * 0.035;
    character.leftArmPivot.rotation.copy(_baseLeftArm);
    character.leftElbowPivot.rotation.copy(_baseLeftElbow);
    character.leftWristPivot.rotation.copy(_baseLeftWrist);
    character.leftArmPivot.rotation.x += handFloat;
    character.leftWristPivot.rotation.z += handFloat * 0.7;

    updateSprings(dt);

    character.hipsGroup.updateMatrixWorld(true);
    let minWorldY = Infinity;
    for (const marker of character.floorMarkers) {
      marker.getWorldPosition(_floorWorld);
      root.worldToLocal(_floorWorld);
      if (_floorWorld.y < minWorldY) minWorldY = _floorWorld.y;
    }
    if (minWorldY < 0.002) {
      character.hipsGroup.position.y += 0.002 - minWorldY;
    }
  }

  function updateBlink(dt) {
    let displayExpr = 'normal';
    let lidClose = 0;
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
    faceCtrl.update(displayExpr, 0, lidClose);
  }

  function setPose(poseName, instant = false) {
    const next = poseName === 'stand' ? 'stand' : 'sit';
    const currentlyStand = state.poseMix >= 0.5;
    const currentPose = currentlyStand ? 'stand' : 'sit';
    state.poseTarget = next;
    if (instant || next === currentPose) {
      state.poseTransition.active = false;
      state.poseTransition.progress = 1;
      state.poseMix = next === 'stand' ? 1 : 0;
      return;
    }
    state.poseTransition.active = true;
    state.poseTransition.from = currentPose;
    state.poseTransition.to = next;
    state.poseTransition.progress = 0;
  }

  function update(dt) {
    const capped = clamp(dt, 0, 0.05);
    state.time += capped;
    if (state.poseTransition.active) {
      state.poseTransition.progress += capped / state.poseTransition.duration;
      if (state.poseTransition.progress >= 1) {
        state.poseTransition.active = false;
        state.poseTransition.progress = 1;
        state.poseMix = state.poseTransition.to === 'stand' ? 1 : 0;
      } else {
        const u = easeInOutCubic(state.poseTransition.progress);
        state.poseMix = state.poseTransition.from === 'stand' ? 1 - u : u;
      }
    }
    updateBlink(capped);
    applyIdle(capped);
  }

  function dispose() {
    root.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
    if (faceCtrl.texture) faceCtrl.texture.dispose();
    if (fishnetTex) fishnetTex.dispose();
  }

  // Start in sit pose so the first frame is not a rest bind.
  setPose('sit', true);
  applyIdle(0);

  return {
    root,
    setPose,
    update,
    dispose,
    poses: ['sit', 'stand'],
  };
}
