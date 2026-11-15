import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Create a quantized 1D gradient DataTexture for MeshToonMaterial.
 * Uses RGBAFormat + NearestFilter for maximum WebGL compatibility.
 */
export function createToonGradient(levels = [118, 172, 226, 255]) {
  const width = levels.length;
  const data = new Uint8Array(width * 4);
  for (let i = 0; i < width; i++) {
    const v = levels[i];
    const idx = i * 4;
    data[idx] = v;
    data[idx + 1] = v;
    data[idx + 2] = v;
    data[idx + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Inflate a geometry along smoothed vertex normals into an `aOutlineOffset` attribute
 * so backface outlines never split along UV seams and can scale smoothly with zoom.
 */
export function createOutlineGeometry(sourceGeometry, thickness = 0.012) {
  const geo = sourceGeometry.clone();
  const posAttr = geo.attributes.position;
  let normAttr = geo.attributes.normal;
  if (!normAttr) {
    geo.computeVertexNormals();
    normAttr = geo.attributes.normal;
  }

  // Average normals for vertices sharing the same spatial coordinate.
  const normalSums = new Map();
  const keyFor = (i) => {
    const x = Math.round(posAttr.getX(i) * 10000);
    const y = Math.round(posAttr.getY(i) * 10000);
    const z = Math.round(posAttr.getZ(i) * 10000);
    return `${x},${y},${z}`;
  };

  for (let i = 0; i < posAttr.count; i++) {
    const key = keyFor(i);
    let sum = normalSums.get(key);
    if (!sum) {
      sum = [0, 0, 0];
      normalSums.set(key, sum);
    }
    sum[0] += normAttr.getX(i);
    sum[1] += normAttr.getY(i);
    sum[2] += normAttr.getZ(i);
  }

  const offsets = new Float32Array(posAttr.count * 3);
  for (let i = 0; i < posAttr.count; i++) {
    const sum = normalSums.get(keyFor(i));
    const len = Math.hypot(sum[0], sum[1], sum[2]) || 1;
    offsets[i * 3] = (sum[0] / len) * thickness;
    offsets[i * 3 + 1] = (sum[1] / len) * thickness;
    offsets[i * 3 + 2] = (sum[2] / len) * thickness;
  }

  geo.setAttribute('aOutlineOffset', new THREE.BufferAttribute(offsets, 3));
  // Strip unused attributes on outline meshes to keep memory & merge buckets uniform.
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  if (geo.attributes.normal) geo.deleteAttribute('normal');
  return geo;
}

/**
 * Attach a BackSide toon outline child mesh using a shared outline material.
 */
export function attachOutline(mesh, outlineMaterial, thickness = 0.012) {
  const outlineGeo = createOutlineGeometry(mesh.geometry, thickness);
  const outlineMesh = new THREE.Mesh(outlineGeo, outlineMaterial);
  outlineMesh.name = `${mesh.name || 'part'}_outline`;
  outlineMesh.renderOrder = -1;
  mesh.add(outlineMesh);
  return outlineMesh;
}

/**
 * Merge static meshes sharing the same material inside a group to reduce draw calls.
 * Preserves local transforms, outline extrusion vectors, and renderOrder per bucket.
 */
export function mergeGroupByMaterial(group) {
  group.updateMatrixWorld(true);
  const invRoot = group.matrixWorld.clone().invert();
  const buckets = new Map();
  const toRemove = [];
  const tmpVec = new THREE.Vector3();
  const linMat3 = new THREE.Matrix3();

  group.traverse((child) => {
    if (!child.isMesh) return;
    toRemove.push(child);
    const key = `${child.material.uuid}_${child.renderOrder}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { material: child.material, renderOrder: child.renderOrder, geos: [] };
      buckets.set(key, bucket);
    }
    const geo = child.geometry.clone();
    const relMatrix = invRoot.clone().multiply(child.matrixWorld);
    geo.applyMatrix4(relMatrix);

    const outAttr = geo.attributes.aOutlineOffset;
    if (outAttr) {
      linMat3.setFromMatrix4(relMatrix);
      for (let i = 0; i < outAttr.count; i++) {
        tmpVec.fromBufferAttribute(outAttr, i).applyMatrix3(linMat3);
        outAttr.setXYZ(i, tmpVec.x, tmpVec.y, tmpVec.z);
      }
    }

    if (geo.index) {
      const nonIndexed = geo.toNonIndexed();
      geo.dispose();
      bucket.geos.push(nonIndexed);
    } else {
      bucket.geos.push(geo);
    }
  });

  if (toRemove.length <= 2) return group;

  for (const child of toRemove) {
    child.geometry.dispose();
    if (child.parent) child.parent.remove(child);
  }

  for (const bucket of buckets.values()) {
    // Harmonize UV attribute presence within a bucket if mixed meshes shared a material
    const anyUv = bucket.geos.some((g) => Boolean(g.attributes.uv));
    if (anyUv) {
      for (const g of bucket.geos) {
        if (!g.attributes.uv) {
          const count = g.attributes.position.count;
          g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
        }
      }
    }
    const merged = mergeGeometries(bucket.geos, false);
    for (const g of bucket.geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, bucket.material);
    mesh.renderOrder = bucket.renderOrder;
    group.add(mesh);
  }
  return group;
}

/**
 * Inject subtle pastel pink-lavender Fresnel rim glow into a MeshToonMaterial so
 * silhouettes stay luminous at any rotation angle with zero extra draw calls.
 */
function applyPastelRim(material, colorHex, strength, power = 3.1, options = {}) {
  const col = new THREE.Color(colorHex);
  const { angelRing = false } = options;
  material.onBeforeCompile = (shader) => {
    if (angelRing) {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vHairPos;
          varying vec3 vCrownUpView;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vHairPos = position;
          vCrownUpView = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vHairPos;
          varying vec3 vCrownUpView;`
        )
        .replace(
          '#include <dithering_fragment>',
          `
          vec3 toonNorm = normalize(normal);
          vec3 toonView = normalize(vViewPosition);
          float nUp = dot(toonNorm, normalize(vCrownUpView));
          float strandWave = sin(vHairPos.x * 24.0 + vHairPos.z * 14.0) * 0.030 + sin(vHairPos.x * 48.0 - vHairPos.z * 26.0) * 0.014;
          float nUpWaved = nUp + strandWave;
          float crownYMask = smoothstep(0.11, 0.24, vHairPos.y);
          float outerBand = smoothstep(0.51, 0.56, nUpWaved) * smoothstep(0.83, 0.78, nUpWaved);
          float innerBand = smoothstep(0.59, 0.63, nUpWaved) * smoothstep(0.75, 0.71, nUpWaved);
          float viewWrap = 0.62 + 0.38 * max(dot(toonNorm, toonView), 0.0);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.84, 0.54, 0.33), crownYMask * outerBand * viewWrap * 0.40);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.97, 0.76, 0.56), crownYMask * innerBand * viewWrap * 0.36);
          float rimFresnel = pow(1.0 - max(dot(toonNorm, toonView), 0.0), ${power.toFixed(2)});
          gl_FragColor.rgb += vec3(${col.r.toFixed(3)}, ${col.g.toFixed(3)}, ${col.b.toFixed(3)}) * (rimFresnel * ${strength.toFixed(3)});
          #include <dithering_fragment>
          `
        );
    } else {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        float rimFresnel = pow(1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0), ${power.toFixed(2)});
        gl_FragColor.rgb += vec3(${col.r.toFixed(3)}, ${col.g.toFixed(3)}, ${col.b.toFixed(3)}) * (rimFresnel * ${strength.toFixed(3)});
        #include <dithering_fragment>
        `
      );
    }
  };
  material.customProgramCacheKey = () =>
    `pastel_rim_${colorHex}_${strength}_${power}_${angelRing ? 'hair' : 'std'}`;
  return material;
}

/**
 * Create a BackSide outline material driven by shared `uOutlineScale` uniform.
 */
function createScalableOutlineMaterial(colorHex, outlineUniforms) {
  const mat = new THREE.MeshBasicMaterial({
    color: colorHex,
    side: THREE.BackSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uOutlineScale = outlineUniforms.uOutlineScale;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec3 aOutlineOffset;
        uniform float uOutlineScale;`
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3( position + aOutlineOffset * uOutlineScale );`
      );
  };
  mat.customProgramCacheKey = () => 'scalable_outline';
  return mat;
}

/**
 * Build the shared pastel toon material palette with pink-lavender rim highlights & scalable outlines.
 */
export function createCharacterMaterials(fishnetTexture) {
  const faceGradient = createToonGradient([232, 255]);
  const skinGradient = createToonGradient([202, 232, 255]);
  const softGradient = createToonGradient([168, 214, 255]);
  const crispGradient = createToonGradient([142, 200, 255]);
  const outlineUniforms = {
    uOutlineScale: { value: 1.0 },
  };

  return {
    gradients: { faceGradient, skinGradient, softGradient, crispGradient },
    outlineUniforms,
    faceSkin: applyPastelRim(
      new THREE.MeshToonMaterial({
        color: 0xffe2ca,
        gradientMap: faceGradient,
        emissive: 0x3c1622,
        emissiveIntensity: 0.22,
      }),
      0xffd2f4,
      0.08,
      3.4
    ),
    skin: applyPastelRim(
      new THREE.MeshToonMaterial({
        color: 0xffdcc2,
        gradientMap: skinGradient,
        emissive: 0x381422,
        emissiveIntensity: 0.16,
      }),
      0xffcbf2,
      0.16,
      3.2
    ),
    skinShadow: new THREE.MeshToonMaterial({
      color: 0xefb0a6,
      gradientMap: skinGradient,
      emissive: 0x321220,
      emissiveIntensity: 0.12,
    }),
    hair: applyPastelRim(
      new THREE.MeshToonMaterial({
        color: 0x7e4526,
        gradientMap: crispGradient,
        emissive: 0x260f1c,
        emissiveIntensity: 0.12,
      }),
      0xf6b8f2,
      0.28,
      2.9,
      { angelRing: true }
    ),
    hairHighlight: new THREE.MeshToonMaterial({
      color: 0xd6925e,
      gradientMap: softGradient,
      emissive: 0x522a14,
      emissiveIntensity: 0.28,
    }),
    suit: applyPastelRim(
      new THREE.MeshToonMaterial({
        color: 0x773eb2,
        gradientMap: crispGradient,
        emissive: 0x240b3c,
        emissiveIntensity: 0.22,
      }),
      0xfac6ff,
      0.28,
      2.8
    ),
    suitTrim: applyPastelRim(
      new THREE.MeshToonMaterial({
        color: 0x9f64dd,
        gradientMap: softGradient,
        emissive: 0x2a0f44,
        emissiveIntensity: 0.14,
      }),
      0xffd6ff,
      0.20,
      3.0
    ),
    innerEar: applyPastelRim(
      new THREE.MeshToonMaterial({
        color: 0xe396f6,
        gradientMap: softGradient,
        emissive: 0x3b124a,
        emissiveIntensity: 0.14,
      }),
      0xffe0ff,
      0.16,
      3.2
    ),
    white: applyPastelRim(
      new THREE.MeshToonMaterial({
        color: 0xfcf8ff,
        gradientMap: softGradient,
        emissive: 0x241432,
        emissiveIntensity: 0.10,
      }),
      0xffdcf8,
      0.12,
      3.2
    ),
    heel: applyPastelRim(
      new THREE.MeshToonMaterial({
        color: 0x281b34,
        gradientMap: crispGradient,
        emissive: 0x160a24,
        emissiveIntensity: 0.18,
      }),
      0xd99eff,
      0.24,
      2.9
    ),
    fishnet: new THREE.MeshToonMaterial({
      color: 0xffffff,
      map: fishnetTexture,
      gradientMap: skinGradient,
      emissive: 0x2a1018,
      emissiveIntensity: 0.10,
    }),
    gold: new THREE.MeshToonMaterial({
      color: 0xf0c788,
      gradientMap: crispGradient,
    }),
    outline: createScalableOutlineMaterial(0x271630, outlineUniforms),
    outlineHair: createScalableOutlineMaterial(0x4b2a22, outlineUniforms),
    outlineSkin: createScalableOutlineMaterial(0xa4635d, outlineUniforms),
    outlinePurple: createScalableOutlineMaterial(0x3f1b6a, outlineUniforms),
    outlineWhite: createScalableOutlineMaterial(0x826c9c, outlineUniforms),
    outlineDark: createScalableOutlineMaterial(0x271630, outlineUniforms),
  };
}
