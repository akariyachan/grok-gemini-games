import * as THREE from 'three';
import { attachOutline, mergeGroupByMaterial } from './toon.js';

/**
 * Shared round chibi head deformation (fuller cheeks, softer smaller chin).
 */
function deformChibiHeadPoint(v) {
  const out = v.clone();
  out.x *= 1.11;
  out.y *= 0.94;
  out.z *= 0.96;

  if (out.y < 0.06) {
    const t = Math.min(1, (0.06 - out.y) / 0.42);
    const cheekBulge = Math.sin(t * Math.PI * 0.88) * 0.042;
    out.x *= 1 + cheekBulge * 1.4;
    if (out.z > 0) {
      out.z += cheekBulge * 0.36 * (1 - t * 0.45);
    }
    if (t > 0.68) {
      const chinT = (t - 0.68) / 0.32;
      out.y += chinT * 0.032;
    }
  }
  return out;
}

function createChibiHeadGeometry(radius = 0.42) {
  const geo = new THREE.SphereGeometry(radius, 28, 22);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = deformChibiHeadPoint(v);
    pos.setXYZ(i, d.x, d.y, d.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Curved spherical patch matching the front of the chibi head for large anime facial decals.
 */
function createFaceDecalGeometry(radius = 0.42) {
  const segsW = 24;
  const segsH = 20;
  const thetaSpan = 1.62;
  const phiMin = Math.PI * 0.25;
  const phiMax = Math.PI * 0.79;

  const positions = [];
  const uvs = [];
  const indices = [];

  for (let iy = 0; iy <= segsH; iy++) {
    const vCoord = iy / segsH;
    const phi = phiMin + vCoord * (phiMax - phiMin);

    for (let ix = 0; ix <= segsW; ix++) {
      const uCoord = ix / segsW;
      const theta = (uCoord - 0.5) * thetaSpan;

      const x = radius * Math.sin(phi) * Math.sin(theta);
      const y = radius * Math.cos(phi);
      const z = radius * Math.sin(phi) * Math.cos(theta);

      const d = deformChibiHeadPoint(new THREE.Vector3(x, y, z));
      const normal = d.clone().normalize();
      d.addScaledVector(normal, 0.0045);

      positions.push(d.x, d.y, d.z);
      uvs.push(uCoord, 1 - vCoord);
    }
  }

  for (let iy = 0; iy < segsH; iy++) {
    for (let ix = 0; ix < segsW; ix++) {
      const a = iy * (segsW + 1) + ix;
      const b = a + 1;
      const c = a + (segsW + 1);
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Create a smooth tapered tube along a CatmullRomCurve3 (used for fluffy hair locks & legs).
 */
function createTaperedTube(points, radiusFn, tubularSegs = 16, radialSegs = 8, flattenZ = 1) {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(tubularSegs, false);

  const positions = [];
  const uvs = [];
  const indices = [];

  const P = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  const vertex = new THREE.Vector3();

  for (let i = 0; i <= tubularSegs; i++) {
    const t = i / tubularSegs;
    curve.getPointAt(t, P);
    N.copy(frames.normals[i]);
    B.copy(frames.binormals[i]);
    const r = Math.max(0.001, radiusFn(t));

    for (let j = 0; j <= radialSegs; j++) {
      const v = (j / radialSegs) * Math.PI * 2;
      const sin = Math.sin(v);
      const cos = -Math.cos(v);

      vertex.x = P.x + r * (cos * N.x + sin * B.x * flattenZ);
      vertex.y = P.y + r * (cos * N.y + sin * B.y * flattenZ);
      vertex.z = P.z + r * (cos * N.z + sin * B.z * flattenZ);

      positions.push(vertex.x, vertex.y, vertex.z);
      uvs.push(j / radialSegs, t);
    }
  }

  for (let i = 0; i < tubularSegs; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = (radialSegs + 1) * i + j;
      const b = (radialSegs + 1) * (i + 1) + j;
      const c = (radialSegs + 1) * (i + 1) + (j + 1);
      const d = (radialSegs + 1) * i + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Parametric rounded bunny ear geometry with optional folded tip droop.
 */
function createParametricEarGeometry({
  height = 0.52,
  maxHalfWidth = 0.145,
  thickness = 0.036,
  bendForward = 0.10,
  bendSide = 0.0,
  tipFold = 0.0,
  concave = 0.016,
  segU = 12,
  segV = 16,
}) {
  const positions = [];
  const indices = [];

  for (let iv = 0; iv <= segV; iv++) {
    const v = iv / segV;
    const wFactor = Math.pow(Math.sin(Math.pow(v, 0.65) * Math.PI), 0.72) * 0.92 + (1 - v) * 0.20;
    const halfW = maxHalfWidth * wFactor;
    const thickAtV = thickness * (0.62 + 0.38 * Math.sin(v * Math.PI));

    let y = v * height;
    let zOff = bendForward * v * v;
    const bendX = bendSide * v * v;

    if (tipFold > 0 && v > 0.62) {
      const f = (v - 0.62) / 0.38;
      zOff += tipFold * f * f * 0.24;
      y -= tipFold * f * f * 0.09;
    }

    for (let iu = 0; iu <= segU; iu++) {
      const u = iu / segU;
      const theta = u * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const x = cosT * halfW + bendX;
      const dish = sinT > 0 ? -concave * (1 - cosT * cosT) * Math.sin(v * Math.PI) : 0;
      const z = sinT * thickAtV + dish + zOff;
      positions.push(x, y, z);
    }
  }

  for (let iv = 0; iv < segV; iv++) {
    for (let iu = 0; iu < segU; iu++) {
      const a = iv * (segU + 1) + iu;
      const b = a + 1;
      const c = a + (segU + 1);
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildBunnyEar(materials, opts) {
  const pivot = new THREE.Group();

  const outerGeo = createParametricEarGeometry(opts);
  const outerMesh = new THREE.Mesh(outerGeo, materials.suit);
  outerMesh.name = 'bunny_ear_outer';
  attachOutline(outerMesh, materials.outlinePurple, 0.0095);
  pivot.add(outerMesh);

  const innerGeo = createParametricEarGeometry({
    height: opts.height * 0.78,
    maxHalfWidth: opts.maxHalfWidth * 0.58,
    thickness: opts.thickness * 0.45,
    bendForward: opts.bendForward * 0.85,
    bendSide: opts.bendSide * 0.85,
    tipFold: (opts.tipFold || 0) * 0.82,
    concave: 0.008,
    segU: 10,
    segV: 14,
  });
  innerGeo.translate(0, opts.height * 0.08, opts.thickness * 0.56);
  const innerMesh = new THREE.Mesh(innerGeo, materials.innerEar);
  innerMesh.name = 'bunny_ear_inner';
  pivot.add(innerMesh);

  return pivot;
}

/**
 * Graceful open-palm welcome hand with aligned fingertips ("どうぞ" gesture).
 */
function buildWelcomeHand(materials) {
  const hand = new THREE.Group();

  const palmGeo = new THREE.SphereGeometry(0.052, 10, 8);
  palmGeo.scale(0.92, 0.54, 1.0);
  const palm = new THREE.Mesh(palmGeo, materials.skin);
  palm.position.set(0, 0, 0.042);
  attachOutline(palm, materials.outlineSkin, 0.0065);
  hand.add(palm);

  // Aligned neat fingers gently curved together
  const fingerSpecs = [
    { x: -0.025, len: 0.044, r: 0.013 },
    { x: -0.008, len: 0.050, r: 0.0135 },
    { x: 0.009, len: 0.047, r: 0.013 },
    { x: 0.025, len: 0.038, r: 0.012 },
  ];

  for (const spec of fingerSpecs) {
    const fGeo = new THREE.CapsuleGeometry(spec.r, spec.len * 0.55, 4, 7);
    fGeo.rotateX(Math.PI * 0.5);
    const finger = new THREE.Mesh(fGeo, materials.skin);
    finger.position.set(spec.x, 0.003, 0.084 + spec.len * 0.16);
    finger.rotation.x = -0.10; // slight graceful upward curl
    attachOutline(finger, materials.outlineSkin, 0.0055);
    hand.add(finger);
  }

  // Neat thumb angled cleanly along inner edge
  const thumbGeo = new THREE.CapsuleGeometry(0.014, 0.028, 4, 7);
  thumbGeo.rotateX(Math.PI * 0.5);
  const thumb = new THREE.Mesh(thumbGeo, materials.skin);
  thumb.position.set(-0.044, 0.015, 0.046);
  thumb.rotation.y = -0.45;
  thumb.rotation.x = -0.20;
  attachOutline(thumb, materials.outlineSkin, 0.0055);
  hand.add(thumb);

  hand.scale.setScalar(0.90);
  return mergeGroupByMaterial(hand);
}

/**
 * Cute plump mitten-style resting hand for the lap/thigh.
 */
function buildMittenHand(materials) {
  const hand = new THREE.Group();

  const palmGeo = new THREE.SphereGeometry(0.055, 10, 8);
  palmGeo.scale(0.95, 0.62, 1.05);
  const palm = new THREE.Mesh(palmGeo, materials.skin);
  palm.position.set(0, 0, 0.038);
  attachOutline(palm, materials.outlineSkin, 0.0068);
  hand.add(palm);

  // Soft rounded mitten finger pad (gentle unified curve + subtle thumb)
  const mittenGeo = new THREE.SphereGeometry(0.044, 10, 8);
  mittenGeo.scale(0.94, 0.52, 0.92);
  const mitten = new THREE.Mesh(mittenGeo, materials.skin);
  mitten.position.set(0, -0.006, 0.076);
  mitten.rotation.x = 0.18;
  attachOutline(mitten, materials.outlineSkin, 0.0062);
  hand.add(mitten);

  const thumbGeo = new THREE.CapsuleGeometry(0.0155, 0.022, 4, 7);
  thumbGeo.rotateX(Math.PI * 0.5);
  const thumb = new THREE.Mesh(thumbGeo, materials.skin);
  thumb.position.set(0.042, 0.008, 0.048);
  thumb.rotation.y = 0.48;
  attachOutline(thumb, materials.outlineSkin, 0.0055);
  hand.add(thumb);

  hand.scale.setScalar(0.94);
  return mergeGroupByMaterial(hand);
}

/**
 * Sleek glossy black high-heel pump.
 * Ankle collar is centered at (0, 0, 0); forefoot sole and stiletto tip both touch y = -0.105 when upright.
 */
function buildHighHeel(materials) {
  const shoe = new THREE.Group();

  const bodyGeo = new THREE.SphereGeometry(0.068, 12, 10);
  bodyGeo.scale(0.84, 0.52, 1.72);
  const body = new THREE.Mesh(bodyGeo, materials.heel);
  body.position.set(0, -0.062, 0.052);
  body.rotation.x = 0.36;
  attachOutline(body, materials.outlineDark, 0.008);
  shoe.add(body);

  const cupGeo = new THREE.CylinderGeometry(0.048, 0.044, 0.068, 10);
  const cup = new THREE.Mesh(cupGeo, materials.heel);
  cup.position.set(0, -0.024, -0.016);
  cup.rotation.x = -0.12;
  attachOutline(cup, materials.outlineDark, 0.0075);
  shoe.add(cup);

  const heelGeo = new THREE.CylinderGeometry(0.014, 0.007, 0.102, 7);
  const heel = new THREE.Mesh(heelGeo, materials.heel);
  heel.position.set(0, -0.054, -0.062);
  heel.rotation.x = 0.07;
  attachOutline(heel, materials.outlineDark, 0.0055);
  shoe.add(heel);

  return mergeGroupByMaterial(shoe);
}

/**
 * Purple collar bow tie.
 */
function buildBowTie(materials) {
  const bow = new THREE.Group();

  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.quadraticCurveTo(0.075, 0.056, 0.106, 0.038);
  wingShape.quadraticCurveTo(0.12, 0, 0.106, -0.038);
  wingShape.quadraticCurveTo(0.075, -0.056, 0, 0);

  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.022,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.008,
    bevelSegments: 2,
    curveSegments: 7,
  });
  wingGeo.translate(0, 0, -0.011);

  const rightWing = new THREE.Mesh(wingGeo, materials.suit);
  rightWing.rotation.y = -0.18;
  attachOutline(rightWing, materials.outlinePurple, 0.0075);
  bow.add(rightWing);

  const leftWing = new THREE.Mesh(wingGeo, materials.suit);
  leftWing.rotation.z = Math.PI;
  leftWing.rotation.y = 0.18;
  attachOutline(leftWing, materials.outlinePurple, 0.0075);
  bow.add(leftWing);

  const knotGeo = new THREE.SphereGeometry(0.028, 10, 8);
  knotGeo.scale(0.95, 1.15, 0.9);
  const knot = new THREE.Mesh(knotGeo, materials.suitTrim);
  knot.position.z = 0.008;
  attachOutline(knot, materials.outlinePurple, 0.0065);
  bow.add(knot);

  return mergeGroupByMaterial(bow);
}

/**
 * Clean simple butterfly ribbon bow (2 loops + 2 neat tails) on the hip.
 */
function buildHipRibbonBow(materials) {
  const bow = new THREE.Group();

  const loopShape = new THREE.Shape();
  loopShape.moveTo(0, 0);
  loopShape.bezierCurveTo(0.024, 0.032, 0.052, 0.026, 0.052, 0);
  loopShape.bezierCurveTo(0.052, -0.026, 0.024, -0.032, 0, 0);

  const loopGeo = new THREE.ExtrudeGeometry(loopShape, {
    depth: 0.012,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.005,
    bevelSegments: 2,
    curveSegments: 8,
  });
  loopGeo.translate(0, 0, -0.006);

  const wing1 = new THREE.Mesh(loopGeo, materials.suitTrim);
  wing1.rotation.y = Math.PI * 0.5;
  wing1.rotation.x = 0.18;
  attachOutline(wing1, materials.outlinePurple, 0.005);
  bow.add(wing1);

  const wing2 = new THREE.Mesh(loopGeo, materials.suitTrim);
  wing2.rotation.y = -Math.PI * 0.5;
  wing2.rotation.x = 0.18;
  attachOutline(wing2, materials.outlinePurple, 0.005);
  bow.add(wing2);

  const knotGeo = new THREE.SphereGeometry(0.015, 8, 8);
  const knot = new THREE.Mesh(knotGeo, materials.suit);
  attachOutline(knot, materials.outlinePurple, 0.0045);
  bow.add(knot);

  const tailGeo = new THREE.CylinderGeometry(0.0055, 0.0095, 0.068, 6);
  for (const zDir of [-1, 1]) {
    const tail = new THREE.Mesh(tailGeo, materials.suitTrim);
    tail.position.set(-0.007, -0.036, zDir * 0.018);
    tail.rotation.x = zDir * 0.28;
    tail.rotation.z = -0.14;
    attachOutline(tail, materials.outlinePurple, 0.0045);
    bow.add(tail);
  }

  return mergeGroupByMaterial(bow);
}

/**
 * Construct the full chibi bunny character and return animated rig handles.
 */
export function createBunnyCharacter(materials, faceTexture) {
  const root = new THREE.Group();
  root.name = 'bunny_root';

  // Angled sideways (~64 deg) so knees point front-right and BOTH black heels peek out behind tail
  const hipsGroup = new THREE.Group();
  hipsGroup.name = 'hips_group';
  hipsGroup.rotation.y = 1.12;
  hipsGroup.scale.setScalar(0.92);
  root.add(hipsGroup);

  // --- ARTICULATED RIGGED LEGS (Shared smoothly across sit & stand poses) ---
  const thighLen = 0.295;
  const shinLen = 0.34;
  const floorMarkers = [];

  const buildRiggedLeg = (side) => {
    const hipPivot = new THREE.Group();
    hipPivot.name = side < 0 ? 'hip_r' : 'hip_l';
    hipPivot.position.set(side * 0.088, 0.32, -0.02);

    // Outline-free hip & knee spheres bridge thigh/shin seamlessly at any bend angle
    const hipBallGeo = new THREE.SphereGeometry(0.092, 12, 10);
    const hipBall = new THREE.Mesh(hipBallGeo, materials.fishnet);
    hipPivot.add(hipBall);

    // Start thigh cylinder buried inside opaque purple pelvis (y = +0.02) so zero rim/crease shows on butt/hips
    const thighCurve = [
      new THREE.Vector3(0, 0.02, 0),
      new THREE.Vector3(0, -thighLen * 0.5, 0.010),
      new THREE.Vector3(0, -thighLen, 0),
    ];
    const thighGeo = createTaperedTube(
      thighCurve,
      (t) => 0.080 + Math.sin(t * Math.PI * 0.84) * 0.022 - t * 0.017,
      12,
      12
    );
    const thighMesh = new THREE.Mesh(thighGeo, materials.fishnet);
    attachOutline(thighMesh, materials.outlineDark, 0.0088);
    hipPivot.add(thighMesh);

    const kneePivot = new THREE.Group();
    kneePivot.name = side < 0 ? 'knee_r' : 'knee_l';
    kneePivot.position.set(0, -thighLen, 0);
    hipPivot.add(kneePivot);

    const kneeBallGeo = new THREE.SphereGeometry(0.074, 12, 10);
    const kneeBall = new THREE.Mesh(kneeBallGeo, materials.fishnet);
    kneePivot.add(kneeBall);

    const kneeBottomMarker = new THREE.Object3D();
    kneeBottomMarker.position.set(0, -0.072, 0.045);
    kneePivot.add(kneeBottomMarker);
    floorMarkers.push(kneeBottomMarker);

    const shinCurve = [
      new THREE.Vector3(0, -0.02, 0),
      new THREE.Vector3(0, -shinLen * 0.34, -0.015),
      new THREE.Vector3(0, -shinLen * 0.74, -0.004),
      new THREE.Vector3(0, -shinLen, 0),
    ];
    const shinGeo = createTaperedTube(
      shinCurve,
      (t) => 0.074 + Math.sin(Math.pow(t, 0.72) * Math.PI) * 0.018 - t * 0.028,
      14,
      12
    );
    const shinMesh = new THREE.Mesh(shinGeo, materials.fishnet);
    attachOutline(shinMesh, materials.outlineDark, 0.0085);
    kneePivot.add(shinMesh);

    const anklePivot = new THREE.Group();
    anklePivot.name = side < 0 ? 'ankle_r' : 'ankle_l';
    anklePivot.position.set(0, -shinLen, 0);
    kneePivot.add(anklePivot);

    const shoe = buildHighHeel(materials);
    anklePivot.add(shoe);

    // Floor contact anchors on toe & heel tip so sit/stand/transition never clips into pedestal
    const toeMarker = new THREE.Object3D();
    toeMarker.position.set(0, -0.104, 0.11);
    anklePivot.add(toeMarker);
    const heelMarker = new THREE.Object3D();
    heelMarker.position.set(0, -0.104, -0.068);
    anklePivot.add(heelMarker);
    const cupMarker = new THREE.Object3D();
    cupMarker.position.set(0, -0.046, 0.04);
    anklePivot.add(cupMarker);
    floorMarkers.push(toeMarker, heelMarker, cupMarker);

    return { hipPivot, kneePivot, anklePivot };
  };

  const rightLeg = buildRiggedLeg(-1);
  const leftLeg = buildRiggedLeg(1);
  hipsGroup.add(rightLeg.hipPivot, leftLeg.hipPivot);

  // --- HIGH-CUT BUNNY SUIT PELVIS & BIGGER FLUFFY TAIL ---
  const pelvisGeo = new THREE.SphereGeometry(0.195, 16, 12);
  pelvisGeo.scale(0.96, 0.88, 0.98);
  const pelvis = new THREE.Mesh(pelvisGeo, materials.suit);
  pelvis.position.set(0, 0.39, -0.04);
  attachOutline(pelvis, materials.outlinePurple, 0.01);
  hipsGroup.add(pelvis);

  // Larger, extra-fluffy bunny tail (8 puffs)
  const tailPivot = new THREE.Group();
  tailPivot.name = 'tail_pivot';
  tailPivot.position.set(0, 0.44, -0.26);
  tailPivot.scale.setScalar(1.24);
  const tailCenterGeo = new THREE.SphereGeometry(0.118, 12, 10);
  const tailCenter = new THREE.Mesh(tailCenterGeo, materials.white);
  attachOutline(tailCenter, materials.outlineWhite, 0.0085);
  tailPivot.add(tailCenter);

  const puffOffsets = [
    [0.056, 0.048, -0.032, 0.074],
    [-0.056, 0.048, -0.032, 0.074],
    [0.052, -0.046, -0.032, 0.072],
    [-0.052, -0.046, -0.032, 0.072],
    [0, 0.062, -0.054, 0.076],
    [0, -0.036, -0.068, 0.070],
    [0.044, 0.008, -0.066, 0.064],
    [-0.044, 0.008, -0.066, 0.064],
  ];
  const puffGeo = new THREE.SphereGeometry(1, 9, 7);
  for (const [px, py, pz, pr] of puffOffsets) {
    const puff = new THREE.Mesh(puffGeo, materials.white);
    puff.position.set(px, py, pz);
    puff.scale.setScalar(pr);
    attachOutline(puff, materials.outlineWhite, 0.0065 / pr);
    tailPivot.add(puff);
  }
  mergeGroupByMaterial(tailPivot);
  hipsGroup.add(tailPivot);

  // --- TORSO (twisted toward camera + gentle forward lean + sweetheart neckline) ---
  const torsoPivot = new THREE.Group();
  torsoPivot.name = 'torso_pivot';
  torsoPivot.position.set(0, 0.43, -0.03);
  torsoPivot.rotation.y = -0.78; // counter-twist so upper body faces ~20 deg front-right
  torsoPivot.rotation.x = 0.11;  // cute slight forward lean
  hipsGroup.add(torsoPivot);

  // Single neat butterfly bow on unobstructed outer hip (+X) facing front-right
  const hipBow = buildHipRibbonBow(materials);
  hipBow.position.set(0.172, 0.015, 0.068);
  hipBow.rotation.set(0.06, Math.PI * 0.72, -0.08);
  hipBow.scale.setScalar(1.16);
  torsoPivot.add(hipBow);

  // Static torso suit (bodice + angled sweetheart bust cups)
  const torsoSuitGroup = new THREE.Group();
  torsoPivot.add(torsoSuitGroup);

  const bodicePoints = [
    new THREE.Vector2(0.155, 0.0),
    new THREE.Vector2(0.138, 0.10),
    new THREE.Vector2(0.148, 0.19),
    new THREE.Vector2(0.165, 0.27),
    new THREE.Vector2(0.124, 0.305),
    new THREE.Vector2(0.01, 0.295),
  ];
  const bodiceGeo = new THREE.LatheGeometry(bodicePoints, 18);
  bodiceGeo.scale(1.10, 1, 0.88);
  const bodice = new THREE.Mesh(bodiceGeo, materials.suit);
  attachOutline(bodice, materials.outlinePurple, 0.0095);
  torsoSuitGroup.add(bodice);

  // Sweetheart bust cups forming an M/heart neckline dip in center
  const cupGeo = new THREE.SphereGeometry(0.094, 14, 10);
  cupGeo.scale(0.95, 0.94, 0.88);
  for (const side of [-1, 1]) {
    const cup = new THREE.Mesh(cupGeo, materials.suit);
    cup.position.set(side * 0.082, 0.255, 0.092);
    cup.rotation.z = side * 0.16;
    attachOutline(cup, materials.outlinePurple, 0.008);
    torsoSuitGroup.add(cup);
  }
  mergeGroupByMaterial(torsoSuitGroup);

  // Static torso skin (sloping upper chest + neck + center sweetheart skin dip)
  const torsoSkinGroup = new THREE.Group();
  torsoPivot.add(torsoSkinGroup);

  const chestGeo = new THREE.SphereGeometry(0.152, 16, 12);
  chestGeo.scale(1.14, 0.72, 0.78);
  const chest = new THREE.Mesh(chestGeo, materials.skin);
  chest.position.set(0, 0.328, 0.005);
  attachOutline(chest, materials.outlineSkin, 0.0085);
  torsoSkinGroup.add(chest);

  // Center V-dip skin sphere to emphasize sweetheart neckline
  const centerDipGeo = new THREE.SphereGeometry(0.056, 10, 8);
  const centerDip = new THREE.Mesh(centerDipGeo, materials.skin);
  centerDip.position.set(0, 0.295, 0.096);
  torsoSkinGroup.add(centerDip);

  const neckGeo = new THREE.CylinderGeometry(0.072, 0.086, 0.15, 12);
  const neck = new THREE.Mesh(neckGeo, materials.skin);
  neck.position.set(0, 0.432, 0.0);
  attachOutline(neck, materials.outlineSkin, 0.0075);
  torsoSkinGroup.add(neck);
  mergeGroupByMaterial(torsoSkinGroup);

  // Clear soft shadow strip at neck under chin so head reads distinctly anchored
  const neckShadowGeo = new THREE.CylinderGeometry(0.078, 0.086, 0.048, 12);
  const neckShadow = new THREE.Mesh(neckShadowGeo, materials.skinShadow);
  neckShadow.position.set(0, 0.468, 0.008);
  torsoPivot.add(neckShadow);

  const collarGeo = new THREE.CylinderGeometry(0.096, 0.118, 0.074, 16, 1, false);
  const collar = new THREE.Mesh(collarGeo, materials.white);
  collar.position.set(0, 0.412, 0.005);
  attachOutline(collar, materials.outlineWhite, 0.007);
  torsoPivot.add(collar);

  const bowTie = buildBowTie(materials);
  bowTie.position.set(0, 0.398, 0.118);
  bowTie.scale.setScalar(0.92);
  torsoPivot.add(bowTie);

  // --- RIGHT ARM (sloping shoulder, seamless arm cylinder buried inside shoulder/elbow, cute mitten hand) ---
  const rightArmPivot = new THREE.Group();
  rightArmPivot.name = 'right_arm_pivot';
  rightArmPivot.position.set(-0.162, 0.282, 0.006);
  torsoPivot.add(rightArmPivot);

  // Seamless shoulder fill (radius 0.052 > arm+outline 0.049 so upperArm top rim is buried inside)
  const jointGeo = new THREE.SphereGeometry(0.052, 10, 8);
  const rShoulder = new THREE.Mesh(jointGeo, materials.skin);
  rightArmPivot.add(rShoulder);

  const upperArmGeo = new THREE.CylinderGeometry(0.042, 0.040, 0.165, 12, 1, true);
  const rUpperArm = new THREE.Mesh(upperArmGeo, materials.skin);
  rUpperArm.position.set(0, -0.095, 0);
  attachOutline(rUpperArm, materials.outlineSkin, 0.007);
  rightArmPivot.add(rUpperArm);

  const rightElbowPivot = new THREE.Group();
  rightElbowPivot.position.set(0, -0.185, 0);
  rightArmPivot.add(rightElbowPivot);

  const rElbow = new THREE.Mesh(jointGeo, materials.skin);
  rElbow.scale.setScalar(0.92);
  rightElbowPivot.add(rElbow);

  const forearmGeo = new THREE.CylinderGeometry(0.039, 0.037, 0.145, 12, 1, true);
  const rForearm = new THREE.Mesh(forearmGeo, materials.skin);
  rForearm.position.set(0, -0.075, 0);
  attachOutline(rForearm, materials.outlineSkin, 0.007);
  rightElbowPivot.add(rForearm);

  const buildCuff = (buttonSide) => {
    const cuffGroup = new THREE.Group();
    const cuffGeo = new THREE.CylinderGeometry(0.056, 0.048, 0.080, 12);
    const cuff = new THREE.Mesh(cuffGeo, materials.white);
    attachOutline(cuff, materials.outlineWhite, 0.007);
    cuffGroup.add(cuff);

    const btnGeo = new THREE.SphereGeometry(0.012, 7, 7);
    const btn = new THREE.Mesh(btnGeo, materials.suit);
    btn.position.set(buttonSide * 0.051, -0.012, 0.015);
    cuffGroup.add(btn);
    return cuffGroup;
  };

  const rCuff = buildCuff(-1);
  rCuff.position.set(0, -0.155, 0);
  rightElbowPivot.add(rCuff);

  const rightWristPivot = new THREE.Group();
  rightWristPivot.name = 'right_wrist_pivot';
  rightWristPivot.position.set(0, -0.198, 0);
  rightElbowPivot.add(rightWristPivot);

  const rHand = buildMittenHand(materials);
  rHand.rotation.x = Math.PI * 0.44;
  rHand.rotation.y = 0.25;
  rightWristPivot.add(rHand);

  rightArmPivot.rotation.set(-0.24, 0.10, -0.22);
  rightElbowPivot.rotation.set(-0.62, 0.18, 0.42);

  // --- LEFT ARM (viewer's right: separated cleanly from body, "どうぞ" open palm UP) ---
  const leftArmPivot = new THREE.Group();
  leftArmPivot.name = 'left_arm_pivot';
  leftArmPivot.position.set(0.162, 0.282, 0.006);
  torsoPivot.add(leftArmPivot);

  const lShoulder = new THREE.Mesh(jointGeo, materials.skin);
  leftArmPivot.add(lShoulder);

  const lUpperArm = new THREE.Mesh(upperArmGeo, materials.skin);
  lUpperArm.position.set(0, -0.095, 0);
  attachOutline(lUpperArm, materials.outlineSkin, 0.007);
  leftArmPivot.add(lUpperArm);

  const leftElbowPivot = new THREE.Group();
  leftElbowPivot.name = 'left_elbow_pivot';
  leftElbowPivot.position.set(0, -0.185, 0);
  leftArmPivot.add(leftElbowPivot);

  const lElbow = new THREE.Mesh(jointGeo, materials.skin);
  lElbow.scale.setScalar(0.92);
  leftElbowPivot.add(lElbow);

  const lForearm = new THREE.Mesh(forearmGeo, materials.skin);
  lForearm.position.set(0, -0.075, 0);
  attachOutline(lForearm, materials.outlineSkin, 0.007);
  leftElbowPivot.add(lForearm);

  const lCuff = buildCuff(1);
  lCuff.position.set(0, -0.155, 0);
  leftElbowPivot.add(lCuff);

  const leftWristPivot = new THREE.Group();
  leftWristPivot.name = 'left_wrist_pivot';
  leftWristPivot.position.set(0, -0.198, 0);
  leftElbowPivot.add(leftWristPivot);

  // Orient palm (+Y) facing upward/forward toward guest (+Z of elbow frame) and thumb (-X) inward
  const lHand = buildWelcomeHand(materials);
  lHand.rotation.set(Math.PI * 0.5, 0, 0);
  leftWristPivot.add(lHand);

  // Open welcoming "どうぞ" pose: hand angled outward-right with arched open palm facing up
  const welcomeArmRot = new THREE.Euler(-0.04, 0.14, 0.72);
  const welcomeElbowRot = new THREE.Euler(-0.92, 0.08, 0.70);
  const welcomeWristRot = new THREE.Euler(-0.34, 0.34, -0.26);

  // Blown kiss pose
  const kissArmRot = new THREE.Euler(-0.62, -0.16, 0.74);
  const kissElbowRot = new THREE.Euler(-1.72, 0.45, -0.76);
  const kissWristRot = new THREE.Euler(0.32, 0.42, 0.48);

  leftArmPivot.rotation.copy(welcomeArmRot);
  leftElbowPivot.rotation.copy(welcomeElbowRot);
  leftWristPivot.rotation.copy(welcomeWristRot);

  // --- ENLARGED ROUND CHIBI HEAD (~2.2頭身, tilted ~7 deg) ---
  const headPivot = new THREE.Group();
  headPivot.name = 'head_pivot';
  headPivot.position.set(0, 0.484, 0.02);
  headPivot.rotation.set(-0.04, -0.12, 0.12);
  headPivot.scale.setScalar(1.18);
  torsoPivot.add(headPivot);

  const headMeshGroup = new THREE.Group();
  headMeshGroup.position.set(0, 0.36, 0.02);
  headPivot.add(headMeshGroup);

  const headSkinGroup = new THREE.Group();
  headMeshGroup.add(headSkinGroup);

  const headGeo = createChibiHeadGeometry(0.42);
  const headMesh = new THREE.Mesh(headGeo, materials.skin);
  headMesh.name = 'head_skin';
  attachOutline(headMesh, materials.outlineSkin, 0.0095);
  headSkinGroup.add(headMesh);

  const humanEarGeo = new THREE.SphereGeometry(0.064, 9, 8);
  humanEarGeo.scale(0.55, 1.0, 0.65);
  for (const side of [-1, 1]) {
    const hEar = new THREE.Mesh(humanEarGeo, materials.skin);
    hEar.position.set(side * 0.41, -0.06, -0.02);
    attachOutline(hEar, materials.outlineSkin, 0.007);
    headSkinGroup.add(hEar);
  }
  mergeGroupByMaterial(headSkinGroup);

  const faceGeo = createFaceDecalGeometry(0.42);
  const faceMat = new THREE.MeshBasicMaterial({
    map: faceTexture,
    transparent: true,
    depthWrite: false,
  });
  const faceMesh = new THREE.Mesh(faceGeo, faceMat);
  faceMesh.name = 'face_decal';
  faceMesh.renderOrder = 2;
  headMeshGroup.add(faceMesh);

  const mouthAnchor = new THREE.Object3D();
  mouthAnchor.position.set(0.03, -0.25, 0.45);
  headMeshGroup.add(mouthAnchor);

  // --- FLUFFY S-WAVE HAIR WITH PARTED BANGS, HIGHLIGHTS & LAYERED BACK CURLS ---
  const hairGroup = new THREE.Group();
  hairGroup.name = 'hair_group';
  headMeshGroup.add(hairGroup);

  const staticHairGroup = new THREE.Group();
  staticHairGroup.name = 'static_hair_group';
  hairGroup.add(staticHairGroup);

  const capGeo = new THREE.SphereGeometry(0.435, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.56);
  capGeo.scale(1.12, 1.03, 1.05);
  const hairCap = new THREE.Mesh(capGeo, materials.hair);
  hairCap.position.set(0, 0.02, -0.06);
  hairCap.rotation.x = -0.68;
  attachOutline(hairCap, materials.outlineHair, 0.0044);
  staticHairGroup.add(hairCap);

  const topDomeGeo = new THREE.SphereGeometry(0.425, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.42);
  topDomeGeo.scale(1.12, 0.92, 1.04);
  const topDome = new THREE.Mesh(topDomeGeo, materials.hair);
  topDome.position.set(0, 0.07, -0.02);
  topDome.rotation.x = -0.16;
  attachOutline(topDome, materials.outlineHair, 0.0044);
  staticHairGroup.add(topDome);

  // Plush temple hair cushions sealing cheek-to-back-hair side gap under headband
  const templeGeo = new THREE.SphereGeometry(0.155, 12, 10);
  templeGeo.scale(0.72, 1.40, 1.38);
  for (const side of [-1, 1]) {
    const temple = new THREE.Mesh(templeGeo, materials.hair);
    temple.position.set(side * 0.39, 0.08, 0.085);
    attachOutline(temple, materials.outlineHair, 0.0042);
    staticHairGroup.add(temple);
  }

  // Smooth tapered angel-ring highlights nestled flush on front bangs crown
  const haloLeftPts = [];
  const haloRightPts = [];
  for (let i = 0; i <= 6; i++) {
    const u = i / 6;
    const aL = -0.68 + u * 0.54;
    const aR = 0.14 + u * 0.56;
    haloLeftPts.push(new THREE.Vector3(Math.sin(aL) * 0.375, 0.305 + Math.cos(aL) * 0.025, 0.20 + Math.cos(aL) * 0.095));
    haloRightPts.push(new THREE.Vector3(Math.sin(aR) * 0.375, 0.305 + Math.cos(aR) * 0.025, 0.20 + Math.cos(aR) * 0.095));
  }
  for (const pts of [haloLeftPts, haloRightPts]) {
    const hArcGeo = createTaperedTube(
      pts,
      (t) => 0.020 * Math.sin(t * Math.PI) + 0.002,
      12,
      6,
      0.38
    );
    staticHairGroup.add(new THREE.Mesh(hArcGeo, materials.hairHighlight));
  }

  const addFluffyHairLock = (parent, pts, maxR, flattenZ = 0.65, _minTip = 0.002, highlight = false) => {
    const geo = createTaperedTube(
      pts,
      (t) => {
        const rootRamp = Math.min(1, t * 4.5 + 0.55);
        const midPlump = 0.88 + Math.sin(t * Math.PI * 0.85) * 0.22;
        // Hemispherical U-rounded tip over the last 14% so curls stay plump & round (never spiky)
        let tipRound = 1.0;
        if (t > 0.86) {
          const u = (t - 0.86) / 0.14;
          tipRound = Math.max(0.002, Math.sqrt(Math.max(0, 1 - u * u)));
        }
        return maxR * rootRamp * midPlump * tipRound;
      },
      18,
      8,
      flattenZ
    );
    const mesh = new THREE.Mesh(geo, materials.hair);
    attachOutline(mesh, materials.outlineHair, 0.0042);
    parent.add(mesh);

    // Sleek chestnut shine crescent nestled softly on outer curl belly
    if (highlight && pts.length >= 3) {
      const hPts = pts.slice(0, Math.min(pts.length, 3)).map((p, idx) => {
        const outDir = new THREE.Vector3(p.x, 0, p.z).normalize();
        const push = (idx === 1 ? maxR * 0.58 : maxR * 0.30) * flattenZ;
        return p.clone().addScaledVector(outDir, push);
      });
      const hGeo = createTaperedTube(
        hPts,
        (t) => maxR * 0.26 * Math.sin(t * Math.PI) + 0.002,
        10,
        5,
        0.32
      );
      const hMesh = new THREE.Mesh(hGeo, materials.hairHighlight);
      parent.add(hMesh);
    }
    return mesh;
  };

  // Parted diagonal bangs covering ~50% of forehead like bunny_01.png!
  // Large sweeping locks from left-of-center part across forehead to viewer's right
  addFluffyHairLock(
    staticHairGroup,
    [
      new THREE.Vector3(-0.09, 0.43, 0.16),
      new THREE.Vector3(0.06, 0.28, 0.38),
      new THREE.Vector3(0.24, 0.14, 0.41),
      new THREE.Vector3(0.36, 0.04, 0.35),
    ],
    0.098,
    0.52,
    0.32,
    true
  );
  addFluffyHairLock(
    staticHairGroup,
    [
      new THREE.Vector3(-0.07, 0.44, 0.14),
      new THREE.Vector3(0.15, 0.31, 0.34),
      new THREE.Vector3(0.33, 0.18, 0.35),
      new THREE.Vector3(0.42, 0.06, 0.28),
    ],
    0.092,
    0.55,
    0.34,
    true
  );
  addFluffyHairLock(
    staticHairGroup,
    [
      new THREE.Vector3(-0.09, 0.41, 0.19),
      new THREE.Vector3(-0.01, 0.24, 0.41),
      new THREE.Vector3(0.10, 0.12, 0.42),
    ],
    0.078,
    0.48,
    0.36,
    false
  );
  // Shorter curved bang locks sweeping to viewer's left
  addFluffyHairLock(
    staticHairGroup,
    [
      new THREE.Vector3(-0.11, 0.42, 0.16),
      new THREE.Vector3(-0.24, 0.28, 0.36),
      new THREE.Vector3(-0.36, 0.14, 0.34),
      new THREE.Vector3(-0.42, 0.03, 0.26),
    ],
    0.094,
    0.52,
    0.34,
    true
  );
  mergeGroupByMaterial(staticHairGroup);

  // Side hair: 3 inward->outward S-wave locks with curled rounded tips per side
  const leftSideHairPivot = new THREE.Group();
  const rightSideHairPivot = new THREE.Group();
  hairGroup.add(leftSideHairPivot, rightSideHairPivot);

  // Viewer's left side locks (-X)
  addFluffyHairLock(
    rightSideHairPivot,
    [
      new THREE.Vector3(-0.40, 0.24, 0.10),
      new THREE.Vector3(-0.38, -0.06, 0.16),
      new THREE.Vector3(-0.51, -0.30, 0.14),
      new THREE.Vector3(-0.56, -0.43, 0.17),
      new THREE.Vector3(-0.49, -0.49, 0.14),
    ],
    0.096,
    0.68,
    0.38,
    true
  );
  addFluffyHairLock(
    rightSideHairPivot,
    [
      new THREE.Vector3(-0.41, 0.16, -0.04),
      new THREE.Vector3(-0.44, -0.10, 0.0),
      new THREE.Vector3(-0.56, -0.34, -0.02),
      new THREE.Vector3(-0.62, -0.48, 0.04),
      new THREE.Vector3(-0.54, -0.53, 0.06),
    ],
    0.105,
    0.72,
    0.38,
    true
  );
  addFluffyHairLock(
    rightSideHairPivot,
    [
      new THREE.Vector3(-0.36, 0.06, 0.22),
      new THREE.Vector3(-0.36, -0.16, 0.22),
      new THREE.Vector3(-0.45, -0.34, 0.21),
      new THREE.Vector3(-0.40, -0.42, 0.22),
    ],
    0.072,
    0.64,
    0.40,
    false
  );

  // Viewer's right side locks (+X)
  addFluffyHairLock(
    leftSideHairPivot,
    [
      new THREE.Vector3(0.40, 0.24, 0.10),
      new THREE.Vector3(0.39, -0.06, 0.16),
      new THREE.Vector3(0.52, -0.28, 0.14),
      new THREE.Vector3(0.57, -0.40, 0.17),
      new THREE.Vector3(0.50, -0.46, 0.14),
    ],
    0.096,
    0.68,
    0.38,
    true
  );
  addFluffyHairLock(
    leftSideHairPivot,
    [
      new THREE.Vector3(0.41, 0.16, -0.04),
      new THREE.Vector3(0.44, -0.10, 0.0),
      new THREE.Vector3(0.56, -0.32, -0.02),
      new THREE.Vector3(0.62, -0.46, 0.04),
      new THREE.Vector3(0.54, -0.51, 0.06),
    ],
    0.105,
    0.72,
    0.38,
    true
  );
  addFluffyHairLock(
    leftSideHairPivot,
    [
      new THREE.Vector3(0.36, 0.06, 0.22),
      new THREE.Vector3(0.37, -0.16, 0.22),
      new THREE.Vector3(0.45, -0.32, 0.21),
      new THREE.Vector3(0.41, -0.40, 0.22),
    ],
    0.072,
    0.64,
    0.40,
    false
  );

  // Layered overlapping back hair waves (inner mass + 2 staggered depths of S-wave curls)
  const backHairPivot = new THREE.Group();
  backHairPivot.name = 'back_hair_pivot';
  hairGroup.add(backHairPivot);

  const backMassGeo = new THREE.SphereGeometry(0.44, 16, 12);
  backMassGeo.scale(1.04, 0.92, 0.36);
  const backMass = new THREE.Mesh(backMassGeo, materials.hair);
  backMass.position.set(0, -0.16, -0.29);
  attachOutline(backMass, materials.outlineHair, 0.0044);
  backHairPivot.add(backMass);

  // Inner deeper layer (6 curls)
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const angle = (t - 0.5) * Math.PI * 0.98;
    const sinA = Math.sin(angle);
    const cosA = -Math.cos(angle);
    const waveDir = i % 2 === 0 ? 1 : -1;
    const baseR = 0.42;

    addFluffyHairLock(
      backHairPivot,
      [
        new THREE.Vector3(sinA * baseR, 0.14, cosA * baseR - 0.06),
        new THREE.Vector3(sinA * (baseR + 0.06), -0.12, cosA * (baseR + 0.05) - 0.08),
        new THREE.Vector3(sinA * (baseR + 0.05) + waveDir * 0.04, -0.36, cosA * (baseR + 0.03) - 0.09),
        new THREE.Vector3(sinA * (baseR + 0.14) - waveDir * 0.02, -0.54, cosA * (baseR + 0.07) - 0.07),
      ],
      0.125,
      0.66,
      0.42,
      false
    );
  }

  // Outer puffed S-wave layer (5 distinct overlapping waves with sheen highlights!)
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const angle = (t - 0.5) * Math.PI * 0.86;
    const sinA = Math.sin(angle);
    const cosA = -Math.cos(angle);
    const waveDir = i % 2 === 0 ? -1 : 1;
    const baseR = 0.46;

    addFluffyHairLock(
      backHairPivot,
      [
        new THREE.Vector3(sinA * baseR, 0.16, cosA * baseR - 0.08),
        new THREE.Vector3(sinA * (baseR + 0.09) + waveDir * 0.03, -0.10, cosA * (baseR + 0.09) - 0.10),
        new THREE.Vector3(sinA * (baseR + 0.04) - waveDir * 0.04, -0.34, cosA * (baseR + 0.06) - 0.11),
        new THREE.Vector3(sinA * (baseR + 0.15) + waveDir * 0.02, -0.50 - (i % 2) * 0.04, cosA * (baseR + 0.11) - 0.09),
      ],
      0.115,
      0.62,
      0.42,
      true
    );
  }

  mergeGroupByMaterial(leftSideHairPivot);
  mergeGroupByMaterial(rightSideHairPivot);
  mergeGroupByMaterial(backHairPivot);

  // --- PURPLE BUNNY EAR HEADBAND & ROUNDED BUNNY EARS ---
  const headbandGeo = new THREE.TorusGeometry(0.46, 0.036, 8, 24, Math.PI * 1.12);
  const headband = new THREE.Mesh(headbandGeo, materials.suit);
  headband.position.set(0, 0.06, -0.01);
  headband.rotation.z = -Math.PI * 0.06;
  headband.rotation.x = -0.16;
  attachOutline(headband, materials.outlinePurple, 0.0085);
  headMeshGroup.add(headband);

  const rightBunnyEarPivot = new THREE.Group();
  rightBunnyEarPivot.name = 'bunny_ear_right';
  rightBunnyEarPivot.position.set(-0.20, 0.44, 0.04);
  rightBunnyEarPivot.rotation.set(-0.08, 0.18, 0.94);
  const rightBunnyEar = buildBunnyEar(materials, {
    height: 0.54,
    maxHalfWidth: 0.148,
    thickness: 0.036,
    bendForward: 0.10,
    bendSide: -0.05,
    tipFold: 0.48,
  });
  rightBunnyEarPivot.add(rightBunnyEar);
  headMeshGroup.add(rightBunnyEarPivot);

  const leftBunnyEarPivot = new THREE.Group();
  leftBunnyEarPivot.name = 'bunny_ear_left';
  leftBunnyEarPivot.position.set(0.11, 0.46, 0.05);
  leftBunnyEarPivot.rotation.set(0.06, -0.16, -0.22);
  const leftBunnyEar = buildBunnyEar(materials, {
    height: 0.51,
    maxHalfWidth: 0.144,
    thickness: 0.036,
    bendForward: 0.12,
    bendSide: -0.07,
    tipFold: 0.12,
  });
  leftBunnyEarPivot.add(leftBunnyEar);
  headMeshGroup.add(leftBunnyEarPivot);

  rightLeg.hipPivot.rotation.order = 'YXZ';
  leftLeg.hipPivot.rotation.order = 'YXZ';

  // Rich pose presets for smooth Sit <-> Stand transitions and animations
  const poses = {
    sit: {
      hipsPos: new THREE.Vector3(0, -0.092, 0),
      hipsRot: new THREE.Euler(0.06, 1.12, 0),
      torsoRot: new THREE.Euler(0.11, -0.80, 0),
      headRot: new THREE.Euler(-0.04, -0.12, 0.12),
      rightEarRot: rightBunnyEarPivot.rotation.clone(),
      leftEarRot: leftBunnyEarPivot.rotation.clone(),
      // Side-swept shins (kneeRot.z tilts folded ankles out -X behind knees so BOTH black heels peek cleanly!)
      rightHipRot: new THREE.Euler(-1.18, 0.36, -0.10),
      rightKneeRot: new THREE.Euler(2.68, 0, -0.34),
      rightAnkleRot: new THREE.Euler(1.64, 0.12, 0),
      leftHipRot: new THREE.Euler(-1.16, 0.24, 0.04),
      leftKneeRot: new THREE.Euler(2.74, 0, -0.44),
      leftAnkleRot: new THREE.Euler(1.60, 0.18, 0),
      rightArmRot: new THREE.Euler(-0.24, 0.10, -0.22),
      rightElbowRot: new THREE.Euler(-0.62, 0.18, 0.42),
      rightWristRot: new THREE.Euler(0, 0, 0),
      leftArmRot: welcomeArmRot.clone(),
      leftElbowRot: welcomeElbowRot.clone(),
      leftWristRot: welcomeWristRot.clone(),
    },
    stand: {
      hipsPos: new THREE.Vector3(0, 0.352, 0),
      hipsRot: new THREE.Euler(0.02, 0.24, -0.105),
      torsoRot: new THREE.Euler(0.04, -0.12, 0.095),
      headRot: new THREE.Euler(-0.02, -0.06, 0.12),
      rightEarRot: rightBunnyEarPivot.rotation.clone(),
      leftEarRot: leftBunnyEarPivot.rotation.clone(),
      // Weight-bearing straight right leg + clearly bent pigeon-toed (内股) left leg
      rightHipRot: new THREE.Euler(-0.04, 0.08, 0.07),
      rightKneeRot: new THREE.Euler(0.06, 0, 0),
      rightAnkleRot: new THREE.Euler(-0.02, 0, -0.04),
      leftHipRot: new THREE.Euler(-0.44, -0.34, -0.08),
      leftKneeRot: new THREE.Euler(0.76, 0, 0.04),
      leftAnkleRot: new THREE.Euler(-0.16, -0.14, 0.04),
      // Right hand cleanly perched on outer hip waist silhouette (no body clipping)
      rightArmRot: new THREE.Euler(-0.12, 0.18, -0.62),
      rightElbowRot: new THREE.Euler(-0.48, 0.16, 0.92),
      rightWristRot: new THREE.Euler(0.14, 0.18, 0.28),
      // Left hand extending outward in welcoming "どうぞ" palm-up
      leftArmRot: new THREE.Euler(-0.06, 0.10, 0.64),
      leftElbowRot: new THREE.Euler(-0.88, 0.08, 0.62),
      leftWristRot: new THREE.Euler(-0.34, 0.28, -0.24),
    },
    midStand: {
      hipsPos: new THREE.Vector3(0, 0.14, 0.02),
      hipsRot: new THREE.Euler(0.10, 0.62, -0.02),
      torsoRot: new THREE.Euler(0.28, -0.42, 0.0),
      headRot: new THREE.Euler(-0.12, -0.06, 0.06),
      rightHipRot: new THREE.Euler(-0.74, 0.08, 0.02),
      rightKneeRot: new THREE.Euler(1.38, 0, 0),
      rightAnkleRot: new THREE.Euler(0.18, 0, 0),
      leftHipRot: new THREE.Euler(-0.78, -0.08, -0.02),
      leftKneeRot: new THREE.Euler(1.44, 0, 0),
      leftAnkleRot: new THREE.Euler(0.18, 0, 0),
      // Hand bracing gently toward thigh ("よいしょ")
      rightArmRot: new THREE.Euler(-0.42, 0.08, -0.18),
      rightElbowRot: new THREE.Euler(-0.52, 0.10, 0.25),
      rightWristRot: new THREE.Euler(0.20, 0, 0),
      leftArmRot: new THREE.Euler(-0.28, 0.06, 0.36),
      leftElbowRot: new THREE.Euler(-0.82, 0.08, 0.24),
      leftWristRot: new THREE.Euler(-0.10, 0.10, 0),
    },
    midSit: {
      hipsPos: new THREE.Vector3(0, 0.10, -0.02),
      hipsRot: new THREE.Euler(0.08, 0.68, -0.02),
      torsoRot: new THREE.Euler(0.22, -0.46, 0.02),
      headRot: new THREE.Euler(-0.08, -0.08, 0.10),
      rightHipRot: new THREE.Euler(-0.80, 0.14, -0.02),
      rightKneeRot: new THREE.Euler(1.52, 0, 0),
      rightAnkleRot: new THREE.Euler(0.32, 0, 0),
      leftHipRot: new THREE.Euler(-0.82, 0.02, 0.02),
      leftKneeRot: new THREE.Euler(1.56, 0, 0),
      leftAnkleRot: new THREE.Euler(0.32, 0, 0),
      // Hands lightly holding/smoothing hip/skirt forward as she kneels down
      rightArmRot: new THREE.Euler(-0.36, 0.14, -0.16),
      rightElbowRot: new THREE.Euler(-0.78, 0.22, 0.48),
      rightWristRot: new THREE.Euler(0.10, 0, 0),
      leftArmRot: new THREE.Euler(-0.32, -0.10, 0.22),
      leftElbowRot: new THREE.Euler(-0.78, -0.18, -0.42),
      leftWristRot: new THREE.Euler(0.10, 0, 0),
    },
    kissArmRot,
    kissElbowRot,
    kissWristRot,
    standKissArmRot: new THREE.Euler(-0.62, -0.16, 0.72),
    standKissElbowRot: new THREE.Euler(-1.72, 0.45, -0.76),
    standKissWristRot: new THREE.Euler(0.32, 0.42, 0.48),
  };

  return {
    root,
    hipsGroup,
    torsoPivot,
    headPivot,
    headMeshGroup,
    mouthAnchor,
    faceMesh,
    rightLeg,
    leftLeg,
    floorMarkers,
    leftArmPivot,
    leftElbowPivot,
    leftWristPivot,
    rightArmPivot,
    rightElbowPivot,
    rightWristPivot,
    leftBunnyEarPivot,
    rightBunnyEarPivot,
    backHairPivot,
    leftSideHairPivot,
    rightSideHairPivot,
    tailPivot,
    poses,
  };
}
