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
 * Gentle floating pastel bokeh sparkles in the background.
 */
export class BackgroundSparkles {
  constructor(scene, bokehTexture) {
    this.group = new THREE.Group();
    this.group.name = 'bg_sparkles';
    scene.add(this.group);

    this.material = new THREE.SpriteMaterial({
      map: bokehTexture,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.items = [];
    const count = 3;
    for (let i = 0; i < count; i++) {
      const sprite = new THREE.Sprite(this.material);
      const baseX = (Math.random() - 0.5) * 3.8;
      const baseY = 0.25 + Math.random() * 2.2;
      const baseZ = -1.6 - Math.random() * 1.6;
      const baseScale = 0.09 + Math.random() * 0.14;
      sprite.position.set(baseX, baseY, baseZ);
      sprite.scale.setScalar(baseScale);
      this.group.add(sprite);
      this.items.push({
        sprite,
        baseX,
        baseY,
        baseScale,
        speed: 0.4 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  update(time) {
    for (const item of this.items) {
      item.sprite.position.y = item.baseY + Math.sin(time * item.speed + item.phase) * 0.12;
      item.sprite.position.x = item.baseX + Math.cos(time * item.speed * 0.7 + item.phase) * 0.07;
      const pulse = 0.8 + Math.sin(time * 1.8 + item.phase) * 0.22;
      item.sprite.scale.setScalar(item.baseScale * pulse);
    }
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
