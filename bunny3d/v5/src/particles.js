import * as THREE from 'three';

/**
 * Lightweight pooled sprite particle system for blown-kiss hearts.
 */
export class HeartParticleSystem {
  constructor(parentGroup, heartTexture) {
    this.group = new THREE.Group();
    this.group.name = 'heart_particles';
    parentGroup.add(this.group);

    this.material = new THREE.SpriteMaterial({
      map: heartTexture,
      transparent: true,
      depthWrite: false,
    });

    this.pool = [];
    const poolSize = 10;
    for (let i = 0; i < poolSize; i++) {
      const sprite = new THREE.Sprite(this.material);
      sprite.visible = false;
      this.group.add(sprite);
      this.pool.push({
        sprite,
        active: false,
        age: 0,
        life: 1.45,
        vel: new THREE.Vector3(),
        baseScale: 0.14,
        phase: i * 0.9,
      });
    }
  }

  emitBurst(origin, count = 5) {
    let spawned = 0;
    for (const p of this.pool) {
      if (p.active) continue;
      p.active = true;
      p.age = 0;
      p.life = 1.3 + Math.random() * 0.55;
      p.baseScale = 0.13 + Math.random() * 0.06;
      p.phase = Math.random() * Math.PI * 2;

      p.sprite.position.set(
        origin.x + (Math.random() - 0.5) * 0.08,
        origin.y + (Math.random() - 0.5) * 0.05,
        origin.z + 0.04
      );
      // Float forward toward viewer and gently upward from the mouth
      p.vel.set(
        0.10 + (Math.random() - 0.3) * 0.22,
        0.26 + Math.random() * 0.18,
        0.34 + Math.random() * 0.20
      );
      p.sprite.scale.setScalar(0.001);
      p.sprite.visible = true;

      spawned++;
      if (spawned >= count) break;
    }
  }

  /**
   * Static preview for frozen screenshot mode (?expr=kiss&freeze=1).
   */
  showStaticKissPreview(origin) {
    this.clear();
    const offsets = [
      [0.06, 0.01, 0.14, 0.14],
      [0.18, 0.08, 0.24, 0.12],
      [0.27, 0.17, 0.30, 0.10],
      [0.02, 0.12, 0.22, 0.09],
    ];
    offsets.forEach(([ox, oy, oz, sc], idx) => {
      const p = this.pool[idx];
      if (!p) return;
      p.active = true;
      p.age = p.life * 0.35;
      p.sprite.position.set(origin.x + ox, origin.y + oy, origin.z + oz);
      p.sprite.scale.setScalar(sc);
      p.sprite.visible = true;
    });
  }

  clear() {
    for (const p of this.pool) {
      p.active = false;
      p.sprite.visible = false;
    }
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        p.sprite.visible = false;
        continue;
      }
      const t = p.age / p.life;
      p.sprite.position.x += (p.vel.x + Math.sin(p.age * 4.5 + p.phase) * 0.09) * dt;
      p.sprite.position.y += p.vel.y * dt;
      p.sprite.position.z += p.vel.z * dt;

      const pop = Math.min(1, t / 0.18);
      const fade = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
      const scale = p.baseScale * pop * Math.max(0.01, fade);
      p.sprite.scale.setScalar(scale);
    }
  }
}

/**
 * Gentle floating pastel bokeh sparkles rendered in a single Points draw call
 * with independent slow twinkling per bokeh orb.
 */
export class BackgroundSparkles {
  constructor(scene, bokehTexture) {
    const count = 8;
    const positions = new Float32Array(count * 3);
    const basePositions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const speeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 3.8;
      const y = 0.25 + Math.random() * 2.35;
      const z = -1.6 - Math.random() * 1.6;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      basePositions[i * 3] = x;
      basePositions[i * 3 + 1] = y;
      basePositions[i * 3 + 2] = z;
      sizes[i] = 26 + Math.random() * 34;
      phases[i] = Math.random() * Math.PI * 2;
      speeds[i] = 0.26 + Math.random() * 0.34;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    this.uniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uMap: { value: bokehTexture },
      uTwinkleSpeed: { value: 0.95 },
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aSize;
        attribute float aPhase;
        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uTwinkleSpeed;
        varying float vAlpha;
        void main() {
          float tw = 0.5 + 0.5 * sin(uTime * uTwinkleSpeed + aPhase);
          vAlpha = 0.22 + 0.36 * tw;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (0.85 + 0.22 * tw) * uPixelRatio * (4.2 / max(0.5, -mvPosition.z));
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        varying float vAlpha;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          if (tex.a < 0.01) discard;
          gl_FragColor = vec4(tex.rgb, tex.a * vAlpha);
        }
      `,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.name = 'bg_sparkles';
    scene.add(this.points);

    this.basePositions = basePositions;
    this.phases = phases;
    this.speeds = speeds;
    this.count = count;
    this.reducedMotion = false;
  }

  setPixelRatio(dpr) {
    this.uniforms.uPixelRatio.value = dpr;
  }

  setReducedMotion(flag) {
    this.reducedMotion = Boolean(flag);
    this.uniforms.uTwinkleSpeed.value = this.reducedMotion ? 0.28 : 0.95;
  }

  update(time) {
    this.uniforms.uTime.value = time;
    const motionScale = this.reducedMotion ? 0.25 : 1.0;
    const pos = this.points.geometry.attributes.position;
    for (let i = 0; i < this.count; i++) {
      const bx = this.basePositions[i * 3];
      const by = this.basePositions[i * 3 + 1];
      const sp = this.speeds[i];
      const ph = this.phases[i];
      pos.setX(i, bx + Math.cos(time * sp * 0.7 + ph) * 0.07 * motionScale);
      pos.setY(i, by + Math.sin(time * sp + ph) * 0.11 * motionScale);
    }
    pos.needsUpdate = true;
  }
}

/**
 * Pooled pastel sparkle burst emitted when switching between sit and stand poses.
 */
export class SparkleBurstSystem {
  constructor(parentGroup, bokehTexture) {
    this.group = new THREE.Group();
    this.group.name = 'pose_sparkles';
    parentGroup.add(this.group);

    this.material = new THREE.SpriteMaterial({
      map: bokehTexture,
      color: 0xffe4ff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.pool = [];
    for (let i = 0; i < 4; i++) {
      const sprite = new THREE.Sprite(this.material);
      sprite.visible = false;
      this.group.add(sprite);
      this.pool.push({
        sprite,
        active: false,
        age: 0,
        life: 0.9,
        vel: new THREE.Vector3(),
        baseScale: 0.12,
      });
    }
  }

  emit(centerY = 0.9) {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      const angle = (i / this.pool.length) * Math.PI * 2 + 0.45;
      p.active = true;
      p.age = 0;
      p.life = 0.75 + Math.random() * 0.25;
      p.baseScale = 0.11 + Math.random() * 0.05;
      p.sprite.position.set(
        Math.cos(angle) * 0.48,
        centerY + (Math.random() - 0.5) * 0.55,
        Math.sin(angle) * 0.28 + 0.06
      );
      p.vel.set(Math.cos(angle) * 0.28, 0.36 + Math.random() * 0.22, Math.sin(angle) * 0.18);
      p.sprite.scale.setScalar(0.01);
      p.sprite.visible = true;
    }
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        p.sprite.visible = false;
        continue;
      }
      const t = p.age / p.life;
      p.sprite.position.addScaledVector(p.vel, dt);
      p.vel.y *= Math.exp(-1.5 * dt);
      const env = Math.sin(t * Math.PI);
      p.sprite.scale.setScalar(Math.max(0.005, p.baseScale * env));
    }
  }
}
