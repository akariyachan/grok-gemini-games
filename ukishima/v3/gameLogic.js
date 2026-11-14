export const NIGHT_DURATION = 300; // 5分 (秒)
export const DAWN_DURATION = 4.2;  // 夜明け演出秒数 (実時間で最低3.5秒以上)
export const BRIDGE_MAX_DIST = 10.85;

export const INITIAL_WALLET_LIGHT = 72;
export const BRIDGE_COST = 17;
export const BRIDGE_TIME = 4;
export const HIGH_BRIDGE_COST = 42;
export const HIGH_BRIDGE_TIME = 8;
export const REMOVE_BRIDGE_COST = 5;
export const ROUTE_COST = 36;
export const SHIP_BASE_SPEED = 1.25;

export const NETWORK_BONUS_PER_ISLAND = 0.14; // 接続島数ごとの生産倍率 (+14%/島)
export const BRIDGE_NETWORK_BONUS = 0.11;     // 橋1本ごとのネットワーク生産倍率 (+11%/本)
export const REMOTE_ISLAND_MULT = 1.42;       // 船で届く遠い島の生産倍率
export const WALLET_FLOW_RATE = 0.0017;       // 島の灯りの一部が所持灯りへ流れ込む割合 (/秒)
export const LOOP_PROD_BONUS = 0.25;          // 光の環1つあたりの島生産+25%
export const LOOP_MAX_COUNT = 3;              // 光の環ボーナスの最大数
export const LOOP_SCORE_BONUS = 360;          // 光の環1つあたりのスコアボーナス
export const CONSTELLATION_BONUS = 220;       // 今夜の星座達成ボーナス

export const BUILDING_DEFS = {
  house: {
    type: 'house',
    name: '家',
    cost: 10,
    buildTime: 6,
    islandRate: 1.55,
  },
  streetlight: {
    type: 'streetlight',
    name: '街灯',
    cost: 6,
    buildTime: 3,
    islandRate: 0.55,
  },
  stall: {
    type: 'stall',
    name: '屋台',
    cost: 15,
    buildTime: 8,
    islandRate: 1.9,
  },
  lighthouse: {
    type: 'lighthouse',
    name: '灯台',
    cost: 25,
    buildTime: 12,
    islandRate: 0.85,
  },
};

export const ISLAND_TRAITS = {
  market: { id: 'market', name: '市場の島', icon: '🏮', desc: '屋台の生産 +50%' },
  forest: { id: 'forest', name: '森の島', icon: '🌲', desc: '灯りの減衰が半分' },
  port: { id: 'port', name: '港の島', icon: '⚓', desc: '発着する船が速い・積み荷+1' },
  starlight: { id: 'starlight', name: '星見の島', icon: '✨', desc: '灯りの節目(50/100/200)ボーナス2倍' },
  fog: { id: 'fog', name: '霧の島', icon: '🌫', desc: '橋が架けられない（航路のみ）' },
  wind: { id: 'wind', name: '風の島', icon: '🌀', desc: '通常の橋不可（高い橋のみ）' },
};

export const LIGHT_MILESTONES = [
  { threshold: 50, bonus: 6 },
  { threshold: 100, bonus: 10 },
  { threshold: 200, bonus: 15 },
];

const PROCEDURAL_ISLAND_NAMES = [
  '朝霧の島', '東雲の島', '宵風の島', '琥珀の島', '北極星の島',
  '南十字の島', '彼方の島', '暁の島', '天の川の島', 'オリオンの島',
  '月影の島', '流星群の島', '蛍火の島', '白夜の島', '彗星の島',
  'シリウスの島', '薄明の島', '星屑の島',
];

function createSeededRng(seedInput) {
  const str = String(seedInput);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getTodaySeedString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `daily-${y}-${m}-${d}`;
}

export function generateIslandsForSeed(seed) {
  const baseRng = createSeededRng(seed);

  for (let attempt = 0; attempt < 400; attempt++) {
    const rng = createSeededRng(`${seed}#${attempt}`);
    const totalCount = 18; // 始まりの島1 + 近い島9〜10 + 遠い島7〜8
    const farCount = rng() < 0.5 ? 7 : 8; // 全体の約4割（39〜44%）を遠い島に
    const nearCount = totalCount - 1 - farCount; // 9〜10個
    const innerNearCount = 3; // 3個は島0から1本で届く
    const outerNearCount = nearCount - innerNearCount; // 6〜7個は1段目を経由して架橋する

    const usedNames = [...PROCEDURAL_ISLAND_NAMES];
    for (let i = usedNames.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [usedNames[i], usedNames[j]] = [usedNames[j], usedNames[i]];
    }

    const islands = [
      {
        id: 0,
        name: '始まりの島',
        x: 0,
        y: 0.2,
        z: 0,
        radius: 3.4,
        slotCount: 6,
        initialLight: 45,
        connected: true,
        remote: false,
        trait: null,
      },
    ];

    const baseAngle = rng() * Math.PI * 2;
    let nearFailed = false;

    // 1段目の近い島（島0から直接橋が届く）
    const innerNear = [];
    for (let i = 0; i < innerNearCount; i++) {
      let placed = null;
      for (let t = 0; t < 28; t++) {
        const ang =
          baseAngle + (i / innerNearCount) * Math.PI * 2 + (rng() - 0.5) * 0.55;
        const r = 7.2 + rng() * 2.4;
        const x = Number((Math.cos(ang) * r).toFixed(2));
        const z = Number((Math.sin(ang) * r).toFixed(2));
        const okSpacing = islands.every((other) => Math.hypot(other.x - x, other.z - z) >= 6.4);
        if (okSpacing) {
          placed = { x, z, ang };
          break;
        }
      }
      if (!placed) {
        nearFailed = true;
        break;
      }
      const isl = {
        id: islands.length,
        name: usedNames[islands.length - 1],
        x: placed.x,
        y: Number(((rng() - 0.5) * 0.9).toFixed(2)),
        z: placed.z,
        radius: 2.6,
        slotCount: 5,
        initialLight: 0,
        connected: false,
        remote: false,
        trait: null,
      };
      islands.push(isl);
      innerNear.push({ isl, ang: placed.ang });
    }
    if (nearFailed) continue;

    // 2段目の近い島（島0からは直接届かず、1段目の島からの橋が横方向に伸びて航路と交差しやすい）
    const outerBridgePairs = [];
    for (let i = 0; i < outerNearCount; i++) {
      const parent = innerNear[i % innerNear.length];
      let placed = null;
      for (let t = 0; t < 48; t++) {
        const side = (i + t) % 2 === 0 ? 1 : -1;
        const offsetAng = side * (0.48 + rng() * 0.65);
        const stepAng = parent.ang + offsetAng;
        const stepDist = 5.6 + rng() * 3.8;
        const x = Number((parent.isl.x + Math.cos(stepAng) * stepDist).toFixed(2));
        const z = Number((parent.isl.z + Math.sin(stepAng) * stepDist).toFixed(2));
        const distFromHome = Math.hypot(x, z);
        if (distFromHome <= BRIDGE_MAX_DIST + 0.5 || distFromHome > 15.2) continue;
        const okSpacing = islands.every((other) => Math.hypot(other.x - x, other.z - z) >= 5.1);
        if (okSpacing) {
          placed = { x, z };
          break;
        }
      }
      if (!placed) {
        nearFailed = true;
        break;
      }
      const isl = {
        id: islands.length,
        name: usedNames[islands.length - 1],
        x: placed.x,
        y: Number(((rng() - 0.5) * 0.9).toFixed(2)),
        z: placed.z,
        radius: 2.55,
        slotCount: 5,
        initialLight: 0,
        connected: false,
        remote: false,
        trait: null,
      };
      islands.push(isl);
      outerBridgePairs.push([parent.isl, isl]);
    }
    if (nearFailed) continue;

    // 遠い島を、2段目の橋または近い島ペアの中点方向のはるか外側に配置（船の往復を長くする）
    const nearOnly = islands.slice(1);
    const crossAngles = [];
    for (const [u, v] of outerBridgePairs) {
      const mx = (u.x + v.x) * 0.5;
      const mz = (u.z + v.z) * 0.5;
      crossAngles.push(Math.atan2(mz, mx));
    }
    for (let i = 0; i < nearOnly.length; i++) {
      for (let j = i + 1; j < nearOnly.length; j++) {
        const a = nearOnly[i];
        const b = nearOnly[j];
        if (distance2D(a, b) <= BRIDGE_MAX_DIST) {
          const mx = (a.x + b.x) * 0.5;
          const mz = (a.z + b.z) * 0.5;
          crossAngles.push(Math.atan2(mz, mx));
        }
      }
    }

    let farFailed = false;
    for (let i = 0; i < farCount; i++) {
      let placed = null;
      for (let t = 0; t < 56; t++) {
        const ang =
          i < crossAngles.length && t < 26
            ? crossAngles[i] + (rng() - 0.5) * 0.3
            : rng() * Math.PI * 2;
        const r = 40.0 + rng() * 12.0;
        const x = Number((Math.cos(ang) * r).toFixed(2));
        const z = Number((Math.sin(ang) * r).toFixed(2));
        const tooCloseToAny = islands.some(
          (other) => Math.hypot(other.x - x, other.z - z) <= BRIDGE_MAX_DIST + 6.5
        );
        const tooCloseToFar = islands.some(
          (other) => other.remote && Math.hypot(other.x - x, other.z - z) < 23.0
        );
        if (!tooCloseToAny && !tooCloseToFar) {
          placed = { x, z };
          break;
        }
      }
      if (!placed) {
        farFailed = true;
        break;
      }
      islands.push({
        id: islands.length,
        name: usedNames[islands.length - 1],
        x: placed.x,
        y: Number(((rng() - 0.5) * 1.1).toFixed(2)),
        z: placed.z,
        radius: 2.5 + (i === 0 ? 0.25 : 0),
        slotCount: i === 0 ? 5 : 4,
        initialLight: 0,
        connected: false,
        remote: true,
        trait: null,
      });
    }
    if (farFailed) continue;

    // 特性の割り当て（始まりの島はなし、遠い島ほど強い特性がつきやすい）
    const nearTraitPool = ['market', 'forest', 'wind', 'port'];
    const farTraitPool = ['starlight', 'port', 'market', 'forest', 'fog'];
    let windCount = 0;
    let fogCount = 0;
    for (const isl of islands) {
      if (isl.id === 0) continue;
      if (!isl.remote) {
        if (rng() < 0.62) {
          let tr = nearTraitPool[Math.floor(rng() * nearTraitPool.length)];
          if (tr === 'wind') {
            if (windCount >= 1) tr = 'market';
            else windCount += 1;
          }
          isl.trait = tr;
        }
      } else {
        let tr = farTraitPool[Math.floor(rng() * farTraitPool.length)];
        if (tr === 'fog') {
          if (fogCount >= 1) tr = 'starlight';
          else fogCount += 1;
        }
        isl.trait = tr;
      }
    }

    // 条件検証1: 「その橋を架けると、ある遠い島へのまっすぐな航路(0→far)がふさがる」関係が最低3か所
    const home = islands[0];
    const remoteIslands = islands.filter((isl) => isl.remote);
    const blockingBridges = new Set();
    const blockedRemotes = new Set();

    for (let i = 0; i < islands.length; i++) {
      for (let j = i + 1; j < islands.length; j++) {
        const u = islands[i];
        const v = islands[j];
        if (u.trait === 'fog' || v.trait === 'fog') continue;
        if (u.trait === 'wind' || v.trait === 'wind') continue;
        if (distance2D(u, v) > BRIDGE_MAX_DIST) continue;
        for (const far of remoteIslands) {
          if (segmentsIntersect2D(u, v, home, far)) {
            blockingBridges.add(`${u.id}-${v.id}`);
            blockedRemotes.add(far.id);
          }
        }
      }
    }

    if (blockingBridges.size < 3 || blockedRemotes.size < 3) continue;

    // 条件検証2: 全島接続が可能（高い橋＋航路で島0から全島到達可能）
    const reachable = new Set([0]);
    const q = [0];
    while (q.length > 0) {
      const curr = islands[q.shift()];
      for (const nxt of islands) {
        if (reachable.has(nxt.id)) continue;
        const canHighBridge =
          curr.trait !== 'fog' && nxt.trait !== 'fog' && distance2D(curr, nxt) <= BRIDGE_MAX_DIST;
        const canRoute = true; // 高い橋を併用すれば航路は必ず通せる
        if (canHighBridge || canRoute) {
          reachable.add(nxt.id);
          q.push(nxt.id);
        }
      }
    }
    if (reachable.size === islands.length) {
      return islands;
    }
  }

  // Fallback to default blueprints with randomized traits if all attempts fail
  void baseRng;
  return ISLAND_BLUEPRINTS.map((bp) => ({ ...bp, trait: null }));
}

export const ISLAND_BLUEPRINTS = [
  { id: 0, name: '始まりの島', x: 0, y: 0.2, z: 0, radius: 3.4, slotCount: 6, initialLight: 45, connected: true, remote: false },
  { id: 1, name: '朝霧の島', x: -5.0, y: 0.5, z: -7.2, radius: 2.6, slotCount: 5, initialLight: 0, connected: false, remote: false },
  { id: 2, name: '東雲の島', x: 5.0, y: -0.1, z: -7.2, radius: 2.6, slotCount: 5, initialLight: 0, connected: false, remote: false },
  { id: 3, name: '宵風の島', x: -7.8, y: 0.3, z: 3.2, radius: 2.6, slotCount: 5, initialLight: 0, connected: false, remote: false },
  { id: 4, name: '琥珀の島', x: 7.8, y: 0.4, z: 3.2, radius: 2.6, slotCount: 5, initialLight: 0, connected: false, remote: false },
  { id: 5, name: '北極星の島', x: 0, y: 0.7, z: -17.4, radius: 2.8, slotCount: 5, initialLight: 0, connected: false, remote: true },
  { id: 6, name: '南十字の島', x: 0, y: -0.2, z: 14.8, radius: 2.5, slotCount: 4, initialLight: 0, connected: false, remote: true },
  { id: 7, name: '彼方の島', x: -16.8, y: 0.6, z: -3.8, radius: 2.5, slotCount: 4, initialLight: 0, connected: false, remote: true },
  { id: 8, name: '暁の島', x: 16.8, y: 0.4, z: -3.8, radius: 2.5, slotCount: 4, initialLight: 0, connected: false, remote: true },
];

export function distance2D(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

function cross2D(ax, az, bx, bz, cx, cz) {
  return (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
}

function onSegment2D(px, pz, qx, qz, rx, rz) {
  const eps = 1e-6;
  return (
    qx <= Math.max(px, rx) + eps &&
    qx >= Math.min(px, rx) - eps &&
    qz <= Math.max(pz, rz) + eps &&
    qz >= Math.min(pz, rz) - eps
  );
}

/**
 * 2D線分交差判定（端点を共有する島同士の接続は交差とみなさない）
 */
export function segmentsIntersect2D(a1, a2, b1, b2) {
  if (a1.id === b1.id || a1.id === b2.id || a2.id === b1.id || a2.id === b2.id) {
    return false;
  }

  const d1 = cross2D(b1.x, b1.z, b2.x, b2.z, a1.x, a1.z);
  const d2 = cross2D(b1.x, b1.z, b2.x, b2.z, a2.x, a2.z);
  const d3 = cross2D(a1.x, a1.z, a2.x, a2.z, b1.x, b1.z);
  const d4 = cross2D(a1.x, a1.z, a2.x, a2.z, b2.x, b2.z);

  const eps = 1e-6;
  if (((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) &&
      ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))) {
    return true;
  }

  if (Math.abs(d1) <= eps && onSegment2D(b1.x, b1.z, a1.x, a1.z, b2.x, b2.z)) return true;
  if (Math.abs(d2) <= eps && onSegment2D(b1.x, b1.z, a2.x, a2.z, b2.x, b2.z)) return true;
  if (Math.abs(d3) <= eps && onSegment2D(a1.x, a1.z, b1.x, b1.z, a2.x, a2.z)) return true;
  if (Math.abs(d4) <= eps && onSegment2D(a1.x, a1.z, b2.x, b2.z, a2.x, a2.z)) return true;

  return false;
}

export class GameSimulation {
  constructor(defaultSpeed = 1, options = {}) {
    this.defaultSpeed = defaultSpeed;
    this.speed = defaultSpeed;
    this.defaultSeed = options?.seed ?? null;
    this.seed = this.defaultSeed;
    this.events = [];
    this.resetToTitle();
  }

  _initWorld() {
    this.timeLeft = NIGHT_DURATION;
    this.walletLight = INITIAL_WALLET_LIGHT;
    this.dawnActive = false;
    this.dawnProgress = 0;
    this.dawnReason = '';
    this.allConnectedBonus = 0;
    this.loopCount = 0;
    this.loopBonus = 0;
    this.loops = [];
    this.constellationBonus = 0;
    this.score = 0;
    this._idCounter = 1;

    const blueprints =
      this.seed !== null && this.seed !== undefined && this.seed !== ''
        ? generateIslandsForSeed(this.seed)
        : ISLAND_BLUEPRINTS.map((bp) => ({ ...bp, trait: null }));

    this.islands = blueprints.map((bp) => {
      const slots = [];
      const ringRadius = bp.radius * 0.58;
      for (let i = 0; i < bp.slotCount; i++) {
        const angle = (i / bp.slotCount) * Math.PI * 2 - Math.PI / 2;
        slots.push({
          index: i,
          localX: Math.cos(angle) * ringRadius,
          localZ: Math.sin(angle) * ringRadius,
          buildingId: null,
        });
      }
      return {
        id: bp.id,
        name: bp.name,
        x: bp.x,
        y: bp.y,
        z: bp.z,
        radius: bp.radius,
        light: bp.initialLight,
        connected: bp.connected,
        remote: bp.remote,
        trait: bp.trait ?? null,
        milestonesReached: 0,
        hopDist: bp.id === 0 ? 0 : Infinity,
        parentId: null,
        parentLinkKind: null,
        parentLinkId: null,
        loopCount: 0,
        productionMult: bp.remote ? REMOTE_ISLAND_MULT : 1.0,
        visitorBuffTimer: 0,
        slots,
      };
    });

    this.bridges = [];
    this.routes = [];
    this.ships = [];
    this.buildings = [];
    this.events = [];
    this.constellation = this._generateConstellation();
    this.recomputeConnectivity();
  }

  _generateConstellation() {
    const rng = createSeededRng(`${this.seed || 'default'}#constellation`);
    const names3 = ['北の三角', '星見の三角', '蛍火の三角', '宵の三角', '天の三角'];
    const triangles = [];

    for (let i = 0; i < this.islands.length; i++) {
      const a = this.islands[i];
      if (a.trait === 'fog') continue;
      for (let j = i + 1; j < this.islands.length; j++) {
        const b = this.islands[j];
        if (b.trait === 'fog' || distance2D(a, b) > BRIDGE_MAX_DIST) continue;
        for (let k = j + 1; k < this.islands.length; k++) {
          const c = this.islands[k];
          if (c.trait === 'fog') continue;
          if (distance2D(a, c) <= BRIDGE_MAX_DIST && distance2D(b, c) <= BRIDGE_MAX_DIST) {
            const windCount =
              (a.trait === 'wind' ? 1 : 0) +
              (b.trait === 'wind' ? 1 : 0) +
              (c.trait === 'wind' ? 1 : 0);
            triangles.push({ ids: [a.id, b.id, c.id], windCount });
          }
        }
      }
    }

    // Prefer triangles without wind trait (and if generated map has non-home triangles, mix nicely)
    triangles.sort((x, y) => x.windCount - y.windCount || x.ids[0] - y.ids[0]);
    if (triangles.length > 0) {
      const bestTier = triangles.filter((t) => t.windCount === triangles[0].windCount);
      const picked = bestTier[Math.floor(rng() * bestTier.length)];
      const [a, b, c] = picked.ids;
      const nm = names3[Math.floor(rng() * names3.length)];
      return {
        name: nm,
        desc: '3島を互いにつなぐ（輪）',
        islandIds: [a, b, c],
        edges: [
          [a, b],
          [b, c],
          [c, a],
        ],
        completed: false,
        bonus: CONSTELLATION_BONUS,
      };
    }

    // Fallback: 3〜4島の一筆書き星座（0→近島→遠島）
    const near1 = this.islands.find(
      (isl) => isl.id !== 0 && !isl.remote && isl.trait !== 'fog' && distance2D(this.islands[0], isl) <= BRIDGE_MAX_DIST
    );
    const far1 = this.islands.find((isl) => isl.remote);
    if (near1 && far1) {
      const ids = [0, near1.id, far1.id];
      return {
        name: '天翔る矢',
        desc: '3島を順につなぐ',
        islandIds: ids,
        edges: [
          [0, near1.id],
          [near1.id, far1.id],
        ],
        completed: false,
        bonus: CONSTELLATION_BONUS,
      };
    }
    return null;
  }

  resetToTitle() {
    this.state = 'title';
    this.speed = this.defaultSpeed;
    this._initWorld();
    this._updateScore();
  }

  startGame(options = {}) {
    this.speed = this.defaultSpeed;
    if (options && 'seed' in options) {
      this.seed = options.seed ?? null;
    } else {
      this.seed = this.defaultSeed;
    }
    this._initWorld();
    this.state = 'play';
    this._updateScore();
    return { ok: true };
  }

  pause() {
    if (this.state === 'play') {
      this.state = 'paused';
      return { ok: true };
    }
    return { ok: false, reason: '一時停止できません' };
  }

  resume() {
    if (this.state === 'paused') {
      this.state = 'play';
      return { ok: true };
    }
    return { ok: false, reason: '再開できません' };
  }

  setSpeed(n) {
    const val = Number(n);
    if (!Number.isFinite(val) || val <= 0 || val > 100) {
      return { ok: false, reason: '倍率は0より大きく100以下の数値にしてください' };
    }
    this.speed = val;
    return { ok: true, speed: this.speed };
  }

  _nextId(prefix) {
    const id = `${prefix}-${this._idCounter}`;
    this._idCounter += 1;
    return id;
  }

  _emit(type, payload) {
    this.events.push({ type, ...payload });
  }

  consumeEvents() {
    if (this.events.length === 0) return [];
    const out = this.events;
    this.events = [];
    return out;
  }

  getConnectedCount() {
    let c = 0;
    for (const isl of this.islands) {
      if (isl.connected) c += 1;
    }
    return c;
  }

  getBuiltBridgeCount() {
    let c = 0;
    for (const br of this.bridges) {
      if (br.built) c += 1;
    }
    return c;
  }

  getNetworkMultiplier() {
    const connectedCount = this.getConnectedCount();
    const builtBridges = this.getBuiltBridgeCount();
    return (
      1 +
      Math.max(0, connectedCount - 1) * NETWORK_BONUS_PER_ISLAND +
      builtBridges * BRIDGE_NETWORK_BONUS
    );
  }

  getIslandsLightSum() {
    let sum = 0;
    for (const isl of this.islands) {
      sum += isl.light;
    }
    return sum;
  }

  getTotalLight() {
    return this.walletLight + this.getIslandsLightSum();
  }

  _updateScore() {
    const total = this.getTotalLight();
    this.score =
      Math.round(total) + this.allConnectedBonus + this.loopBonus + this.constellationBonus;
    return this.score;
  }

  getIsland(id) {
    const idx = typeof id === 'number' ? id : Number(id);
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.islands.length) {
      return null;
    }
    return this.islands[idx];
  }

  getBuildingAt(islandId, slotIndex) {
    const isl = this.getIsland(islandId);
    if (!isl) return null;
    const slot = isl.slots[slotIndex];
    if (!slot || !slot.buildingId) return null;
    return this.buildings.find((b) => b.id === slot.buildingId) || null;
  }

  getAdjacentBuildings(island, slotIndex) {
    const n = island.slots.length;
    const prevIdx = (slotIndex - 1 + n) % n;
    const nextIdx = (slotIndex + 1) % n;
    const out = [];
    for (const idx of [prevIdx, nextIdx]) {
      const b = this.getBuildingAt(island.id, idx);
      if (b && b.built) out.push(b);
    }
    return out;
  }

  getBuildingMultiplier(island, building) {
    const neighbors = this.getAdjacentBuildings(island, building.slotIndex);
    let mult = 1.0;
    const labels = [];

    if (building.type === 'stall') {
      if (island.trait === 'market') {
        mult += 0.5;
      }
      if (neighbors.some((nb) => nb.type === 'streetlight')) {
        mult += 0.5;
        labels.push('お客が来た！ +50%');
      }
      if (island.visitorBuffTimer > 0) {
        mult += 0.35;
      }
    } else if (building.type === 'house') {
      if (neighbors.some((nb) => nb.type === 'house')) {
        mult += 0.3;
        labels.push('町並み！ +30%');
      }
      if (neighbors.some((nb) => nb.type === 'streetlight')) {
        mult += 0.25;
        labels.push('夜道が明るい！ +25%');
      }
      if (island.visitorBuffTimer > 0) {
        mult += 0.2;
      }
    }

    return { mult, labels };
  }

  hasBuiltLighthouse(islandId) {
    return this.buildings.some(
      (b) => b.islandId === islandId && b.type === 'lighthouse' && b.built
    );
  }

  hasDirectConnection(idA, idB) {
    const hasBridge = this.bridges.some(
      (br) =>
        (br.islandA === idA && br.islandB === idB) ||
        (br.islandA === idB && br.islandB === idA)
    );
    if (hasBridge) return 'bridge';
    const hasRoute = this.routes.some(
      (rt) =>
        (rt.islandA === idA && rt.islandB === idB) ||
        (rt.islandA === idB && rt.islandB === idA)
    );
    if (hasRoute) return 'route';
    return null;
  }

  canBuildBridge(islandAId, islandBId, high = false) {
    if (this.state !== 'play') {
      return { ok: false, reason: 'ゲーム中ではありません' };
    }
    const a = this.getIsland(islandAId);
    const b = this.getIsland(islandBId);
    if (!a || !b) return { ok: false, reason: '島が見つかりません' };
    if (a.id === b.id) return { ok: false, reason: '同じ島には架けられません' };
    if (!a.connected && !b.connected) {
      return { ok: false, reason: 'つながっている島から架けてください' };
    }
    if (a.trait === 'fog' || b.trait === 'fog') {
      return { ok: false, reason: '霧の島には橋を架けられません（航路のみ）' };
    }
    if (!high && (a.trait === 'wind' || b.trait === 'wind')) {
      return { ok: false, reason: '風の島には通常の橋を架けられません（高い橋のみ）' };
    }
    if (distance2D(a, b) > BRIDGE_MAX_DIST) {
      return { ok: false, reason: '遠すぎて橋が届きません（航路を使ってください）' };
    }
    if (this.hasDirectConnection(a.id, b.id)) {
      return { ok: false, reason: 'この島同士はすでにつながっています' };
    }
    if (!high) {
      for (const rt of this.routes) {
        const rA = this.getIsland(rt.islandA);
        const rB = this.getIsland(rt.islandB);
        if (segmentsIntersect2D(a, b, rA, rB)) {
          return { ok: false, reason: '航路をふさぐため通常の橋は架けられません' };
        }
      }
    }
    const cost = high ? HIGH_BRIDGE_COST : BRIDGE_COST;
    if (this.walletLight < cost) {
      return { ok: false, reason: `灯りが足りません（必要: ${cost}）` };
    }
    return { ok: true, cost };
  }

  /**
   * この橋（通常）を架けたとき、まだ引かれていない遠い島への直線航路候補がふさがれるペアを返す
   */
  getFutureBlockedRoutes(islandAId, islandBId, high = false) {
    if (high) return [];
    const a = this.getIsland(islandAId);
    const b = this.getIsland(islandBId);
    if (!a || !b) return [];

    const connected = this.islands.filter((isl) => isl.connected);
    const results = [];
    for (const target of this.islands) {
      if (target.connected || !target.remote) continue;
      if (this.routes.some((rt) => rt.islandA === target.id || rt.islandB === target.id)) {
        continue;
      }
      // 始まりの島(0)からの直線航路を優先確認し、なければ他の接続済み島からの直線航路を確認
      const origin0 = this.islands[0];
      let blockedFrom = null;
      if (segmentsIntersect2D(a, b, origin0, target)) {
        blockedFrom = origin0;
      } else {
        for (const orig of connected) {
          if (orig.id === a.id || orig.id === b.id) continue;
          if (segmentsIntersect2D(a, b, orig, target)) {
            blockedFrom = orig;
            break;
          }
        }
      }
      if (blockedFrom) {
        results.push({ fromIsland: blockedFrom, toIsland: target });
      }
    }
    return results;
  }

  buildBridge(islandAId, islandBId, high = false) {
    const check = this.canBuildBridge(islandAId, islandBId, Boolean(high));
    if (!check.ok) return check;

    const a = this.getIsland(islandAId);
    const b = this.getIsland(islandBId);
    const fromIsland = a.connected ? a : b;
    const toIsland = a.connected ? b : a;

    this.walletLight -= check.cost;
    const id = this._nextId('bridge');
    const bridge = {
      id,
      islandA: fromIsland.id,
      islandB: toIsland.id,
      high: Boolean(high),
      buildTime: high ? HIGH_BRIDGE_TIME : BRIDGE_TIME,
      elapsed: 0,
      progress: 0,
      built: false,
      flow: 0,
      flowDir: 1,
    };
    this.bridges.push(bridge);
    this._updateScore();
    this._emit('bridgeStarted', { bridge });
    return { ok: true, bridgeId: id };
  }

  removeBridge(bridgeId) {
    if (this.state !== 'play') {
      return { ok: false, reason: 'ゲーム中ではありません' };
    }
    const idx = this.bridges.findIndex((br) => br.id === bridgeId);
    if (idx === -1) {
      return { ok: false, reason: '橋が見つかりません' };
    }
    if (this.walletLight < REMOVE_BRIDGE_COST) {
      return { ok: false, reason: `撤去には灯り${REMOVE_BRIDGE_COST}が必要です` };
    }
    this.walletLight -= REMOVE_BRIDGE_COST;
    const [removed] = this.bridges.splice(idx, 1);
    this.recomputeConnectivity();
    this._updateScore();
    this._emit('bridgeRemoved', { bridge: removed });
    return { ok: true };
  }

  canBuildRoute(islandAId, islandBId) {
    if (this.state !== 'play') {
      return { ok: false, reason: 'ゲーム中ではありません' };
    }
    const a = this.getIsland(islandAId);
    const b = this.getIsland(islandBId);
    if (!a || !b) return { ok: false, reason: '島が見つかりません' };
    if (a.id === b.id) return { ok: false, reason: '同じ島には航路を引けません' };
    if (!a.connected && !b.connected) {
      return { ok: false, reason: 'つながっている島から航路を引いてください' };
    }
    if (a.connected && b.connected) {
      return { ok: false, reason: 'この島はもうつながっています' };
    }
    const toIsland = a.connected ? b : a;
    if (this.routes.some((rt) => rt.islandB === toIsland.id || rt.islandA === toIsland.id)) {
      return { ok: false, reason: 'この島へはすでに航路があります' };
    }
    if (this.hasDirectConnection(a.id, b.id)) {
      return { ok: false, reason: 'すでに橋または航路があります' };
    }
    for (const br of this.bridges) {
      if (br.high) continue;
      const bA = this.getIsland(br.islandA);
      const bB = this.getIsland(br.islandB);
      if (segmentsIntersect2D(a, b, bA, bB)) {
        return { ok: false, reason: '橋が航路をふさいでいます' };
      }
    }
    if (this.walletLight < ROUTE_COST) {
      return { ok: false, reason: `灯りが足りません（必要: ${ROUTE_COST}）` };
    }
    return { ok: true, cost: ROUTE_COST };
  }

  buildRoute(islandAId, islandBId) {
    const check = this.canBuildRoute(islandAId, islandBId);
    if (!check.ok) return check;

    const a = this.getIsland(islandAId);
    const b = this.getIsland(islandBId);
    const fromIsland = a.connected ? a : b;
    const toIsland = a.connected ? b : a;

    this.walletLight -= check.cost;
    const routeId = this._nextId('route');
    const route = {
      id: routeId,
      islandA: fromIsland.id,
      islandB: toIsland.id,
      established: false,
      deliveries: 0,
      distance: distance2D(fromIsland, toIsland),
      flow: 0,
      flowDir: 1,
    };
    this.routes.push(route);

    const shipId = this._nextId('ship');
    const ship = {
      id: shipId,
      routeId,
      from: fromIsland.id,
      to: toIsland.id,
      cargo: 'supplies', // 'supplies' (資材: 建築加速) | 'visitors' (お客: 生産UP)
      progress: 0,
      waitTimer: 0,
    };
    this.ships.push(ship);

    this._updateScore();
    this._emit('routeBuilt', { route, ship });
    return { ok: true, routeId, shipId };
  }

  canPlaceBuilding(islandId, type, slotIndex) {
    if (this.state !== 'play') {
      return { ok: false, reason: 'ゲーム中ではありません' };
    }
    const def = BUILDING_DEFS[type];
    if (!def) {
      return { ok: false, reason: '不明な建物タイプです' };
    }
    const isl = this.getIsland(islandId);
    if (!isl) {
      return { ok: false, reason: '島が見つかりません' };
    }
    if (!isl.connected) {
      return { ok: false, reason: 'まだつながっていない島には建てられません' };
    }
    const slotIdx = Number(slotIndex);
    if (!Number.isInteger(slotIdx) || slotIdx < 0 || slotIdx >= isl.slots.length) {
      return { ok: false, reason: '無効なスロット番号です' };
    }
    if (isl.slots[slotIdx].buildingId !== null) {
      return { ok: false, reason: 'このスロットにはすでに建物があります' };
    }
    if (this.walletLight < def.cost) {
      return { ok: false, reason: `灯りが足りません（必要: ${def.cost}）` };
    }
    return { ok: true, def, island: isl, slotIdx };
  }

  placeBuilding(islandId, type, slotIndex) {
    const check = this.canPlaceBuilding(islandId, type, slotIndex);
    if (!check.ok) return check;

    const { def, island, slotIdx } = check;
    this.walletLight -= def.cost;
    const id = this._nextId('bld');
    const building = {
      id,
      islandId: island.id,
      slotIndex: slotIdx,
      type: def.type,
      buildTime: def.buildTime,
      elapsed: 0,
      progress: 0,
      built: false,
    };
    this.buildings.push(building);
    island.slots[slotIdx].buildingId = id;
    this._updateScore();
    this._emit('buildingStarted', { building, island });
    return { ok: true, buildingId: id };
  }

  recomputeConnectivity() {
    const prevLoopCount = this.loopCount || 0;
    const adj = new Map();
    for (const isl of this.islands) adj.set(isl.id, []);

    const activeEdges = [];
    for (const br of this.bridges) {
      if (!br.built) continue;
      const edge = { kind: 'bridge', id: br.id, a: br.islandA, b: br.islandB, cost: 1, ref: br };
      activeEdges.push(edge);
      adj.get(br.islandA)?.push({ to: br.islandB, cost: 1, edge });
      adj.get(br.islandB)?.push({ to: br.islandA, cost: 1, edge });
    }
    for (const rt of this.routes) {
      if (!rt.established) continue;
      const edge = { kind: 'route', id: rt.id, a: rt.islandA, b: rt.islandB, cost: 2, ref: rt };
      activeEdges.push(edge);
      adj.get(rt.islandA)?.push({ to: rt.islandB, cost: 2, edge });
      adj.get(rt.islandB)?.push({ to: rt.islandA, cost: 2, edge });
    }

    // Dijkstra shortest weighted path from island 0 (bridge=1, route=2)
    const dist = new Map();
    const parent = new Map();
    const parentEdge = new Map();
    const settled = new Set();
    for (const isl of this.islands) dist.set(isl.id, Infinity);
    dist.set(0, 0);

    while (settled.size < this.islands.length) {
      let bestId = null;
      let bestDist = Infinity;
      for (const isl of this.islands) {
        if (settled.has(isl.id)) continue;
        const d = dist.get(isl.id);
        if (d < bestDist) {
          bestDist = d;
          bestId = isl.id;
        }
      }
      if (bestId === null) break;
      settled.add(bestId);
      for (const step of adj.get(bestId) || []) {
        const nd = bestDist + step.cost;
        if (nd < dist.get(step.to)) {
          dist.set(step.to, nd);
          parent.set(step.to, bestId);
          parentEdge.set(step.to, step.edge);
        }
      }
    }

    for (const isl of this.islands) {
      const d = dist.get(isl.id);
      isl.connected = d < Infinity;
      isl.hopDist = d;
      isl.parentId = parent.get(isl.id) ?? null;
      const pe = parentEdge.get(isl.id);
      isl.parentLinkKind = pe ? pe.kind : null;
      isl.parentLinkId = pe ? pe.id : null;
      isl.loopCount = 0;
    }

    // Detect fundamental cycles (光の環) in the connected component of 0
    const treeEdgeKeys = new Set();
    for (const isl of this.islands) {
      const pe = parentEdge.get(isl.id);
      if (pe) treeEdgeKeys.add(`${pe.kind}:${pe.id}`);
    }

    const depth = new Map([[0, 0]]);
    const getDepth = (id) => {
      if (depth.has(id)) return depth.get(id);
      const p = parent.get(id);
      const d = p !== undefined ? getDepth(p) + 1 : 0;
      depth.set(id, d);
      return d;
    };

    const cycles = [];
    for (const edge of activeEdges) {
      if (!this.getIsland(edge.a)?.connected || !this.getIsland(edge.b)?.connected) continue;
      if (treeEdgeKeys.has(`${edge.kind}:${edge.id}`)) continue;
      // Trace u and v up to LCA in Dijkstra tree to get cycle node order
      let u = edge.a;
      let v = edge.b;
      const pathU = [u];
      const pathV = [v];
      let du = getDepth(u);
      let dv = getDepth(v);
      while (du > dv && parent.has(u)) {
        u = parent.get(u);
        pathU.push(u);
        du -= 1;
      }
      while (dv > du && parent.has(v)) {
        v = parent.get(v);
        pathV.push(v);
        dv -= 1;
      }
      while (u !== v && parent.has(u) && parent.has(v)) {
        u = parent.get(u);
        v = parent.get(v);
        pathU.push(u);
        pathV.push(v);
      }
      pathV.pop(); // avoid duplicating LCA
      const cycleIds = [...pathU, ...pathV.reverse()];
      if (cycleIds.length >= 3) {
        cycles.push(cycleIds);
      }
    }

    const creditedCycles = cycles.slice(0, LOOP_MAX_COUNT);
    this.loops = creditedCycles;
    this.loopCount = creditedCycles.length;
    this.loopBonus = this.loopCount * LOOP_SCORE_BONUS;
    for (const cyc of creditedCycles) {
      for (const id of cyc) {
        const isl = this.getIsland(id);
        if (isl && isl.loopCount < LOOP_MAX_COUNT) {
          isl.loopCount += 1;
        }
      }
    }

    if (this.state === 'play' && this.loopCount > prevLoopCount) {
      const latest = creditedCycles[this.loopCount - 1] || [];
      this._emit('loopFormed', {
        cycleIslandIds: latest,
        loopCount: this.loopCount,
        bonus: LOOP_SCORE_BONUS,
      });
    }

    // Check constellation completion (今夜の星座)
    if (this.constellation && !this.constellation.completed) {
      const hasActiveLink = (u, v) =>
        activeEdges.some((e) => (e.a === u && e.b === v) || (e.a === v && e.b === u));
      if (this.constellation.edges.every(([u, v]) => hasActiveLink(u, v))) {
        this.constellation.completed = true;
        this.constellationBonus = this.constellation.bonus;
        if (this.state === 'play') {
          this._emit('constellationCompleted', {
            constellation: this.constellation,
            bonus: this.constellationBonus,
          });
        }
      }
    }

    this.recomputeFlow();
  }

  recomputeFlow() {
    const edgeByKey = new Map();
    for (const br of this.bridges) {
      br.flow = 0;
      br.flowDir = 1;
      edgeByKey.set(`bridge:${br.id}`, br);
    }
    for (const rt of this.routes) {
      rt.flow = 0;
      rt.flowDir = 1;
      edgeByKey.set(`route:${rt.id}`, rt);
    }

    for (const isl of this.islands) {
      if (!isl.connected || isl.id === 0 || !Number.isFinite(isl.hopDist)) continue;
      const weightFactor =
        isl.hopDist <= 1 ? 1.0 : 1 / (1 + 0.35 * (isl.hopDist - 1));
      const contrib = Math.max(6, isl.light) * weightFactor;
      let curr = isl;
      let guard = 0;
      while (curr && curr.id !== 0 && curr.parentLinkId && guard < this.islands.length) {
        guard += 1;
        const link = edgeByKey.get(`${curr.parentLinkKind}:${curr.parentLinkId}`);
        if (link) {
          link.flow += contrib;
          link.flowDir = link.islandA === curr.id ? 1 : -1;
        }
        curr = this.getIsland(curr.parentId);
      }
    }

    // Add gentle circulation baseline to loop edges so cycle chords visibly glow
    if (this.loops && this.loops.length > 0) {
      const loopNodePairs = new Set();
      for (const cyc of this.loops) {
        for (let i = 0; i < cyc.length; i++) {
          const u = cyc[i];
          const v = cyc[(i + 1) % cyc.length];
          loopNodePairs.add(`${Math.min(u, v)}-${Math.max(u, v)}`);
        }
      }
      for (const br of this.bridges) {
        if (!br.built) continue;
        const key = `${Math.min(br.islandA, br.islandB)}-${Math.max(br.islandA, br.islandB)}`;
        if (loopNodePairs.has(key) && br.flow < 8) {
          br.flow = Math.max(br.flow, 8);
        }
      }
    }
  }

  _checkAllConnected() {
    if (this.dawnActive || this.state !== 'play') return;
    if (this.islands.every((isl) => isl.connected)) {
      this._triggerDawn(true);
    }
  }

  _triggerDawn(allConnected) {
    if (this.dawnActive) return;
    this.dawnActive = true;
    this.dawnProgress = 0;
    this.state = 'dawn';
    if (allConnected) {
      this.dawnReason = 'すべての島がつながりました！';
      this.allConnectedBonus = Math.floor(Math.max(0, this.timeLeft)) * 2;
    } else {
      this.dawnReason = '夜明けが訪れました';
      this.allConnectedBonus = 0;
    }
    this._updateScore();
    this._emit('dawnStarted', {
      allConnected,
      reason: this.dawnReason,
      bonus: this.allConnectedBonus,
    });
  }

  _completeBuilding(b, isl) {
    b.built = true;
    b.progress = 1;
    this._emit('buildingCompleted', { building: b, island: isl });
    const selfCombo = this.getBuildingMultiplier(isl, b);
    for (const lbl of selfCombo.labels) {
      this._emit('comboPopup', {
        islandId: isl.id,
        slotIndex: b.slotIndex,
        text: lbl,
      });
    }
    for (const nb of this.getAdjacentBuildings(isl, b.slotIndex)) {
      if (b.type === 'streetlight' && nb.type === 'stall') {
        this._emit('comboPopup', {
          islandId: isl.id,
          slotIndex: nb.slotIndex,
          text: 'お客が来た！ +50%',
        });
      } else if (b.type === 'house' && nb.type === 'house') {
        this._emit('comboPopup', {
          islandId: isl.id,
          slotIndex: nb.slotIndex,
          text: '町並み！ +30%',
        });
      } else if (b.type === 'streetlight' && nb.type === 'house') {
        this._emit('comboPopup', {
          islandId: isl.id,
          slotIndex: nb.slotIndex,
          text: '夜道が明るい！ +25%',
        });
      }
    }
  }

  step(rawDt) {
    if (this.state === 'dawn') {
      const realDt = Math.min(rawDt, 0.5);
      if (realDt <= 0) return;
      this.dawnProgress = Math.min(1, this.dawnProgress + realDt / DAWN_DURATION);
      if (this.dawnProgress >= 1) {
        this.state = 'result';
        this._updateScore();
        this._emit('gameEnded', {
          score: this.score,
          reason: this.dawnReason,
          bonus: this.allConnectedBonus,
        });
      }
      return;
    }

    if (this.state !== 'play') return;
    const dt = Math.min(rawDt, 0.5) * this.speed;
    if (dt <= 0) return;

    // 1. Night countdown
    const elapsedNight = NIGHT_DURATION - this.timeLeft;
    this.timeLeft = Math.max(0, this.timeLeft - dt);

    // 2. Central beacon trickle + recovery floor so early overspending doesn't soft-lock
    const baseTrickle = this.walletLight < 32 ? 0.55 : 0.08;
    this.walletLight += baseTrickle * dt;

    // Network production multiplier
    const networkMult = this.getNetworkMultiplier();

    // Update visitor buff timers
    for (const isl of this.islands) {
      if (isl.visitorBuffTimer > 0) {
        isl.visitorBuffTimer = Math.max(0, isl.visitorBuffTimer - dt);
      }
    }

    // 3. Buildings progress & production
    for (const b of this.buildings) {
      if (!b.built) {
        b.elapsed += dt;
        b.progress = Math.min(1, b.elapsed / b.buildTime);
        if (b.progress >= 1) {
          this._completeBuilding(b, this.getIsland(b.islandId));
        }
      } else {
        const isl = this.getIsland(b.islandId);
        if (!isl.connected) continue;
        const def = BUILDING_DEFS[b.type];
        const { mult } = this.getBuildingMultiplier(isl, b);
        const loopMult = 1 + (isl.loopCount || 0) * LOOP_PROD_BONUS;
        isl.light += def.islandRate * mult * isl.productionMult * networkMult * loopMult * dt;
      }
    }

    // 4. Bridges construction & light sharing ("光の道")
    let connectivityDirty = false;
    for (const br of this.bridges) {
      if (!br.built) {
        br.elapsed += dt;
        br.progress = Math.min(1, br.elapsed / br.buildTime);
        if (br.progress >= 1) {
          br.built = true;
          connectivityDirty = true;
          const bonus = br.high ? 22 : 16;
          const target = this.getIsland(br.islandB);
          const source = this.getIsland(br.islandA);
          const recipient = !target.connected ? target : (!source.connected ? source : target);
          recipient.light += bonus;
          this._emit('bridgeCompleted', { bridge: br, recipient, bonus });
        }
      } else {
        const a = this.getIsland(br.islandA);
        const b = this.getIsland(br.islandB);
        if (a.connected && b.connected) {
          // 橋でつながった島どうしは灯りを分け合い、光の道で少しずつ灯りが生まれる
          const diff = (a.light - b.light) * 0.08 * dt;
          a.light -= diff;
          b.light += diff;
          a.light += 0.32 * dt;
          b.light += 0.32 * dt;
        }
      }
    }

    if (connectivityDirty) {
      this.recomputeConnectivity();
      this._checkAllConnected();
      if (this.dawnActive) return;
    }

    // 5. Ships along routes (資材 = 建築加速 / お客 = 屋台・家生産UP / 逓減報酬)
    for (const ship of this.ships) {
      const route = this.routes.find((r) => r.id === ship.routeId);
      if (!route) continue;
      const islFrom = this.getIsland(ship.from);
      const islTo = this.getIsland(ship.to);
      if (!islFrom.connected && !islTo.connected) continue;

      if (ship.waitTimer > 0) {
        ship.waitTimer -= dt;
        continue;
      }

      let speedMult = 1.0;
      if (this.hasBuiltLighthouse(ship.from)) speedMult += 0.4;
      if (this.hasBuiltLighthouse(ship.to)) speedMult += 0.3;
      const hasPortTrait = islFrom.trait === 'port' || islTo.trait === 'port';
      if (hasPortTrait) speedMult += 0.35;

      const travelStep = (SHIP_BASE_SPEED * speedMult * dt) / Math.max(1, route.distance);
      ship.progress += travelStep;

      if (ship.progress >= 1) {
        ship.progress = 0;
        ship.waitTimer = 0.45;
        const arrivedIsland = islTo;
        const cargo = ship.cargo;

        if (!route.established) {
          route.established = true;
          route.deliveries = 1;
          const firstTimeUnconnected = !arrivedIsland.connected;
          this.recomputeConnectivity();
          const islandGain = 30 + (hasPortTrait ? 6 : 0);
          const walletGain = 6 + (hasPortTrait ? 2 : 0);
          arrivedIsland.light += islandGain;
          this.walletLight += walletGain;
          this._emit('shipArrived', {
            ship,
            route,
            island: arrivedIsland,
            cargo,
            firstArrival: true,
            unlocked: firstTimeUnconnected,
            islandGain,
            walletGain,
            cargoNote: hasPortTrait ? '初便開通！港+1' : '初便開通！',
          });
          this._checkAllConnected();
          if (this.dawnActive) return;
        } else {
          route.deliveries += 1;
          const dIdx = route.deliveries - 1;
          const baseIslandGain = arrivedIsland.remote ? 20 : 12;
          const islandGain =
            Math.max(5, Math.round(baseIslandGain * Math.pow(0.86, dIdx))) +
            (hasPortTrait ? 4 : 0);
          const walletGain =
            (dIdx <= 6 ? Math.max(1, Math.round(5 * Math.pow(0.76, dIdx - 1))) : 0) +
            (hasPortTrait ? 1 : 0);

          arrivedIsland.light += islandGain;
          this.walletLight += walletGain;

          let cargoNote = '';
          if (cargo === 'supplies') {
            // 資材: 到着島の建築中の建物を進める（港特性なら+1.5秒）
            const buildingInProg = this.buildings.find(
              (b) => b.islandId === arrivedIsland.id && !b.built
            );
            if (buildingInProg) {
              buildingInProg.elapsed += 3.5 + (hasPortTrait ? 1.5 : 0);
              buildingInProg.progress = Math.min(1, buildingInProg.elapsed / buildingInProg.buildTime);
              if (buildingInProg.progress >= 1) {
                this._completeBuilding(buildingInProg, arrivedIsland);
              }
              cargoNote = hasPortTrait ? '資材+1で加速！' : '資材で建築加速！';
            } else {
              cargoNote = hasPortTrait ? '資材+1到着' : '資材到着';
            }
          } else {
            // お客: 到着島の屋台・家にバフ（港特性なら+5秒）
            arrivedIsland.visitorBuffTimer = 14 + (hasPortTrait ? 5 : 0);
            cargoNote = hasPortTrait ? 'お客+1！生産UP' : 'お客が来た！生産UP';
          }

          this._emit('shipArrived', {
            ship,
            route,
            island: arrivedIsland,
            cargo,
            firstArrival: false,
            unlocked: false,
            islandGain,
            walletGain,
            cargoNote,
          });
        }

        // 折り返し & 積み荷切り替え
        const prevFrom = ship.from;
        ship.from = ship.to;
        ship.to = prevFrom;
        ship.cargo = cargo === 'supplies' ? 'visitors' : 'supplies';
      }
    }

    // 6. Island light decay (最初の30秒は序盤保護で減衰を緩く) + wallet flow
    const earlyGrace =
      elapsedNight < 30 ? 0.25 : elapsedNight < 50 ? 0.25 + ((elapsedNight - 30) / 20) * 0.75 : 1.0;

    for (const isl of this.islands) {
      if (!isl.connected) continue;
      const lighthouseCount = this.buildings.filter(
        (b) => b.islandId === isl.id && b.type === 'lighthouse' && b.built
      ).length;
      let decayFactor = lighthouseCount >= 2 ? 0.35 : lighthouseCount === 1 ? 0.5 : 1.0;
      if (isl.trait === 'forest') {
        decayFactor *= 0.5;
      }
      const decayRate = (0.38 + 0.042 * isl.light) * decayFactor * earlyGrace;
      isl.light = Math.max(0, isl.light - decayRate * dt);

      const pathMult =
        isl.id === 0
          ? 1.0
          : isl.hopDist <= 1
            ? 1.16
            : isl.hopDist === 2
              ? 1.0
              : Math.max(0.45, 1.06 - 0.16 * isl.hopDist);
      this.walletLight += isl.light * WALLET_FLOW_RATE * pathMult * dt;

      // 節目(50/100/200)到達チェック（星見の島は2倍ボーナス）
      for (const m of LIGHT_MILESTONES) {
        if (isl.light >= m.threshold && m.threshold > (isl.milestonesReached || 0)) {
          isl.milestonesReached = m.threshold;
          const bonus = isl.trait === 'starlight' ? m.bonus * 2 : m.bonus;
          isl.light += bonus;
          this._emit('islandMilestone', {
            island: isl,
            threshold: m.threshold,
            bonus,
            starlight: isl.trait === 'starlight',
          });
        }
      }
    }

    this.recomputeFlow();
    this._updateScore();

    // 7. Time up -> Dawn
    if (this.timeLeft <= 0) {
      this._triggerDawn(false);
    }
  }
}
