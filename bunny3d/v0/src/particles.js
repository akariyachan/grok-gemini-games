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
    const poolSize = 12;
    for (let i = 0; i < poolSize; i++) {
      const sprite = new THREE.Sprite(this.material);
      sprite.visible = false;
      this.group.add(sprite);
      this.pool.push({
        sprite,
        active: false,
        age: 0,
        life: 1.5,
        vel: new THREE.Vector3(),
        baseScale: 0.16,
        phase: i * 0.9,
      });
    }
  }

  emitBurst(origin, count = 6) {
    let spawned = 0;
    for (const p of this.pool) {
      if (p.active) continue;
      p.active = true;
      p.age = 0;
      p.life = 1.35 + Math.random() * 0.65;
      p.baseScale = 0.14 + Math.random() * 0.08;
      p.phase = Math.random() * Math.PI * 2;

      p.sprite.position.set(
        origin.x + (Math.random() - 0.5) * 0.12,
        origin.y + (Math.random() - 0.5) * 0.08,
        origin.z + 0.06
      );
      p.vel.set(
        0.18 + Math.random() * 0.22,
        0.38 + Math.random() * 0.25,
        0.22 + Math.random() * 0.2
      );
      p.sprite.scale.setScalar(0.001);
      p.sprite.visible = true;

      spawned++;
      if (spawned >= count) break;
    }
  }

  /**
   * Spawn a static burst for frozen screenshot mode (?expr=kiss&freeze=1).
   */
  showStaticKissPreview(origin) {
    this.clear();
    const offsets = [
      [0.14, 0.10, 0.18, 0.16],
      [0.26, 0.24, 0.26, 0.13],
      [0.06, 0.28, 0.22, 0.11],
      [0.34, 0.06, 0.16, 0.10],
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
      p.sprite.position.x += (p.vel.x + Math.sin(p.age * 5.0 + p.phase) * 0.12) * dt;
      p.sprite.position.y += p.vel.y * dt;
      p.sprite.position.z += p.vel.z * dt;

      // Pop in fast, gently shrink out at end
      const pop = Math.min(1, t / 0.18);
      const fade = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
      const scale = p.baseScale * pop * Math.max(0.01, fade);
      p.sprite.scale.setScalar(scale);
    }
  }
}
