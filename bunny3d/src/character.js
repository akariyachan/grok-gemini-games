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
function createTaperedTube(points, radiusFn, tubularSegs = 18, radialSegs = 8, flattenZ = 1) {
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
    // Soft rounded silhouette (keeps wide plump body and rounds nicely at top)
    const wFactor = Math.pow(Math.sin(Math.pow(v, 0.65) * Math.PI), 0.72) * 0.92 + (1 - v) * 0.20;
    const halfW = maxHalfWidth * wFactor;
    const thickAtV = thickness * (0.62 + 0.38 * Math.sin(v * Math.PI));

    let y = v * height;
    let zOff = bendForward * v * v;
    const bendX = bendSide * v * v;

    // Folded cute floppy tip bend for v > 0.62
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
 * Small, plump, cute chibi hand with soft close-set rounded fingers.
 */
function buildHand(materials, side = 1) {
  const hand = new THREE.Group();

  const palmGeo = new THREE.SphereGeometry(0.052, 10, 8);
  palmGeo.scale(0.96, 0.62, 0.94);
  const palm = new THREE.Mesh(palmGeo, materials.skin);
  palm.position.set(0, 0, 0.036);
  attachOutline(palm, materials.outlineSkin, 0.0065);
  hand.add(palm);

  // Soft chubby close-set rounded fingers (4 tiny overlapping rounded capsules)
  const fingerSpecs = [
    { x: -0.025, len: 0.034, r: 0.015 },
    { x: -0.008, len: 0.038, r: 0.0155 },
    { x: 0.010, len: 0.036, r: 0.015 },
    { x: 0.026, len: 0.030, r: 0.014 },
  ];

  for (const spec of fingerSpecs) {
    const fGeo = new THREE.CapsuleGeometry(spec.r, spec.len * 0.46, 4, 7);
    fGeo.rotateX(Math.PI * 0.5);
    const finger = new THREE.Mesh(fGeo, materials.skin);
    finger.position.set(spec.x * side, 0.002, 0.072 + spec.len * 0.12);
    finger.rotation.y = spec.x * side * 0.45;
    attachOutline(finger, materials.outlineSkin, 0.0055);
    hand.add(finger);
  }

  // Soft rounded thumb
  const thumbGeo = new THREE.CapsuleGeometry(0.0155, 0.024, 4, 7);
  thumbGeo.rotateX(Math.PI * 0.5);
  const thumb = new THREE.Mesh(thumbGeo, materials.skin);
  thumb.position.set(-0.044 * side, 0.012, 0.044);
  thumb.rotation.y = -0.58 * side;
  thumb.rotation.x = -0.16;
  attachOutline(thumb, materials.outlineSkin, 0.0055);
  hand.add(thumb);

  hand.scale.setScalar(0.86);
  return mergeGroupByMaterial(hand);
}

/**
 * Glossy dark-plum high-heel pump.
 */
function buildHighHeel(materials) {
  const shoe = new THREE.Group();

  const bodyGeo = new THREE.SphereGeometry(0.066, 12, 10);
  bodyGeo.scale(0.84, 0.64, 1.5);
  const body = new THREE.Mesh(bodyGeo, materials.heel);
  body.position.set(0, 0.036, 0.036);
  body.rotation.x = 0.12;
  attachOutline(body, materials.outlineDark, 0.008);
  shoe.add(body);

  const cupGeo = new THREE.CylinderGeometry(0.044, 0.040, 0.068, 10);
  const cup = new THREE.Mesh(cupGeo, materials.heel);
  cup.position.set(0, 0.044, -0.044);
  cup.rotation.x = -0.12;
  attachOutline(cup, materials.outlineDark, 0.0075);
  shoe.add(cup);

  const heelGeo = new THREE.CylinderGeometry(0.014, 0.007, 0.084, 7);
  const heel = new THREE.Mesh(heelGeo, materials.heel);
  heel.position.set(0, -0.014, -0.062);
  heel.rotation.x = 0.08;
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
 * Cute clean butterfly ribbon bow on the side of the hip (replaces tangled lace loops).
 */
function buildHipRibbonBow(materials) {
  const bow = new THREE.Group();

  const loopGeo = new THREE.TorusGeometry(0.024, 0.0085, 6, 12);
  const loop1 = new THREE.Mesh(loopGeo, materials.suitTrim);
  loop1.position.set(0, 0.006, 0.024);
  loop1.rotation.y = Math.PI * 0.5;
  loop1.rotation.x = 0.25;
  attachOutline(loop1, materials.outlinePurple, 0.005);
  bow.add(loop1);

  const loop2 = new THREE.Mesh(loopGeo, materials.suitTrim);
  loop2.position.set(0, 0.006, -0.024);
  loop2.rotation.y = Math.PI * 0.5;
  loop2.rotation.x = -0.25;
  attachOutline(loop2, materials.outlinePurple, 0.005);
  bow.add(loop2);

  const knotGeo = new THREE.SphereGeometry(0.014, 8, 8);
  const knot = new THREE.Mesh(knotGeo, materials.suit);
  attachOutline(knot, materials.outlinePurple, 0.0045);
  bow.add(knot);

  const tailGeo = new THREE.CylinderGeometry(0.0065, 0.009, 0.068, 6);
  const tipGeo = new THREE.SphereGeometry(0.007, 6, 6);
  for (const zDir of [-1, 1]) {
    const tail = new THREE.Mesh(tailGeo, materials.suitTrim);
    tail.position.set(-0.008, -0.036, zDir * 0.016);
    tail.rotation.x = zDir * 0.24;
    tail.rotation.z = -0.14;
    attachOutline(tail, materials.outlinePurple, 0.0045);
    bow.add(tail);

    const tip = new THREE.Mesh(tipGeo, materials.gold);
    tip.position.set(-0.013, -0.068, zDir * 0.024);
    bow.add(tip);
  }

  return mergeGroupByMaterial(bow);
}

/**
 * Construct the full ~2.2-head-tall chibi bunny character and return animated rig handles.
 */
export function createBunnyCharacter(materials, faceTexture) {
  const root = new THREE.Group();
  root.name = 'bunny_root';

  // Slightly more compact body scale (0.92) + bigger head (1.14) -> ~2.2 head-tall chibi ratio
  const hipsGroup = new THREE.Group();
  hipsGroup.name = 'hips_group';
  hipsGroup.rotation.y = 0.94;
  hipsGroup.scale.setScalar(0.92);
  root.add(hipsGroup);

  // --- CONTINUOUS KNEELING LEGS ---
  const buildLeg = (side) => {
    const legGroup = new THREE.Group();
    const xOffset = side * 0.095;

    const legCurve = [
      new THREE.Vector3(xOffset * 1.02, 0.36, -0.06),
      new THREE.Vector3(xOffset * 1.06, 0.25, 0.12),
      new THREE.Vector3(xOffset * 0.96, 0.105, 0.265),
      new THREE.Vector3(xOffset * 0.96, 0.082, 0.22),
      new THREE.Vector3(xOffset * 1.03, 0.092, 0.01),
      new THREE.Vector3(xOffset * 1.08, 0.078, -0.23),
    ];
    const legGeo = createTaperedTube(
      legCurve,
      (t) => {
        if (t < 0.45) {
          const u = t / 0.45;
          return 0.108 - u * 0.026 + Math.sin(u * Math.PI) * 0.01;
        }
        const u = (t - 0.45) / 0.55;
        return 0.082 + Math.sin(u * Math.PI) * 0.01 - u * 0.028;
      },
      24,
      12
    );
    const legMesh = new THREE.Mesh(legGeo, materials.fishnet);
    legMesh.name = side < 0 ? 'leg_r' : 'leg_l';
    attachOutline(legMesh, materials.outlineDark, 0.0095);
    legGroup.add(legMesh);

    const shoe = buildHighHeel(materials);
    shoe.position.set(xOffset * 1.12, 0.088, -0.265);
    shoe.rotation.x = Math.PI * 0.56;
    shoe.rotation.z = side * 0.12;
    legGroup.add(shoe);

    return legGroup;
  };

  hipsGroup.add(buildLeg(-1));
  hipsGroup.add(buildLeg(1));

  // --- PELVIS, HIP RIBBON BOW & FLUFFY TAIL ---
  const pelvisGeo = new THREE.SphereGeometry(0.205, 16, 12);
  pelvisGeo.scale(1.08, 0.88, 1.0);
  const pelvis = new THREE.Mesh(pelvisGeo, materials.suit);
  pelvis.position.set(0, 0.39, -0.04);
  attachOutline(pelvis, materials.outlinePurple, 0.01);
  hipsGroup.add(pelvis);

  const bowR = buildHipRibbonBow(materials);
  bowR.position.set(-0.215, 0.38, -0.01);
  bowR.rotation.z = -0.14;
  hipsGroup.add(bowR);

  const bowL = buildHipRibbonBow(materials);
  bowL.position.set(0.215, 0.38, -0.01);
  bowL.rotation.y = Math.PI;
  bowL.rotation.z = 0.14;
  hipsGroup.add(bowL);

  const tailPivot = new THREE.Group();
  tailPivot.name = 'tail_pivot';
  tailPivot.position.set(0, 0.43, -0.245);
  const tailCenterGeo = new THREE.SphereGeometry(0.118, 12, 10);
  const tailCenter = new THREE.Mesh(tailCenterGeo, materials.white);
  attachOutline(tailCenter, materials.outlineWhite, 0.009);
  tailPivot.add(tailCenter);

  const puffOffsets = [
    [0.055, 0.045, -0.035, 0.072],
    [-0.055, 0.045, -0.035, 0.072],
    [0.05, -0.045, -0.035, 0.07],
    [-0.05, -0.045, -0.035, 0.07],
    [0, 0.055, -0.055, 0.074],
    [0, -0.03, -0.068, 0.068],
  ];
  const puffGeo = new THREE.SphereGeometry(1, 9, 7);
  for (const [px, py, pz, pr] of puffOffsets) {
    const puff = new THREE.Mesh(puffGeo, materials.white);
    puff.position.set(px, py, pz);
    puff.scale.setScalar(pr);
    attachOutline(puff, materials.outlineWhite, 0.007 / pr);
    tailPivot.add(puff);
  }
  mergeGroupByMaterial(tailPivot);
  hipsGroup.add(tailPivot);

  // --- TORSO (slightly rounder, softer chibi proportions) ---
  const torsoPivot = new THREE.Group();
  torsoPivot.name = 'torso_pivot';
  torsoPivot.position.set(0, 0.43, -0.03);
  torsoPivot.rotation.y = -0.52;
  torsoPivot.rotation.x = 0.07;
  hipsGroup.add(torsoPivot);

  // Static torso suit (bodice + bust cups merged to save draw calls)
  const torsoSuitGroup = new THREE.Group();
  torsoPivot.add(torsoSuitGroup);

  const bodicePoints = [
    new THREE.Vector2(0.155, 0.0),
    new THREE.Vector2(0.138, 0.10),
    new THREE.Vector2(0.148, 0.19),
    new THREE.Vector2(0.168, 0.28),
    new THREE.Vector2(0.132, 0.32),
    new THREE.Vector2(0.01, 0.32),
  ];
  const bodiceGeo = new THREE.LatheGeometry(bodicePoints, 18);
  bodiceGeo.scale(1.10, 1, 0.88);
  const bodice = new THREE.Mesh(bodiceGeo, materials.suit);
  attachOutline(bodice, materials.outlinePurple, 0.0095);
  torsoSuitGroup.add(bodice);

  const cupGeo = new THREE.SphereGeometry(0.092, 14, 10);
  cupGeo.scale(0.98, 0.92, 0.88);
  for (const side of [-1, 1]) {
    const cup = new THREE.Mesh(cupGeo, materials.suit);
    cup.position.set(side * 0.076, 0.25, 0.090);
    attachOutline(cup, materials.outlinePurple, 0.008);
    torsoSuitGroup.add(cup);
  }
  mergeGroupByMaterial(torsoSuitGroup);

  // Static torso skin (chest + neck merged)
  const torsoSkinGroup = new THREE.Group();
  torsoPivot.add(torsoSkinGroup);

  const chestGeo = new THREE.SphereGeometry(0.152, 16, 12);
  chestGeo.scale(1.14, 0.72, 0.78);
  const chest = new THREE.Mesh(chestGeo, materials.skin);
  chest.position.set(0, 0.335, 0.005);
  attachOutline(chest, materials.outlineSkin, 0.0085);
  torsoSkinGroup.add(chest);

  const neckGeo = new THREE.CylinderGeometry(0.072, 0.086, 0.14, 12);
  const neck = new THREE.Mesh(neckGeo, materials.skin);
  neck.position.set(0, 0.425, 0.0);
  attachOutline(neck, materials.outlineSkin, 0.0075);
  torsoSkinGroup.add(neck);
  mergeGroupByMaterial(torsoSkinGroup);

  const collarGeo = new THREE.CylinderGeometry(0.096, 0.118, 0.074, 16, 1, false);
  const collar = new THREE.Mesh(collarGeo, materials.white);
  collar.position.set(0, 0.415, 0.005);
  attachOutline(collar, materials.outlineWhite, 0.007);
  torsoPivot.add(collar);

  const bowTie = buildBowTie(materials);
  bowTie.position.set(0, 0.40, 0.118);
  bowTie.scale.setScalar(0.92);
  torsoPivot.add(bowTie);

  // --- ARMS (soft outlines matching skin) ---
  const rightArmPivot = new THREE.Group();
  rightArmPivot.name = 'right_arm_pivot';
  rightArmPivot.position.set(-0.175, 0.33, 0.01);
  torsoPivot.add(rightArmPivot);

  const jointGeo = new THREE.SphereGeometry(0.044, 10, 8);
  const rShoulder = new THREE.Mesh(jointGeo, materials.skin);
  attachOutline(rShoulder, materials.outlineSkin, 0.007);
  rightArmPivot.add(rShoulder);

  const upperArmGeo = new THREE.CylinderGeometry(0.044, 0.041, 0.20, 10, 1, true);
  const rUpperArm = new THREE.Mesh(upperArmGeo, materials.skin);
  rUpperArm.position.set(0, -0.10, 0);
  attachOutline(rUpperArm, materials.outlineSkin, 0.007);
  rightArmPivot.add(rUpperArm);

  const rightElbowPivot = new THREE.Group();
  rightElbowPivot.position.set(0, -0.20, 0);
  rightArmPivot.add(rightElbowPivot);

  const rElbow = new THREE.Mesh(jointGeo, materials.skin);
  rElbow.scale.setScalar(0.86);
  rightElbowPivot.add(rElbow);

  const forearmGeo = new THREE.CylinderGeometry(0.040, 0.036, 0.16, 10, 1, true);
  const rForearm = new THREE.Mesh(forearmGeo, materials.skin);
  rForearm.position.set(0, -0.08, 0);
  attachOutline(rForearm, materials.outlineSkin, 0.007);
  rightElbowPivot.add(rForearm);

  const buildCuff = (buttonSide) => {
    const cuffGroup = new THREE.Group();
    const cuffGeo = new THREE.CylinderGeometry(0.055, 0.047, 0.080, 12);
    const cuff = new THREE.Mesh(cuffGeo, materials.white);
    attachOutline(cuff, materials.outlineWhite, 0.007);
    cuffGroup.add(cuff);

    const btnGeo = new THREE.SphereGeometry(0.012, 7, 7);
    const btn = new THREE.Mesh(btnGeo, materials.suit);
    btn.position.set(buttonSide * 0.050, -0.012, 0.015);
    cuffGroup.add(btn);
    return cuffGroup;
  };

  const rCuff = buildCuff(-1);
  rCuff.position.set(0, -0.165, 0);
  rightElbowPivot.add(rCuff);

  const rHand = buildHand(materials, -1);
  rHand.position.set(0, -0.212, 0);
  rHand.rotation.x = Math.PI * 0.46;
  rHand.rotation.y = 0.22;
  rightElbowPivot.add(rHand);

  rightArmPivot.rotation.set(-0.28, 0.12, -0.18);
  rightElbowPivot.rotation.set(-0.62, 0.18, 0.45);

  // Left arm (welcome palm-up gesture & kiss pose)
  const leftArmPivot = new THREE.Group();
  leftArmPivot.name = 'left_arm_pivot';
  leftArmPivot.position.set(0.175, 0.33, 0.01);
  torsoPivot.add(leftArmPivot);

  const lShoulder = new THREE.Mesh(jointGeo, materials.skin);
  attachOutline(lShoulder, materials.outlineSkin, 0.007);
  leftArmPivot.add(lShoulder);

  const lUpperArm = new THREE.Mesh(upperArmGeo, materials.skin);
  lUpperArm.position.set(0, -0.10, 0);
  attachOutline(lUpperArm, materials.outlineSkin, 0.007);
  leftArmPivot.add(lUpperArm);

  const leftElbowPivot = new THREE.Group();
  leftElbowPivot.name = 'left_elbow_pivot';
  leftElbowPivot.position.set(0, -0.20, 0);
  leftArmPivot.add(leftElbowPivot);

  const lElbow = new THREE.Mesh(jointGeo, materials.skin);
  lElbow.scale.setScalar(0.86);
  leftElbowPivot.add(lElbow);

  const lForearm = new THREE.Mesh(forearmGeo, materials.skin);
  lForearm.position.set(0, -0.08, 0);
  attachOutline(lForearm, materials.outlineSkin, 0.007);
  leftElbowPivot.add(lForearm);

  const lCuff = buildCuff(1);
  lCuff.position.set(0, -0.165, 0);
  leftElbowPivot.add(lCuff);

  const leftWristPivot = new THREE.Group();
  leftWristPivot.name = 'left_wrist_pivot';
  leftWristPivot.position.set(0, -0.212, 0);
  leftElbowPivot.add(leftWristPivot);

  const lHand = buildHand(materials, 1);
  lHand.rotation.x = Math.PI * 0.5;
  lHand.rotation.z = Math.PI;
  leftWristPivot.add(lHand);

  const welcomeArmRot = new THREE.Euler(-0.08, 0.14, 0.56);
  const welcomeElbowRot = new THREE.Euler(-1.26, 0.18, 0.92);
  const welcomeWristRot = new THREE.Euler(0.22, 0.18, -0.35);

  const kissArmRot = new THREE.Euler(-0.62, -0.18, 0.72);
  const kissElbowRot = new THREE.Euler(-1.72, 0.48, -0.78);
  const kissWristRot = new THREE.Euler(-0.18, -0.55, 0.65);

  leftArmPivot.rotation.copy(welcomeArmRot);
  leftElbowPivot.rotation.copy(welcomeElbowRot);
  leftWristPivot.rotation.copy(welcomeWristRot);

  // --- ENLARGED ROUND CHIBI HEAD (~2.2頭身) ---
  const headPivot = new THREE.Group();
  headPivot.name = 'head_pivot';
  headPivot.position.set(0, 0.46, 0.02);
  headPivot.rotation.set(-0.04, -0.16, 0.10);
  headPivot.scale.setScalar(1.18); // ~1.18 * 0.92 = ~1.09 world head scale on compact body -> ~2.2 head-tall!
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

  const humanEarGeo = new THREE.SphereGeometry(0.068, 9, 8);
  humanEarGeo.scale(0.55, 1.0, 0.65);
  for (const side of [-1, 1]) {
    const hEar = new THREE.Mesh(humanEarGeo, materials.skin);
    hEar.position.set(side * 0.44, -0.05, 0.0);
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

  // Mouth anchor right at her lips for accurate kiss heart emission
  const mouthAnchor = new THREE.Object3D();
  mouthAnchor.position.set(0.03, -0.25, 0.45);
  headMeshGroup.add(mouthAnchor);

  // --- FLUFFY ROUNDED S-WAVE HAIR + FULL BACK HAIR MASS + ANGEL RING HIGHLIGHT ---
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
  attachOutline(hairCap, materials.outlineHair, 0.007);
  staticHairGroup.add(hairCap);

  const topDomeGeo = new THREE.SphereGeometry(0.425, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.42);
  topDomeGeo.scale(1.12, 0.92, 1.04);
  const topDome = new THREE.Mesh(topDomeGeo, materials.hair);
  topDome.position.set(0, 0.07, -0.02);
  topDome.rotation.x = -0.16;
  attachOutline(topDome, materials.outlineHair, 0.007);
  staticHairGroup.add(topDome);

  // Angel-ring chestnut highlight hugging the exact curvature of the top hair dome
  const haloGeo = new THREE.SphereGeometry(
    0.429,
    20,
    6,
    Math.PI * 0.22,
    Math.PI * 0.56,
    Math.PI * 0.23,
    Math.PI * 0.065
  );
  haloGeo.scale(1.12, 0.92, 1.04);
  const haloMesh = new THREE.Mesh(haloGeo, materials.hairHighlight);
  haloMesh.position.set(0, 0.072, -0.02);
  haloMesh.rotation.x = -0.16;
  staticHairGroup.add(haloMesh);

  // Plump rounded-tip S-wave hair lock helper (NO spiky tips!)
  const addFluffyHairLock = (parent, pts, maxR, flattenZ = 0.65, minTip = 0.24) => {
    const geo = createTaperedTube(
      pts,
      (t) => {
        const rootRamp = Math.min(1, t * 4.5 + 0.55);
        const midPlump = 0.85 + Math.sin(t * Math.PI * 0.85) * 0.25;
        const tipRound =
          t > 0.76
            ? Math.max(minTip, Math.cos(((t - 0.76) / 0.24) * Math.PI * 0.47))
            : 1.0;
        return maxR * rootRamp * midPlump * tipRound;
      },
      16,
      8,
      flattenZ
    );
    const mesh = new THREE.Mesh(geo, materials.hair);
    attachOutline(mesh, materials.outlineHair, 0.0068);
    parent.add(mesh);
    return mesh;
  };

  // Soft rounded bangs framing forehead cleanly above eyebrows
  addFluffyHairLock(
    staticHairGroup,
    [
      new THREE.Vector3(-0.08, 0.43, 0.15),
      new THREE.Vector3(0.08, 0.32, 0.36),
      new THREE.Vector3(0.25, 0.19, 0.39),
      new THREE.Vector3(0.37, 0.07, 0.34),
    ],
    0.095,
    0.55,
    0.34
  );
  addFluffyHairLock(
    staticHairGroup,
    [
      new THREE.Vector3(-0.06, 0.44, 0.13),
      new THREE.Vector3(0.16, 0.34, 0.32),
      new THREE.Vector3(0.34, 0.22, 0.33),
      new THREE.Vector3(0.43, 0.09, 0.26),
    ],
    0.090,
    0.58,
    0.34
  );
  addFluffyHairLock(
    staticHairGroup,
    [
      new THREE.Vector3(-0.08, 0.42, 0.18),
      new THREE.Vector3(0.01, 0.29, 0.39),
      new THREE.Vector3(0.12, 0.17, 0.41),
    ],
    0.074,
    0.52,
    0.38
  );
  addFluffyHairLock(
    staticHairGroup,
    [
      new THREE.Vector3(-0.11, 0.42, 0.16),
      new THREE.Vector3(-0.25, 0.31, 0.35),
      new THREE.Vector3(-0.37, 0.18, 0.33),
      new THREE.Vector3(-0.43, 0.06, 0.25),
    ],
    0.094,
    0.55,
    0.34
  );
  mergeGroupByMaterial(staticHairGroup);

  // Fluffy S-wave side curls flaring gently outward past cheeks & shoulders
  const leftSideHairPivot = new THREE.Group();
  const rightSideHairPivot = new THREE.Group();
  hairGroup.add(leftSideHairPivot, rightSideHairPivot);

  // Viewer's left side locks (-X)
  addFluffyHairLock(
    rightSideHairPivot,
    [
      new THREE.Vector3(-0.41, 0.24, 0.08),
      new THREE.Vector3(-0.48, -0.02, 0.14),
      new THREE.Vector3(-0.44, -0.26, 0.12),
      new THREE.Vector3(-0.56, -0.44, 0.16),
      new THREE.Vector3(-0.50, -0.53, 0.12),
    ],
    0.105,
    0.72,
    0.36
  );
  addFluffyHairLock(
    rightSideHairPivot,
    [
      new THREE.Vector3(-0.42, 0.16, -0.06),
      new THREE.Vector3(-0.53, -0.10, -0.02),
      new THREE.Vector3(-0.49, -0.34, -0.04),
      new THREE.Vector3(-0.62, -0.51, 0.04),
    ],
    0.112,
    0.75,
    0.36
  );

  // Viewer's right side locks (+X)
  addFluffyHairLock(
    leftSideHairPivot,
    [
      new THREE.Vector3(0.41, 0.24, 0.08),
      new THREE.Vector3(0.49, -0.02, 0.14),
      new THREE.Vector3(0.45, -0.24, 0.12),
      new THREE.Vector3(0.57, -0.42, 0.16),
      new THREE.Vector3(0.51, -0.50, 0.12),
    ],
    0.105,
    0.72,
    0.36
  );
  addFluffyHairLock(
    leftSideHairPivot,
    [
      new THREE.Vector3(0.42, 0.16, -0.06),
      new THREE.Vector3(0.53, -0.10, -0.02),
      new THREE.Vector3(0.49, -0.32, -0.04),
      new THREE.Vector3(0.62, -0.48, 0.04),
    ],
    0.112,
    0.75,
    0.36
  );

  // Lush gap-free back hair mass strictly BEHIND neck & torso (never intruding on chin/bow tie!)
  const backHairPivot = new THREE.Group();
  backHairPivot.name = 'back_hair_pivot';
  hairGroup.add(backHairPivot);

  const backMassGeo = new THREE.SphereGeometry(0.45, 18, 14);
  backMassGeo.scale(1.06, 0.94, 0.38);
  const backMass = new THREE.Mesh(backMassGeo, materials.hair);
  backMass.position.set(0, -0.15, -0.29);
  attachOutline(backMass, materials.outlineHair, 0.0072);
  backHairPivot.add(backMass);

  const backFluffGeo = new THREE.SphereGeometry(0.46, 18, 12);
  backFluffGeo.scale(1.14, 0.64, 0.36);
  const backFluff = new THREE.Mesh(backFluffGeo, materials.hair);
  backFluff.position.set(0, -0.37, -0.31);
  attachOutline(backFluff, materials.outlineHair, 0.0072);
  backHairPivot.add(backFluff);

  // 8 thick rounded S-wave curls arranged around the back & shoulders
  const backCount = 8;
  for (let i = 0; i < backCount; i++) {
    const t = i / (backCount - 1);
    const angle = (t - 0.5) * Math.PI * 1.05;
    const sinA = Math.sin(angle);
    const cosA = -Math.cos(angle);
    const waveDir = i % 2 === 0 ? 1 : -1;
    const baseR = 0.43;

    const p0 = new THREE.Vector3(sinA * baseR, 0.16, cosA * baseR - 0.06);
    const p1 = new THREE.Vector3(sinA * (baseR + 0.08), -0.10, cosA * (baseR + 0.06) - 0.08);
    const p2 = new THREE.Vector3(
      sinA * (baseR + 0.07) + waveDir * 0.05,
      -0.36,
      cosA * (baseR + 0.04) - 0.09
    );
    const p3 = new THREE.Vector3(
      sinA * (baseR + 0.17) - waveDir * 0.03,
      -0.55 - (i % 2) * 0.04,
      cosA * (baseR + 0.09) - 0.07
    );
    addFluffyHairLock(backHairPivot, [p0, p1, p2, p3], 0.135, 0.65, 0.42);
  }

  mergeGroupByMaterial(leftSideHairPivot);
  mergeGroupByMaterial(rightSideHairPivot);
  mergeGroupByMaterial(backHairPivot);

  // --- PURPLE BUNNY EAR HEADBAND & ROUNDED BUNNY EARS (with folded ear tip!) ---
  const headbandGeo = new THREE.TorusGeometry(0.46, 0.036, 8, 24, Math.PI * 1.12);
  const headband = new THREE.Mesh(headbandGeo, materials.suit);
  headband.position.set(0, 0.06, -0.01);
  headband.rotation.z = -Math.PI * 0.06;
  headband.rotation.x = -0.16;
  attachOutline(headband, materials.outlinePurple, 0.0085);
  headMeshGroup.add(headband);

  // Flopped bunny ear with cute folded tip
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

  // Tall rounded bunny ear
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

  return {
    root,
    hipsGroup,
    torsoPivot,
    headPivot,
    headMeshGroup,
    mouthAnchor,
    faceMesh,
    leftArmPivot,
    leftElbowPivot,
    leftWristPivot,
    rightArmPivot,
    rightElbowPivot,
    leftBunnyEarPivot,
    rightBunnyEarPivot,
    backHairPivot,
    leftSideHairPivot,
    rightSideHairPivot,
    tailPivot,
    poses: {
      headBase: headPivot.rotation.clone(),
      torsoBase: torsoPivot.rotation.clone(),
      rightEarBase: rightBunnyEarPivot.rotation.clone(),
      leftEarBase: leftBunnyEarPivot.rotation.clone(),
      welcomeArmRot,
      welcomeElbowRot,
      welcomeWristRot,
      kissArmRot,
      kissElbowRot,
      kissWristRot,
    },
  };
}
