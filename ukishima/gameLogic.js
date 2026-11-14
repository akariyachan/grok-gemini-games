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
  constructor(defaultSpeed = 1) {
    this.defaultSpeed = defaultSpeed;
    this.speed = defaultSpeed;
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
    this.score = 0;
    this._idCounter = 1;

    this.islands = ISLAND_BLUEPRINTS.map((bp) => {
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
  }

  resetToTitle() {
    this.state = 'title';
    this.speed = this.defaultSpeed;
    this._initWorld();
    this._updateScore();
  }

  startGame() {
    this.speed = this.defaultSpeed;
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
    this.score = Math.round(total) + this.allConnectedBonus;
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
    const visited = new Set([0]);
    const queue = [0];
    while (queue.length > 0) {
      const curr = queue.shift();
      for (const br of this.bridges) {
        if (!br.built) continue;
        if (br.islandA === curr && !visited.has(br.islandB)) {
          visited.add(br.islandB);
          queue.push(br.islandB);
        } else if (br.islandB === curr && !visited.has(br.islandA)) {
          visited.add(br.islandA);
          queue.push(br.islandA);
        }
      }
      for (const rt of this.routes) {
        if (!rt.established) continue;
        if (rt.islandA === curr && !visited.has(rt.islandB)) {
          visited.add(rt.islandB);
          queue.push(rt.islandB);
        } else if (rt.islandB === curr && !visited.has(rt.islandA)) {
          visited.add(rt.islandA);
          queue.push(rt.islandA);
        }
      }
    }

    for (const isl of this.islands) {
      isl.connected = visited.has(isl.id);
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
        isl.light += def.islandRate * mult * isl.productionMult * networkMult * dt;
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
          arrivedIsland.light += 30;
          this.walletLight += 6;
          this._emit('shipArrived', {
            ship,
            route,
            island: arrivedIsland,
            cargo,
            firstArrival: true,
            unlocked: firstTimeUnconnected,
            islandGain: 30,
            walletGain: 6,
            cargoNote: '初便開通！',
          });
          this._checkAllConnected();
          if (this.dawnActive) return;
        } else {
          route.deliveries += 1;
          const dIdx = route.deliveries - 1;
          const baseIslandGain = arrivedIsland.remote ? 20 : 12;
          const islandGain = Math.max(5, Math.round(baseIslandGain * Math.pow(0.86, dIdx)));
          const walletGain = dIdx <= 6 ? Math.max(1, Math.round(5 * Math.pow(0.76, dIdx - 1))) : 0;

          arrivedIsland.light += islandGain;
          this.walletLight += walletGain;

          let cargoNote = '';
          if (cargo === 'supplies') {
            // 資材: 到着島の建築中の建物を3.5秒分進める
            const buildingInProg = this.buildings.find(
              (b) => b.islandId === arrivedIsland.id && !b.built
            );
            if (buildingInProg) {
              buildingInProg.elapsed += 3.5;
              buildingInProg.progress = Math.min(1, buildingInProg.elapsed / buildingInProg.buildTime);
              if (buildingInProg.progress >= 1) {
                this._completeBuilding(buildingInProg, arrivedIsland);
              }
              cargoNote = '資材で建築加速！';
            } else {
              cargoNote = '資材到着';
            }
          } else {
            // お客: 到着島の屋台(+35%)・家(+20%)に14秒間バフ
            arrivedIsland.visitorBuffTimer = 14;
            cargoNote = 'お客が来た！生産UP';
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
      const decayFactor = lighthouseCount >= 2 ? 0.35 : lighthouseCount === 1 ? 0.5 : 1.0;
      const decayRate = (0.38 + 0.042 * isl.light) * decayFactor * earlyGrace;
      isl.light = Math.max(0, isl.light - decayRate * dt);

      this.walletLight += isl.light * WALLET_FLOW_RATE * dt;
    }

    this._updateScore();

    // 7. Time up -> Dawn
    if (this.timeLeft <= 0) {
      this._triggerDawn(false);
    }
  }
}
