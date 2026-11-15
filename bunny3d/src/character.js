import * as THREE from 'three';
import { attachOutline, mergeGroupByMaterial } from './toon.js';

/**
 * Shared head deformation so the base skin sphere and curved face decal match seamlessly.
 */
function deformChibiHeadPoint(v) {
  const out = v.clone();
  out.x *= 1.09;
  out.y *= 0.96;
  out.z *= 0.94;

  // Soft lower-cheek plumpness and gentle chin contour
  if (out.y < 0.06) {
    const t = Math.min(1, (0.06 - out.y) / 0.44);
    const cheekBulge = Math.sin(t * Math.PI * 0.85) * 0.036;
    out.x *= 1 + cheekBulge * 1.35;
    if (out.z > 0) {
      out.z += cheekBulge * 0.35 * (1 - t * 0.4);
    }
    if (t > 0.72) {
      const chinT = (t - 0.72) / 0.28;
      out.y += chinT * 0.025;
    }
  }
  return out;
}

function createChibiHeadGeometry(radius = 0.41) {
  const geo = new THREE.SphereGeometry(radius, 32, 24);
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
 * Curved spherical patch matching the front of the chibi head for facial decals.
 */
function createFaceDecalGeometry(radius = 0.41) {
  const segsW = 26;
  const segsH = 22;
  const thetaSpan = 1.56; // wide enough for large anime eyes
  const phiMin = Math.PI * 0.26;
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
 * Create a smooth tapered tube along a CatmullRomCurve3 (used for hair locks & legs).
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
 * Parametric smoothly subdivided bunny ear leaf geometry (avoids flat-cap faceting).
 */
function createParametricEarGeometry({
  height = 0.56,
  maxHalfWidth = 0.14,
  thickness = 0.032,
  bendForward = 0.12,
  bendSide = 0.0,
  scale = 1.0,
  concave = 0.018,
  segU = 14,
  segV = 18,
}) {
  const positions = [];
  const indices = [];

  for (let iv = 0; iv <= segV; iv++) {
    const v = iv / segV; // 0 = base, 1 = tip
    const y = v * height * scale;
    // Graceful leaf silhouette width profile
    const wFactor = Math.sin(Math.pow(v, 0.72) * Math.PI) * 0.88 + (1 - v) * 0.24;
    const halfW = maxHalfWidth * wFactor * scale;
    const thickAtV = thickness * (0.55 + 0.45 * Math.sin(v * Math.PI)) * scale;

    const bendX = bendSide * v * v * scale;
    const bendZ = bendForward * v * v * scale;

    for (let iu = 0; iu <= segU; iu++) {
      const u = iu / segU; // wraps around ellipse: 0..1
      const theta = u * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const x = cosT * halfW + bendX;
      // Gently dish the front (+Z) inner surface while rounding the back (-Z)
      const dish = sinT > 0 ? -concave * (1 - cosT * cosT) * Math.sin(v * Math.PI) * scale : 0;
      const z = sinT * thickAtV + dish + bendZ;
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

/**
 * Build a smooth parametric bunny ear with recessed concave inner ear patch.
 */
function buildBunnyEar(materials, opts) {
  const pivot = new THREE.Group();

  const outerGeo = createParametricEarGeometry(opts);
  const outerMesh = new THREE.Mesh(outerGeo, materials.suit);
  outerMesh.name = 'bunny_ear_outer';
  attachOutline(outerMesh, materials.outline, 0.011);
  pivot.add(outerMesh);

  const innerGeo = createParametricEarGeometry({
    height: opts.height * 0.80,
    maxHalfWidth: opts.maxHalfWidth * 0.58,
    thickness: opts.thickness * 0.48,
    bendForward: opts.bendForward * 0.85,
    bendSide: opts.bendSide * 0.85,
    concave: 0.008,
    segU: 12,
    segV: 14,
  });
  innerGeo.translate(0, opts.height * 0.08, opts.thickness * 0.55);
  const innerMesh = new THREE.Mesh(innerGeo, materials.innerEar);
  innerMesh.name = 'bunny_ear_inner';
  pivot.add(innerMesh);

  return pivot;
}

/**
 * Build a cute chibi hand (palm + thumb + 4 fingers).
 */
function buildHand(materials, side = 1) {
  const hand = new THREE.Group();

  const palmGeo = new THREE.SphereGeometry(0.056, 12, 10);
  palmGeo.scale(0.95, 0.56, 1.05);
  const palm = new THREE.Mesh(palmGeo, materials.skin);
  palm.position.set(0, 0, 0.045);
  attachOutline(palm, materials.outline, 0.008);
  hand.add(palm);

  const fingerSpecs = [
    { x: -0.034, len: 0.066, r: 0.0135 },
    { x: -0.011, len: 0.076, r: 0.014 },
    { x: 0.013, len: 0.072, r: 0.0135 },
    { x: 0.035, len: 0.058, r: 0.012 },
  ];

  for (const spec of fingerSpecs) {
    const fGeo = new THREE.CapsuleGeometry(spec.r, spec.len * 0.52, 4, 8);
    fGeo.rotateX(Math.PI * 0.5);
    const finger = new THREE.Mesh(fGeo, materials.skin);
    finger.position.set(spec.x * side, 0.002, 0.095 + spec.len * 0.16);
    finger.rotation.y = spec.x * side * 1.1;
    attachOutline(finger, materials.outline, 0.0065);
    hand.add(finger);
  }

  const thumbGeo = new THREE.CapsuleGeometry(0.014, 0.04, 4, 8);
  thumbGeo.rotateX(Math.PI * 0.5);
  const thumb = new THREE.Mesh(thumbGeo, materials.skin);
  thumb.position.set(-0.052 * side, 0.014, 0.052);
  thumb.rotation.y = -0.62 * side;
  thumb.rotation.x = -0.18;
  attachOutline(thumb, materials.outline, 0.0065);
  hand.add(thumb);

  return mergeGroupByMaterial(hand);
}

/**
 * Build a glossy black high-heel pump with curved toe, heel cup, and stiletto heel.
 */
function buildHighHeel(materials) {
  const shoe = new THREE.Group();

  const bodyGeo = new THREE.SphereGeometry(0.068, 14, 12);
  bodyGeo.scale(0.82, 0.62, 1.55);
  const body = new THREE.Mesh(bodyGeo, materials.heel);
  body.position.set(0, 0.036, 0.038);
  body.rotation.x = 0.12;
  attachOutline(body, materials.outline, 0.009);
  shoe.add(body);

  const cupGeo = new THREE.CylinderGeometry(0.046, 0.042, 0.072, 12);
  const cup = new THREE.Mesh(cupGeo, materials.heel);
  cup.position.set(0, 0.046, -0.045);
  cup.rotation.x = -0.12;
  attachOutline(cup, materials.outline, 0.008);
  shoe.add(cup);

  const heelGeo = new THREE.CylinderGeometry(0.014, 0.007, 0.088, 8);
  const heel = new THREE.Mesh(heelGeo, materials.heel);
  heel.position.set(0, -0.014, -0.064);
  heel.rotation.x = 0.08;
  attachOutline(heel, materials.outline, 0.006);
  shoe.add(heel);

  return mergeGroupByMaterial(shoe);
}

/**
 * Build the purple bow tie at the front of the collar.
 */
function buildBowTie(materials) {
  const bow = new THREE.Group();

  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.quadraticCurveTo(0.075, 0.055, 0.105, 0.036);
  wingShape.quadraticCurveTo(0.118, 0, 0.105, -0.036);
  wingShape.quadraticCurveTo(0.075, -0.055, 0, 0);

  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.022,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.008,
    bevelSegments: 2,
    curveSegments: 8,
  });
  wingGeo.translate(0, 0, -0.011);

  const rightWing = new THREE.Mesh(wingGeo, materials.suit);
  rightWing.rotation.y = -0.18;
  attachOutline(rightWing, materials.outline, 0.008);
  bow.add(rightWing);

  const leftWing = new THREE.Mesh(wingGeo, materials.suit);
  leftWing.rotation.z = Math.PI;
  leftWing.rotation.y = 0.18;
  attachOutline(leftWing, materials.outline, 0.008);
  bow.add(leftWing);

  const knotGeo = new THREE.SphereGeometry(0.028, 12, 10);
  knotGeo.scale(0.95, 1.15, 0.9);
  const knot = new THREE.Mesh(knotGeo, materials.suitTrim);
  knot.position.z = 0.008;
  attachOutline(knot, materials.outline, 0.007);
  bow.add(knot);

  return mergeGroupByMaterial(bow);
}

/**
 * Build hip lace-up criss-cross straps and bow ribbon.
 */
function buildHipLaceUp(materials) {
  const laceGroup = new THREE.Group();

  const strapGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.072, 6);
  for (let i = 0; i < 3; i++) {
    const yOff = (1 - i) * 0.042;
    const s1 = new THREE.Mesh(strapGeo, materials.suitTrim);
    s1.position.set(0, yOff, 0);
    s1.rotation.x = 0.72;
    attachOutline(s1, materials.outline, 0.004);
    laceGroup.add(s1);

    const s2 = new THREE.Mesh(strapGeo, materials.suitTrim);
    s2.position.set(0, yOff, 0);
    s2.rotation.x = -0.72;
    attachOutline(s2, materials.outline, 0.004);
    laceGroup.add(s2);
  }

  const loopGeo = new THREE.TorusGeometry(0.022, 0.0055, 6, 14);
  const loop1 = new THREE.Mesh(loopGeo, materials.suitTrim);
  loop1.position.set(-0.005, -0.072, 0.022);
  loop1.rotation.y = Math.PI * 0.5;
  loop1.rotation.x = 0.35;
  attachOutline(loop1, materials.outline, 0.004);
  laceGroup.add(loop1);

  const loop2 = new THREE.Mesh(loopGeo, materials.suitTrim);
  loop2.position.set(-0.005, -0.072, -0.022);
  loop2.rotation.y = Math.PI * 0.5;
  loop2.rotation.x = -0.35;
  attachOutline(loop2, materials.outline, 0.004);
  laceGroup.add(loop2);

  const tailGeo = new THREE.CylinderGeometry(0.005, 0.004, 0.085, 6);
  const tipGeo = new THREE.SphereGeometry(0.007, 8, 6);
  for (const zDir of [-1, 1]) {
    const tail = new THREE.Mesh(tailGeo, materials.suitTrim);
    tail.position.set(-0.012, -0.115, zDir * 0.016);
    tail.rotation.x = zDir * 0.18;
    tail.rotation.z = -0.16;
    attachOutline(tail, materials.outline, 0.004);
    laceGroup.add(tail);

    const tip = new THREE.Mesh(tipGeo, materials.gold);
    tip.position.set(-0.019, -0.156, zDir * 0.024);
    laceGroup.add(tip);
  }

  return mergeGroupByMaterial(laceGroup);
}

/**
 * Construct the full procedural chibi bunny character and return animated rig handles.
 */
export function createBunnyCharacter(materials, faceTexture) {
  const root = new THREE.Group();
  root.name = 'bunny_root';

  // Lower body / hips (rotated ~54 deg toward viewer's right so knees point front-right and both heels show back-left)
  const hipsGroup = new THREE.Group();
  hipsGroup.name = 'hips_group';
  hipsGroup.rotation.y = 0.94;
  root.add(hipsGroup);

  // --- CONTINUOUS KNEELING LEGS (Fishnet tights + High heels, zero knee seam) ---
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
          return 0.106 - u * 0.026 + Math.sin(u * Math.PI) * 0.01;
        }
        const u = (t - 0.45) / 0.55;
        return 0.080 + Math.sin(u * Math.PI) * 0.01 - u * 0.028;
      },
      28,
      14
    );
    const legMesh = new THREE.Mesh(legGeo, materials.fishnet);
    legMesh.name = side < 0 ? 'leg_r' : 'leg_l';
    attachOutline(legMesh, materials.outline, 0.011);
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

  // --- BUNNY SUIT PELVIS & TAIL ---
  const pelvisGeo = new THREE.SphereGeometry(0.205, 18, 14);
  pelvisGeo.scale(1.06, 0.88, 0.98);
  const pelvis = new THREE.Mesh(pelvisGeo, materials.suit);
  pelvis.position.set(0, 0.39, -0.04);
  attachOutline(pelvis, materials.outline, 0.012);
  hipsGroup.add(pelvis);

  const laceR = buildHipLaceUp(materials);
  laceR.position.set(-0.205, 0.39, -0.02);
  laceR.rotation.z = -0.14;
  hipsGroup.add(laceR);

  const laceL = buildHipLaceUp(materials);
  laceL.position.set(0.205, 0.39, -0.02);
  laceL.rotation.y = Math.PI;
  laceL.rotation.z = 0.14;
  hipsGroup.add(laceL);

  const tailPivot = new THREE.Group();
  tailPivot.name = 'tail_pivot';
  tailPivot.position.set(0, 0.43, -0.245);
  const tailCenterGeo = new THREE.SphereGeometry(0.118, 14, 12);
  const tailCenter = new THREE.Mesh(tailCenterGeo, materials.white);
  attachOutline(tailCenter, materials.outline, 0.011);
  tailPivot.add(tailCenter);

  const puffOffsets = [
    [0.055, 0.045, -0.035, 0.072],
    [-0.055, 0.045, -0.035, 0.072],
    [0.05, -0.045, -0.035, 0.07],
    [-0.05, -0.045, -0.035, 0.07],
    [0, 0.055, -0.055, 0.074],
    [0, -0.03, -0.068, 0.068],
  ];
  const puffGeo = new THREE.SphereGeometry(1, 10, 8);
  for (const [px, py, pz, pr] of puffOffsets) {
    const puff = new THREE.Mesh(puffGeo, materials.white);
    puff.position.set(px, py, pz);
    puff.scale.setScalar(pr);
    attachOutline(puff, materials.outline, 0.008 / pr);
    tailPivot.add(puff);
  }
  mergeGroupByMaterial(tailPivot);
  hipsGroup.add(tailPivot);

  // --- TORSO ---
  const torsoPivot = new THREE.Group();
  torsoPivot.name = 'torso_pivot';
  torsoPivot.position.set(0, 0.44, -0.03);
  torsoPivot.rotation.y = -0.52; // counter-twist so upper body faces ~24 deg front-right
  torsoPivot.rotation.x = 0.08;
  hipsGroup.add(torsoPivot);

  const bodicePoints = [
    new THREE.Vector2(0.155, 0.0),
    new THREE.Vector2(0.132, 0.11),
    new THREE.Vector2(0.145, 0.21),
    new THREE.Vector2(0.168, 0.30),
    new THREE.Vector2(0.132, 0.34),
    new THREE.Vector2(0.01, 0.34),
  ];
  const bodiceGeo = new THREE.LatheGeometry(bodicePoints, 20);
  bodiceGeo.scale(1.08, 1, 0.86);
  const bodice = new THREE.Mesh(bodiceGeo, materials.suit);
  attachOutline(bodice, materials.outline, 0.011);
  torsoPivot.add(bodice);

  const cupGeo = new THREE.SphereGeometry(0.095, 16, 12);
  cupGeo.scale(0.98, 0.92, 0.9);
  for (const side of [-1, 1]) {
    const cup = new THREE.Mesh(cupGeo, materials.suit);
    cup.position.set(side * 0.078, 0.265, 0.092);
    attachOutline(cup, materials.outline, 0.009);
    torsoPivot.add(cup);
  }

  const chestGeo = new THREE.SphereGeometry(0.152, 18, 14);
  chestGeo.scale(1.14, 0.72, 0.78);
  const chest = new THREE.Mesh(chestGeo, materials.skin);
  chest.position.set(0, 0.355, 0.005);
  attachOutline(chest, materials.outline, 0.01);
  torsoPivot.add(chest);

  const neckGeo = new THREE.CylinderGeometry(0.072, 0.086, 0.15, 14);
  const neck = new THREE.Mesh(neckGeo, materials.skin);
  neck.position.set(0, 0.45, 0.0);
  attachOutline(neck, materials.outline, 0.009);
  torsoPivot.add(neck);

  const collarGeo = new THREE.CylinderGeometry(0.096, 0.118, 0.078, 18, 1, false);
  const collar = new THREE.Mesh(collarGeo, materials.white);
  collar.position.set(0, 0.44, 0.005);
  attachOutline(collar, materials.outline, 0.008);
  torsoPivot.add(collar);

  const bowTie = buildBowTie(materials);
  bowTie.position.set(0, 0.425, 0.118);
  bowTie.scale.setScalar(0.95);
  torsoPivot.add(bowTie);

  // --- RIGHT ARM (viewer's left: smooth continuous curve resting on lap) ---
  const rightArmPivot = new THREE.Group();
  rightArmPivot.name = 'right_arm_pivot';
  rightArmPivot.position.set(-0.175, 0.35, 0.01);
  torsoPivot.add(rightArmPivot);

  const jointGeo = new THREE.SphereGeometry(0.044, 12, 10);
  const rShoulder = new THREE.Mesh(jointGeo, materials.skin);
  attachOutline(rShoulder, materials.outline, 0.008);
  rightArmPivot.add(rShoulder);

  const upperArmGeo = new THREE.CylinderGeometry(0.044, 0.041, 0.21, 12, 1, true);
  const rUpperArm = new THREE.Mesh(upperArmGeo, materials.skin);
  rUpperArm.position.set(0, -0.105, 0);
  attachOutline(rUpperArm, materials.outline, 0.008);
  rightArmPivot.add(rUpperArm);

  const rightElbowPivot = new THREE.Group();
  rightElbowPivot.position.set(0, -0.21, 0);
  rightArmPivot.add(rightElbowPivot);

  const rElbow = new THREE.Mesh(jointGeo, materials.skin);
  rElbow.scale.setScalar(0.86);
  rightElbowPivot.add(rElbow);

  const forearmGeo = new THREE.CylinderGeometry(0.040, 0.036, 0.17, 12, 1, true);
  const rForearm = new THREE.Mesh(forearmGeo, materials.skin);
  rForearm.position.set(0, -0.085, 0);
  attachOutline(rForearm, materials.outline, 0.008);
  rightElbowPivot.add(rForearm);

  const buildCuff = (buttonSide) => {
    const cuffGroup = new THREE.Group();
    const cuffGeo = new THREE.CylinderGeometry(0.056, 0.048, 0.084, 14);
    const cuff = new THREE.Mesh(cuffGeo, materials.white);
    attachOutline(cuff, materials.outline, 0.008);
    cuffGroup.add(cuff);

    const btnGeo = new THREE.SphereGeometry(0.012, 8, 8);
    const btn = new THREE.Mesh(btnGeo, materials.suit);
    btn.position.set(buttonSide * 0.051, -0.012, 0.016);
    cuffGroup.add(btn);
    return cuffGroup;
  };

  const rCuff = buildCuff(-1);
  rCuff.position.set(0, -0.175, 0);
  rightElbowPivot.add(rCuff);

  const rHand = buildHand(materials, -1);
  rHand.position.set(0, -0.228, 0);
  rHand.rotation.x = Math.PI * 0.46;
  rHand.rotation.y = 0.22;
  rightElbowPivot.add(rHand);

  rightArmPivot.rotation.set(-0.28, 0.12, -0.18);
  rightElbowPivot.rotation.set(-0.62, 0.18, 0.45);

  // --- LEFT ARM (viewer's right: welcome palm-up gesture & blown-kiss pose) ---
  const leftArmPivot = new THREE.Group();
  leftArmPivot.name = 'left_arm_pivot';
  leftArmPivot.position.set(0.175, 0.35, 0.01);
  torsoPivot.add(leftArmPivot);

  const lShoulder = new THREE.Mesh(jointGeo, materials.skin);
  attachOutline(lShoulder, materials.outline, 0.008);
  leftArmPivot.add(lShoulder);

  const lUpperArm = new THREE.Mesh(upperArmGeo, materials.skin);
  lUpperArm.position.set(0, -0.105, 0);
  attachOutline(lUpperArm, materials.outline, 0.0085);
  leftArmPivot.add(lUpperArm);

  const leftElbowPivot = new THREE.Group();
  leftElbowPivot.name = 'left_elbow_pivot';
  leftElbowPivot.position.set(0, -0.21, 0);
  leftArmPivot.add(leftElbowPivot);

  const lElbow = new THREE.Mesh(jointGeo, materials.skin);
  lElbow.scale.setScalar(0.88);
  leftElbowPivot.add(lElbow);

  const lForearm = new THREE.Mesh(forearmGeo, materials.skin);
  lForearm.position.set(0, -0.085, 0);
  attachOutline(lForearm, materials.outline, 0.0085);
  leftElbowPivot.add(lForearm);

  const lCuff = buildCuff(1);
  lCuff.position.set(0, -0.175, 0);
  leftElbowPivot.add(lCuff);

  const leftWristPivot = new THREE.Group();
  leftWristPivot.name = 'left_wrist_pivot';
  leftWristPivot.position.set(0, -0.225, 0);
  leftElbowPivot.add(leftWristPivot);

  const lHand = buildHand(materials, 1);
  lHand.rotation.x = Math.PI * 0.5;
  lHand.rotation.z = Math.PI;
  leftWristPivot.add(lHand);

  // Refined welcome gesture (higher forearm & open palm angled gently toward viewer)
  const welcomeArmRot = new THREE.Euler(-0.08, 0.14, 0.56);
  const welcomeElbowRot = new THREE.Euler(-1.26, 0.18, 0.92);
  const welcomeWristRot = new THREE.Euler(0.22, 0.18, -0.35);

  // Refined kiss gesture (hand tucked gracefully up beside mouth/chin)
  const kissArmRot = new THREE.Euler(-0.62, -0.18, 0.72);
  const kissElbowRot = new THREE.Euler(-1.72, 0.48, -0.78);
  const kissWristRot = new THREE.Euler(-0.18, -0.55, 0.65);

  leftArmPivot.rotation.copy(welcomeArmRot);
  leftElbowPivot.rotation.copy(welcomeElbowRot);
  leftWristPivot.rotation.copy(welcomeWristRot);

  // --- HEAD & FACE ---
  const headPivot = new THREE.Group();
  headPivot.name = 'head_pivot';
  headPivot.position.set(0, 0.49, 0.02);
  headPivot.rotation.set(-0.04, -0.16, 0.11);
  torsoPivot.add(headPivot);

  const headMeshGroup = new THREE.Group();
  headMeshGroup.position.set(0, 0.36, 0.02);
  headPivot.add(headMeshGroup);

  const headGeo = createChibiHeadGeometry(0.41);
  const headMesh = new THREE.Mesh(headGeo, materials.skin);
  headMesh.name = 'head_skin';
  attachOutline(headMesh, materials.outline, 0.013);
  headMeshGroup.add(headMesh);

  const humanEarGeo = new THREE.SphereGeometry(0.068, 10, 8);
  humanEarGeo.scale(0.55, 1.0, 0.65);
  for (const side of [-1, 1]) {
    const hEar = new THREE.Mesh(humanEarGeo, materials.skin);
    hEar.position.set(side * 0.425, -0.05, 0.0);
    attachOutline(hEar, materials.outline, 0.008);
    headMeshGroup.add(hEar);
  }

  const faceGeo = createFaceDecalGeometry(0.41);
  const faceMat = new THREE.MeshBasicMaterial({
    map: faceTexture,
    transparent: true,
    depthWrite: false,
  });
  const faceMesh = new THREE.Mesh(faceGeo, faceMat);
  faceMesh.name = 'face_decal';
  faceMesh.renderOrder = 2;
  headMeshGroup.add(faceMesh);

  // --- VOLUMINOUS WAVY CHESTNUT HAIR ---
  const hairGroup = new THREE.Group();
  hairGroup.name = 'hair_group';
  headMeshGroup.add(hairGroup);

  const staticHairGroup = new THREE.Group();
  staticHairGroup.name = 'static_hair_group';
  hairGroup.add(staticHairGroup);

  // Full upper & back skull cap tilted far back so its rim hides completely under the parted bangs
  const capGeo = new THREE.SphereGeometry(0.425, 26, 20, 0, Math.PI * 2, 0, Math.PI * 0.56);
  capGeo.scale(1.10, 1.02, 1.04);
  const hairCap = new THREE.Mesh(capGeo, materials.hair);
  hairCap.position.set(0, 0.02, -0.06);
  hairCap.rotation.x = -0.68;
  attachOutline(hairCap, materials.outline, 0.012);
  staticHairGroup.add(hairCap);

  // Crown roof cover so top silhouette under headband is completely filled
  const topDomeGeo = new THREE.SphereGeometry(0.415, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.40);
  topDomeGeo.scale(1.09, 0.92, 1.02);
  const topDome = new THREE.Mesh(topDomeGeo, materials.hair);
  topDome.position.set(0, 0.07, -0.02);
  topDome.rotation.x = -0.15;
  attachOutline(topDome, materials.outline, 0.011);
  staticHairGroup.add(topDome);

  // Lower back skull cover down to the nape
  const napeGeo = new THREE.SphereGeometry(0.42, 20, 14, Math.PI * 0.6, Math.PI * 0.8, Math.PI * 0.25, Math.PI * 0.6);
  napeGeo.rotateY(Math.PI * 0.5);
  napeGeo.scale(1.08, 1.0, 1.02);
  const napeCap = new THREE.Mesh(napeGeo, materials.hair);
  napeCap.position.set(0, 0.0, -0.05);
  attachOutline(napeCap, materials.outline, 0.012);
  staticHairGroup.add(napeCap);

  const addHairLock = (parent, pts, maxR, flattenZ = 0.62, mat = materials.hair) => {
    const geo = createTaperedTube(
      pts,
      (t) => {
        const rootRamp = Math.min(1, t * 5.0 + 0.42);
        const tipTaper = Math.pow(1 - t, 0.72);
        return maxR * rootRamp * tipTaper + 0.008;
      },
      16,
      8,
      flattenZ
    );
    const mesh = new THREE.Mesh(geo, mat);
    attachOutline(mesh, materials.outline, 0.01);
    parent.add(mesh);
    return mesh;
  };

  // Overlapping parted bangs sweeping right across the forehead down to just above the eyes
  addHairLock(
    staticHairGroup,
    [
      new THREE.Vector3(-0.10, 0.43, 0.14),
      new THREE.Vector3(0.06, 0.34, 0.34),
      new THREE.Vector3(0.24, 0.20, 0.38),
      new THREE.Vector3(0.36, 0.05, 0.33),
    ],
    0.105,
    0.45
  );
  addHairLock(
    staticHairGroup,
    [
      new THREE.Vector3(-0.08, 0.44, 0.12),
      new THREE.Vector3(0.14, 0.36, 0.31),
      new THREE.Vector3(0.32, 0.22, 0.33),
      new THREE.Vector3(0.42, 0.06, 0.26),
    ],
    0.095,
    0.48
  );
  addHairLock(
    staticHairGroup,
    [
      new THREE.Vector3(-0.08, 0.41, 0.18),
      new THREE.Vector3(0.02, 0.29, 0.37),
      new THREE.Vector3(0.15, 0.16, 0.39),
      new THREE.Vector3(0.25, 0.07, 0.38),
    ],
    0.085,
    0.42
  );
  addHairLock(
    staticHairGroup,
    [
      new THREE.Vector3(-0.12, 0.40, 0.18),
      new THREE.Vector3(-0.05, 0.26, 0.38),
      new THREE.Vector3(0.04, 0.14, 0.40),
    ],
    0.065,
    0.42
  );
  // Left-side bangs framing right brow & temple
  addHairLock(
    staticHairGroup,
    [
      new THREE.Vector3(-0.11, 0.42, 0.15),
      new THREE.Vector3(-0.24, 0.32, 0.33),
      new THREE.Vector3(-0.35, 0.18, 0.34),
      new THREE.Vector3(-0.41, 0.03, 0.27),
    ],
    0.102,
    0.46
  );
  addHairLock(
    staticHairGroup,
    [
      new THREE.Vector3(-0.14, 0.41, 0.12),
      new THREE.Vector3(-0.31, 0.30, 0.26),
      new THREE.Vector3(-0.42, 0.12, 0.23),
      new THREE.Vector3(-0.44, -0.05, 0.18),
    ],
    0.09,
    0.55
  );
  mergeGroupByMaterial(staticHairGroup);

  // Side hair framing cheeks closely and curling outward at shoulder level
  const leftSideHairPivot = new THREE.Group();
  const rightSideHairPivot = new THREE.Group();
  hairGroup.add(leftSideHairPivot, rightSideHairPivot);

  // Viewer's left side locks (-X)
  addHairLock(
    rightSideHairPivot,
    [
      new THREE.Vector3(-0.40, 0.24, 0.10),
      new THREE.Vector3(-0.44, 0.0, 0.15),
      new THREE.Vector3(-0.42, -0.26, 0.11),
      new THREE.Vector3(-0.51, -0.46, 0.16),
      new THREE.Vector3(-0.44, -0.58, 0.12),
    ],
    0.098,
    0.65
  );
  addHairLock(
    rightSideHairPivot,
    [
      new THREE.Vector3(-0.41, 0.18, -0.04),
      new THREE.Vector3(-0.48, -0.08, 0.0),
      new THREE.Vector3(-0.45, -0.34, -0.02),
      new THREE.Vector3(-0.56, -0.56, 0.05),
    ],
    0.102,
    0.68
  );
  addHairLock(
    rightSideHairPivot,
    [
      new THREE.Vector3(-0.37, 0.08, 0.22),
      new THREE.Vector3(-0.41, -0.15, 0.22),
      new THREE.Vector3(-0.35, -0.34, 0.18),
      new THREE.Vector3(-0.43, -0.45, 0.21),
    ],
    0.072,
    0.62
  );

  // Viewer's right side locks (+X)
  addHairLock(
    leftSideHairPivot,
    [
      new THREE.Vector3(0.40, 0.24, 0.10),
      new THREE.Vector3(0.45, 0.0, 0.15),
      new THREE.Vector3(0.43, -0.24, 0.11),
      new THREE.Vector3(0.52, -0.44, 0.16),
      new THREE.Vector3(0.45, -0.55, 0.12),
    ],
    0.098,
    0.65
  );
  addHairLock(
    leftSideHairPivot,
    [
      new THREE.Vector3(0.41, 0.18, -0.04),
      new THREE.Vector3(0.48, -0.08, 0.0),
      new THREE.Vector3(0.46, -0.34, -0.02),
      new THREE.Vector3(0.56, -0.52, 0.05),
    ],
    0.10,
    0.68
  );
  addHairLock(
    leftSideHairPivot,
    [
      new THREE.Vector3(0.37, 0.08, 0.22),
      new THREE.Vector3(0.42, -0.14, 0.22),
      new THREE.Vector3(0.37, -0.32, 0.18),
      new THREE.Vector3(0.45, -0.43, 0.20),
    ],
    0.072,
    0.62
  );

  // Lush wavy back hair curtain (inner skirt + 11 overlapping ribbons)
  const backHairPivot = new THREE.Group();
  backHairPivot.name = 'back_hair_pivot';
  hairGroup.add(backHairPivot);

  const backSkirtGeo = new THREE.CylinderGeometry(
    0.43,
    0.49,
    0.56,
    18,
    1,
    false,
    Math.PI * 0.58,
    Math.PI * 0.84
  );
  const backSkirt = new THREE.Mesh(backSkirtGeo, materials.hair);
  backSkirt.position.set(0, -0.18, -0.06);
  attachOutline(backSkirt, materials.outline, 0.011);
  backHairPivot.add(backSkirt);

  const backCount = 11;
  for (let i = 0; i < backCount; i++) {
    const t = i / (backCount - 1);
    const angle = (t - 0.5) * Math.PI * 1.12;
    const sinA = Math.sin(angle);
    const cosA = -Math.cos(angle);
    const waveDir = i % 2 === 0 ? 1 : -1;
    const baseR = 0.42;

    const p0 = new THREE.Vector3(sinA * baseR, 0.22, cosA * baseR - 0.04);
    const p1 = new THREE.Vector3(sinA * (baseR + 0.05), -0.08, cosA * (baseR + 0.05) - 0.04);
    const p2 = new THREE.Vector3(
      sinA * (baseR + 0.05) + waveDir * 0.035,
      -0.38,
      cosA * (baseR + 0.05) - 0.04
    );
    const p3 = new THREE.Vector3(
      sinA * (baseR + 0.14) - waveDir * 0.025,
      -0.63 - (i % 2) * 0.05,
      cosA * (baseR + 0.11) - 0.05
    );
    addHairLock(backHairPivot, [p0, p1, p2, p3], 0.125, 0.52);
  }

  mergeGroupByMaterial(leftSideHairPivot);
  mergeGroupByMaterial(rightSideHairPivot);
  mergeGroupByMaterial(backHairPivot);

  // --- PURPLE BUNNY EAR HEADBAND ---
  const headbandGeo = new THREE.TorusGeometry(0.448, 0.034, 10, 28, Math.PI * 1.12);
  const headband = new THREE.Mesh(headbandGeo, materials.suit);
  headband.position.set(0, 0.06, -0.01);
  headband.rotation.z = -Math.PI * 0.06;
  headband.rotation.x = -0.16;
  attachOutline(headband, materials.outline, 0.01);
  headMeshGroup.add(headband);

  // Viewer's left bunny ear: flopped gracefully outward
  const rightBunnyEarPivot = new THREE.Group();
  rightBunnyEarPivot.name = 'bunny_ear_right';
  rightBunnyEarPivot.position.set(-0.19, 0.43, 0.04);
  rightBunnyEarPivot.rotation.set(-0.08, 0.18, 0.96);
  const rightBunnyEar = buildBunnyEar(materials, {
    height: 0.56,
    maxHalfWidth: 0.142,
    thickness: 0.034,
    bendForward: 0.11,
    bendSide: -0.06,
  });
  rightBunnyEarPivot.add(rightBunnyEar);
  headMeshGroup.add(rightBunnyEarPivot);

  // Viewer's right bunny ear: tall with graceful curve inward at tip
  const leftBunnyEarPivot = new THREE.Group();
  leftBunnyEarPivot.name = 'bunny_ear_left';
  leftBunnyEarPivot.position.set(0.11, 0.45, 0.05);
  leftBunnyEarPivot.rotation.set(0.06, -0.16, -0.22);
  const leftBunnyEar = buildBunnyEar(materials, {
    height: 0.54,
    maxHalfWidth: 0.138,
    thickness: 0.034,
    bendForward: 0.14,
    bendSide: -0.08,
  });
  leftBunnyEarPivot.add(leftBunnyEar);
  headMeshGroup.add(leftBunnyEarPivot);

  return {
    root,
    hipsGroup,
    torsoPivot,
    headPivot,
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
