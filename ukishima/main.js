import {
  BRIDGE_COST,
  BRIDGE_MAX_DIST,
  BRIDGE_TIME,
  BUILDING_DEFS,
  GameSimulation,
  HIGH_BRIDGE_COST,
  HIGH_BRIDGE_TIME,
  REMOTE_ISLAND_MULT,
  REMOVE_BRIDGE_COST,
  ROUTE_COST,
  distance2D,
  segmentsIntersect2D,
} from './gameLogic.js';
import { Scene3D } from './scene3d.js';

const BEST_SCORE_KEY = 'ukishima_best_score';

function loadBestScore() {
  try {
    const val = Number(localStorage.getItem(BEST_SCORE_KEY) || 0);
    return Number.isFinite(val) ? val : 0;
  } catch {
    return 0;
  }
}

function saveBestScore(score) {
  try {
    const prev = loadBestScore();
    const next = Math.max(prev, score);
    localStorage.setItem(BEST_SCORE_KEY, String(next));
    return next;
  } catch {
    return score;
  }
}

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

// DOM Elements
const canvasWrap = document.getElementById('canvas-wrap');
const modeBadgesLayer = document.getElementById('mode-badges-layer');
const popupsLayer = document.getElementById('popups-layer');
const toastContainer = document.getElementById('toast-container');

const hudTop = document.getElementById('hud-top');
const hudBottom = document.getElementById('hud-bottom');
const hudTotalLight = document.getElementById('hud-total-light');
const hudLightBreakdown = document.getElementById('hud-light-breakdown');
const hudTimeLeft = document.getElementById('hud-time-left');
const hudConnectedCount = document.getElementById('hud-connected-count');
const hudTotalIslands = document.getElementById('hud-total-islands');
const hudSpeedBadge = document.getElementById('hud-speed-badge');
const btnPause = document.getElementById('btn-pause');

const selectionBanner = document.getElementById('selection-banner');
const selectionText = document.getElementById('selection-text');
const btnCancelSelection = document.getElementById('btn-cancel-selection');

const modeTabs = [...document.querySelectorAll('.mode-tab')];
const panelBuild = document.getElementById('panel-build');
const panelAction = document.getElementById('panel-action');
const buildHint = document.getElementById('build-hint');
const buildCards = [...document.querySelectorAll('.build-card')];
const actionTitle = document.getElementById('action-title');
const actionDesc = document.getElementById('action-desc');
const selectedBridgeActions = document.getElementById('selected-bridge-actions');
const btnRemoveSelectedBridge = document.getElementById('btn-remove-selected-bridge');

const screenTitle = document.getElementById('screen-title');
const screenHowto = document.getElementById('screen-howto');
const screenPause = document.getElementById('screen-pause');
const screenResult = document.getElementById('screen-result');

const titleBestScore = document.getElementById('title-best-score');
const resultReason = document.getElementById('result-reason');
const resultScore = document.getElementById('result-score');
const resultBest = document.getElementById('result-best');
const rbIslandsLight = document.getElementById('rb-islands-light');
const rbWalletLight = document.getElementById('rb-wallet-light');
const rbConnected = document.getElementById('rb-connected');
const rbTimeBonus = document.getElementById('rb-time-bonus');

// Simulation & Scene
const urlParams = new URLSearchParams(window.location.search);
const initialSpeed = urlParams.get('fast') === '1' ? 10 : 1;
const sim = new GameSimulation(initialSpeed);

const uiState = {
  mode: 'build', // 'build' | 'bridge' | 'highBridge' | 'route' | 'remove'
  selectedIslandId: 0,
  selectedSlotIndex: 0,
  originIslandId: null,
  selectedBridgeId: null,
  howtoReturnTo: 'title',
  islandHighlight: new Map(),
};

const scene3d = new Scene3D(canvasWrap, handleWorldTap);
scene3d.buildIslands(sim.islands);

function showToast(text, kind = 'normal') {
  const el = document.createElement('div');
  el.className = `toast ${kind === 'warn' ? 'warn' : kind === 'good' ? 'good' : ''}`;
  el.textContent = text;
  toastContainer.appendChild(el);
  while (toastContainer.children.length > 3) {
    toastContainer.removeChild(toastContainer.firstChild);
  }
  setTimeout(() => {
    el.remove();
  }, 2600);
}

const activePopups = [];

function spawnWorldPopup(worldX, worldY, worldZ, text, tone = 'amber') {
  const pt = scene3d.projectToScreen(worldX, worldY, worldZ);
  if (!pt.visible) return;

  const now = performance.now();
  // Clean stale entries
  for (let i = activePopups.length - 1; i >= 0; i--) {
    if (now - activePopups[i].createdAt > 1500) {
      activePopups.splice(i, 1);
    }
  }

  // 重なり回避のため、近い座標のポップアップがあれば縦にずらす
  let x = pt.x;
  let y = pt.y;
  const minH = popupsLayer.clientHeight ? 54 : 54;
  for (let attempt = 0; attempt < 6; attempt++) {
    const clash = activePopups.some(
      (p) => Math.abs(p.x - x) < 115 && Math.abs(p.y - y) < 28
    );
    if (!clash) break;
    y -= 28;
  }
  y = Math.max(minH, y);
  x = Math.max(70, Math.min((popupsLayer.clientWidth || window.innerWidth) - 70, x));

  const el = document.createElement('div');
  el.className = `float-popup ${tone === 'cyan' ? 'cyan' : ''}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  popupsLayer.appendChild(el);

  const entry = { x, y, createdAt: now };
  activePopups.push(entry);

  setTimeout(() => {
    el.remove();
  }, 2000);
}

function clearSelection() {
  uiState.selectedIslandId = null;
  uiState.selectedSlotIndex = null;
  uiState.originIslandId = null;
  uiState.selectedBridgeId = null;
}

function setMode(mode) {
  uiState.mode = mode;
  uiState.originIslandId = null;
  uiState.selectedBridgeId = null;
  if (mode !== 'build') {
    uiState.selectedSlotIndex = null;
  }
  for (const tab of modeTabs) {
    tab.classList.toggle('active', tab.dataset.mode === mode);
  }
  refreshUI();
}

function handleWorldTap(hit) {
  if (sim.state !== 'play') return;

  if (!hit) {
    clearSelection();
    refreshUI();
    return;
  }

  if (uiState.mode === 'remove') {
    if (hit.kind === 'bridge') {
      uiState.selectedBridgeId = hit.bridgeId;
      uiState.selectedIslandId = null;
      uiState.selectedSlotIndex = null;
      refreshUI();
    } else {
      uiState.selectedBridgeId = null;
      showToast('撤去したい橋をタップして選択してください', 'normal');
      refreshUI();
    }
    return;
  }

  if (uiState.mode === 'bridge' || uiState.mode === 'highBridge' || uiState.mode === 'route') {
    const islandId = hit.islandId;
    if (islandId === undefined) return;
    const isl = sim.getIsland(islandId);
    if (!isl) return;

    if (uiState.originIslandId === null) {
      if (!isl.connected) {
        showToast('つながっている島を先に選んでください', 'warn');
        return;
      }
      uiState.originIslandId = islandId;
      uiState.selectedIslandId = islandId;
      refreshUI();
      return;
    }

    if (uiState.originIslandId === islandId) {
      uiState.originIslandId = null;
      uiState.selectedIslandId = null;
      refreshUI();
      return;
    }

    const res =
      uiState.mode === 'route'
        ? sim.buildRoute(uiState.originIslandId, islandId)
        : sim.buildBridge(uiState.originIslandId, islandId, uiState.mode === 'highBridge');

    if (res.ok) {
      const msg =
        uiState.mode === 'route'
          ? '航路を開き、船が出発しました！'
          : uiState.mode === 'highBridge'
            ? '高い橋の建設を始めました！'
            : '橋の建設を始めました！';
      showToast(msg, 'good');
      // 連続で橋/航路を引けるよう出発島の選択を維持する
      uiState.selectedIslandId = uiState.originIslandId;
    } else {
      showToast(res.reason, 'warn');
    }
    refreshUI();
    return;
  }

  if (hit.kind === 'bridge') {
    uiState.selectedBridgeId = hit.bridgeId;
    uiState.selectedIslandId = null;
    uiState.selectedSlotIndex = null;
    refreshUI();
    return;
  }

  if (hit.kind === 'slot') {
    uiState.selectedBridgeId = null;
    uiState.selectedIslandId = hit.islandId;
    uiState.selectedSlotIndex = hit.slotIndex;
    refreshUI();
    return;
  }

  if (hit.kind === 'island') {
    uiState.selectedBridgeId = null;
    uiState.selectedIslandId = hit.islandId;
    const isl = sim.getIsland(hit.islandId);
    const emptySlot = isl ? isl.slots.find((s) => s.buildingId === null) : null;
    uiState.selectedSlotIndex = emptySlot ? emptySlot.index : 0;
    refreshUI();
  }
}

function updateIslandHighlights() {
  const map = uiState.islandHighlight;
  map.clear();

  if (sim.state !== 'play') return;

  if (uiState.mode === 'bridge' || uiState.mode === 'highBridge' || uiState.mode === 'route') {
    if (uiState.originIslandId === null) {
      return;
    }
    const origin = sim.getIsland(uiState.originIslandId);
    map.set(uiState.originIslandId, 'selected');

    for (const isl of sim.islands) {
      if (isl.id === uiState.originIslandId) continue;
      if (sim.hasDirectConnection(origin.id, isl.id)) continue;

      if (uiState.mode === 'route') {
        const blockedByBridge = sim.bridges.some(
          (br) =>
            !br.high &&
            segmentsIntersect2D(
              origin,
              isl,
              sim.getIsland(br.islandA),
              sim.getIsland(br.islandB)
            )
        );
        map.set(isl.id, blockedByBridge ? 'blocked' : 'candidate');
      } else {
        const dist = distance2D(origin, isl);
        if (dist > BRIDGE_MAX_DIST) {
          map.set(isl.id, 'tooFar');
          continue;
        }
        const isHigh = uiState.mode === 'highBridge';
        const blockedByRoute =
          !isHigh &&
          sim.routes.some((rt) =>
            segmentsIntersect2D(
              origin,
              isl,
              sim.getIsland(rt.islandA),
              sim.getIsland(rt.islandB)
            )
          );
        map.set(isl.id, blockedByRoute ? 'blocked' : 'candidate');
      }
    }
  } else if (uiState.selectedIslandId !== null) {
    map.set(uiState.selectedIslandId, 'selected');
  }
}

function getTappableBounds() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  let top = 0;
  let bottom = h;
  if (!hudTop.classList.contains('hidden')) {
    const r = hudTop.getBoundingClientRect();
    if (r.height > 0) top = Math.max(top, r.bottom);
  }
  if (!hudBottom.classList.contains('hidden')) {
    const r = hudBottom.getBoundingClientRect();
    if (r.height > 0) bottom = Math.min(bottom, r.top);
  }
  return { w, h, top, bottom };
}

function isPointInTappableBounds(pt, bounds) {
  return (
    pt.inFront &&
    pt.x >= 0 &&
    pt.x <= bounds.w &&
    pt.y >= bounds.top &&
    pt.y <= bounds.bottom
  );
}

const DIRECTION_ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];

function renderModeBadges() {
  modeBadgesLayer.innerHTML = '';
  if (
    sim.state !== 'play' ||
    uiState.originIslandId === null ||
    (uiState.mode !== 'bridge' && uiState.mode !== 'highBridge' && uiState.mode !== 'route')
  ) {
    return;
  }

  const bounds = getTappableBounds();
  const placedEdgeBadges = [];

  for (const [islandId, status] of uiState.islandHighlight.entries()) {
    const isl = sim.getIsland(islandId);
    if (!isl) continue;

    if (status === 'blocked' || status === 'tooFar') {
      const pt = scene3d.projectToScreen(isl.x, isl.y + 1.2, isl.z);
      if (!isPointInTappableBounds(pt, bounds)) continue;
      const badge = document.createElement('div');
      badge.className = 'mode-badge';
      badge.textContent = status === 'blocked' ? '✕ ふさがれ' : '✕ 遠い';
      badge.style.left = `${pt.x}px`;
      badge.style.top = `${pt.y}px`;
      modeBadgesLayer.appendChild(badge);
      continue;
    }

    if (status === 'candidate') {
      const pt = scene3d.projectToScreen(isl.x, isl.y + 0.3, isl.z);
      if (isPointInTappableBounds(pt, bounds)) continue;

      const cx = bounds.w * 0.5;
      const cy = (bounds.top + bounds.bottom) * 0.5;
      const minX = 54;
      const maxX = Math.max(minX, bounds.w - 54);
      const minY = bounds.top + 18;
      const maxY = Math.max(minY, bounds.bottom - 18);
      const dx = pt.dirX;
      const dy = pt.dirY;
      const tx = Math.abs(dx) > 1e-4 ? (dx > 0 ? (maxX - cx) / dx : (minX - cx) / dx) : Infinity;
      const ty = Math.abs(dy) > 1e-4 ? (dy > 0 ? (maxY - cy) / dy : (minY - cy) / dy) : Infinity;
      const t = Math.min(tx, ty);
      const ex = cx + dx * t;
      let ey = cy + dy * t;

      for (let attempt = 0; attempt < 4; attempt++) {
        const clash = placedEdgeBadges.some(
          (p) => Math.abs(p.x - ex) < 96 && Math.abs(p.y - ey) < 26
        );
        if (!clash) break;
        ey = ey + 26 <= maxY ? ey + 26 : Math.max(minY, ey - 26);
      }
      placedEdgeBadges.push({ x: ex, y: ey });

      const sector = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
      const arrow = DIRECTION_ARROWS[sector];
      const badge = document.createElement('div');
      badge.className = 'mode-badge candidate-edge';
      badge.textContent = `${arrow} ${isl.name}`;
      badge.style.left = `${ex}px`;
      badge.style.top = `${ey}px`;
      modeBadgesLayer.appendChild(badge);
    }
  }
}

function refreshScreens() {
  const st = sim.state;
  screenTitle.classList.toggle('hidden', st !== 'title');
  screenPause.classList.toggle('hidden', st !== 'paused');
  screenResult.classList.toggle('hidden', st !== 'result');

  const showTopHud = st === 'play' || st === 'paused' || st === 'dawn';
  hudTop.classList.toggle('hidden', !showTopHud);
  btnPause.classList.toggle('hidden', st === 'dawn');
  hudBottom.classList.toggle('hidden', st !== 'play');
  if (st !== 'play') {
    selectionBanner.classList.add('hidden');
  }

  if (st === 'title') {
    const best = loadBestScore();
    titleBestScore.textContent = best > 0 ? `ベストスコア: ${best}` : 'ベストスコア: ---';
  }
}

function refreshUI() {
  refreshScreens();
  updateIslandHighlights();

  const totalLight = Math.round(sim.getTotalLight());
  const walletInt = Math.floor(sim.walletLight);
  const islandsInt = Math.round(sim.getIslandsLightSum());
  const connectedCount = sim.getConnectedCount();

  hudTotalLight.textContent = String(totalLight);
  hudLightBreakdown.textContent = `所持 ${walletInt} / 島 ${islandsInt}`;
  hudTimeLeft.textContent =
    sim.state === 'dawn' || sim.dawnActive
      ? '夜明け…'
      : `夜明けまで ${formatTime(sim.timeLeft)}`;
  hudTimeLeft.classList.toggle('timer-urgent', sim.state === 'play' && sim.timeLeft <= 30);
  hudConnectedCount.textContent = String(connectedCount);
  hudTotalIslands.textContent = String(sim.islands.length);

  if (sim.speed !== 1) {
    hudSpeedBadge.textContent = `${sim.speed}倍速`;
    hudSpeedBadge.classList.remove('hidden');
  } else {
    hudSpeedBadge.classList.add('hidden');
  }

  if (sim.state !== 'play') {
    modeBadgesLayer.innerHTML = '';
    return;
  }

  const isBuild = uiState.mode === 'build';
  panelBuild.classList.toggle('hidden', !isBuild);
  panelAction.classList.toggle('hidden', isBuild);

  if (isBuild) {
    const isl =
      uiState.selectedIslandId !== null ? sim.getIsland(uiState.selectedIslandId) : null;
    const slotOccupied =
      isl && uiState.selectedSlotIndex !== null
        ? isl.slots[uiState.selectedSlotIndex]?.buildingId !== null
        : false;

    if (!isl) {
      buildHint.textContent = 'つながった島のスロットをタップして建物を選ぼう';
    } else if (!isl.connected) {
      buildHint.textContent = `${isl.name}はまだ未接続です（橋か航路でつないでね）`;
    } else if (slotOccupied) {
      buildHint.textContent = 'このスロットには建物があります（別の空きスロットを選択）';
    } else {
      const remoteTag = isl.remote ? `・遠島ボーナス×${REMOTE_ISLAND_MULT}` : '';
      buildHint.textContent = `${isl.name} #${uiState.selectedSlotIndex + 1} に建てる${remoteTag}`;
    }

    for (const card of buildCards) {
      const def = BUILDING_DEFS[card.dataset.type];
      const canBuildHere =
        isl &&
        isl.connected &&
        uiState.selectedSlotIndex !== null &&
        !slotOccupied &&
        sim.walletLight >= def.cost;
      card.disabled = !canBuildHere;
    }
  } else {
    selectedBridgeActions.classList.add('hidden');
    if (uiState.mode === 'bridge') {
      actionTitle.textContent = `橋を架ける（灯り${BRIDGE_COST} / ${BRIDGE_TIME}秒）`;
      actionDesc.textContent =
        uiState.originIslandId === null
          ? 'つながっている島をタップ → 光る近くの島をタップして接続'
          : '光っている候補の島をタップして橋を架けます';
    } else if (uiState.mode === 'highBridge') {
      actionTitle.textContent = `高い橋を架ける（灯り${HIGH_BRIDGE_COST} / ${HIGH_BRIDGE_TIME}秒）`;
      actionDesc.textContent =
        uiState.originIslandId === null
          ? '船が下をくぐれる高い橋を架けます（つながっている島から選択）'
          : '光っている候補の島をタップして高い橋を架けます';
    } else if (uiState.mode === 'route') {
      actionTitle.textContent = `船の航路を引く（灯り${ROUTE_COST}）`;
      actionDesc.textContent =
        uiState.originIslandId === null
          ? 'つながっている島から遠くの島へ航路を引きます（通常の橋と交差不可）'
          : '青く光る島をタップして航路を開きます（赤は橋が邪魔で不可）';
    } else if (uiState.mode === 'remove') {
      actionTitle.textContent = `橋を撤去する（灯り${REMOVE_BRIDGE_COST}）`;
      actionDesc.textContent = uiState.selectedBridgeId
        ? '下のボタンで選択中の橋を撤去します'
        : '撤去したい橋をタップして選択してください';
    }
  }

  if ((isBuild || uiState.mode === 'remove') && uiState.selectedBridgeId) {
    selectedBridgeActions.classList.remove('hidden');
    panelBuild.classList.add('hidden');
    panelAction.classList.remove('hidden');
    actionTitle.textContent = '選択中の橋';
    actionDesc.textContent = '航路を通したい時は、この橋を撤去して高い橋に架け替えられます。';
    btnRemoveSelectedBridge.disabled = sim.walletLight < REMOVE_BRIDGE_COST;
  }

  // Selection banner positioned cleanly above #hud-bottom (no overlap)
  let bannerMsg = '';
  if (uiState.selectedBridgeId) {
    const br = sim.bridges.find((b) => b.id === uiState.selectedBridgeId);
    if (br) {
      const a = sim.getIsland(br.islandA);
      const b = sim.getIsland(br.islandB);
      bannerMsg = `${br.high ? '高い橋' : '橋'}: ${a.name} ↔ ${b.name}`;
    }
  } else if (uiState.originIslandId !== null) {
    const orig = sim.getIsland(uiState.originIslandId);
    bannerMsg = `出発島: ${orig.name} → 接続先の島をタップ`;
  } else if (uiState.selectedIslandId !== null) {
    const isl = sim.getIsland(uiState.selectedIslandId);
    if (isl) {
      const lightStr = isl.connected ? `灯り ${Math.round(isl.light)}` : '未接続';
      if (uiState.selectedSlotIndex !== null && isBuild) {
        const b = sim.getBuildingAt(isl.id, uiState.selectedSlotIndex);
        const slotInfo = b
          ? `${BUILDING_DEFS[b.type].name}${b.built ? '' : '（建築中）'}`
          : `空きスロット#${uiState.selectedSlotIndex + 1}`;
        bannerMsg = `${isl.name}（${lightStr}）・${slotInfo}`;
      } else {
        bannerMsg = `${isl.name}（${lightStr}）`;
      }
    }
  }

  if (bannerMsg) {
    selectionText.textContent = bannerMsg;
    selectionBanner.classList.remove('hidden');
    const bottomH = hudBottom.offsetHeight || 168;
    selectionBanner.style.bottom = `${bottomH + 10}px`;
  } else {
    selectionBanner.classList.add('hidden');
  }
  renderModeBadges();
}

function handleEvents() {
  const events = sim.consumeEvents();
  for (const ev of events) {
    if (ev.type === 'buildingCompleted') {
      const slot = ev.island.slots[ev.building.slotIndex];
      spawnWorldPopup(
        ev.island.x + slot.localX,
        ev.island.y + 1.6,
        ev.island.z + slot.localZ,
        `${BUILDING_DEFS[ev.building.type].name} 完成！`
      );
    } else if (ev.type === 'comboPopup') {
      const isl = sim.getIsland(ev.islandId);
      const slot = isl.slots[ev.slotIndex];
      spawnWorldPopup(
        isl.x + slot.localX,
        isl.y + 2.0,
        isl.z + slot.localZ,
        ev.text,
        'amber'
      );
    } else if (ev.type === 'bridgeCompleted') {
      const r = ev.recipient;
      spawnWorldPopup(r.x, r.y + 1.9, r.z, `橋開通！ ${r.name} +${ev.bonus}`, 'cyan');
    } else if (ev.type === 'shipArrived') {
      const isl = ev.island;
      const wStr = ev.walletGain > 0 ? ` / 所持+${ev.walletGain}` : '';
      if (ev.firstArrival) {
        spawnWorldPopup(
          isl.x,
          isl.y + 2.1,
          isl.z,
          `航路開通！ ${isl.name} 島+${ev.islandGain}${wStr}`,
          'cyan'
        );
      } else {
        const note = ev.cargoNote ? `（${ev.cargoNote}）` : '';
        spawnWorldPopup(
          isl.x,
          isl.y + 1.8,
          isl.z,
          `船到着${note} 島+${ev.islandGain}${wStr}`,
          'cyan'
        );
      }
    } else if (ev.type === 'dawnStarted') {
      showToast(ev.reason, 'good');
    } else if (ev.type === 'gameEnded') {
      showResultScreen();
    }
  }
}

function showResultScreen() {
  const islandsSum = Math.round(sim.getIslandsLightSum());
  const walletSum = Math.round(sim.walletLight);
  const connectedCount = sim.getConnectedCount();
  const best = saveBestScore(sim.score);

  resultReason.textContent = sim.dawnReason || '夜明けが訪れました';
  resultScore.textContent = String(sim.score);
  resultBest.textContent = `ベスト: ${best}`;
  rbIslandsLight.textContent = String(islandsSum);
  rbWalletLight.textContent = String(walletSum);
  rbConnected.textContent = `${connectedCount} / ${sim.islands.length}`;
  rbTimeBonus.textContent = `+${sim.allConnectedBonus}`;
  refreshScreens();
}

function startNewGame() {
  sim.startGame();
  scene3d.buildIslands(sim.islands);
  scene3d.resetCameraForNewGame();
  uiState.mode = 'build';
  uiState.selectedIslandId = 0;
  uiState.selectedSlotIndex = 0;
  uiState.originIslandId = null;
  uiState.selectedBridgeId = null;
  for (const tab of modeTabs) {
    tab.classList.toggle('active', tab.dataset.mode === 'build');
  }
  refreshUI();
  return { ok: true };
}

// Button bindings
document.getElementById('btn-start').addEventListener('click', () => {
  startNewGame();
});

document.getElementById('btn-retry').addEventListener('click', () => {
  startNewGame();
});

document.getElementById('btn-howto-title').addEventListener('click', () => {
  uiState.howtoReturnTo = 'title';
  screenHowto.classList.remove('hidden');
});

document.getElementById('btn-howto-pause').addEventListener('click', () => {
  uiState.howtoReturnTo = 'pause';
  screenHowto.classList.remove('hidden');
});

document.getElementById('btn-howto-close').addEventListener('click', () => {
  screenHowto.classList.add('hidden');
});

btnPause.addEventListener('click', () => {
  sim.pause();
  refreshUI();
});

document.getElementById('btn-resume').addEventListener('click', () => {
  sim.resume();
  refreshUI();
});

document.getElementById('btn-restart-pause').addEventListener('click', () => {
  startNewGame();
});

btnCancelSelection.addEventListener('click', () => {
  clearSelection();
  refreshUI();
});

for (const tab of modeTabs) {
  tab.addEventListener('click', () => {
    setMode(tab.dataset.mode);
  });
}

for (const card of buildCards) {
  card.addEventListener('click', () => {
    if (uiState.selectedIslandId === null || uiState.selectedSlotIndex === null) {
      showToast('先に島のスロットをタップしてください', 'warn');
      return;
    }
    const res = sim.placeBuilding(
      uiState.selectedIslandId,
      card.dataset.type,
      uiState.selectedSlotIndex
    );
    if (res.ok) {
      const def = BUILDING_DEFS[card.dataset.type];
      showToast(`${def.name}の建築を始めました（${def.buildTime}秒）`, 'normal');
      const isl = sim.getIsland(uiState.selectedIslandId);
      const nextEmpty = isl ? isl.slots.find((s) => s.buildingId === null) : null;
      uiState.selectedSlotIndex = nextEmpty ? nextEmpty.index : null;
    } else {
      showToast(res.reason, 'warn');
    }
    refreshUI();
  });
}

btnRemoveSelectedBridge.addEventListener('click', () => {
  if (!uiState.selectedBridgeId) return;
  const res = sim.removeBridge(uiState.selectedBridgeId);
  if (res.ok) {
    showToast('橋を撤去しました', 'normal');
    uiState.selectedBridgeId = null;
  } else {
    showToast(res.reason, 'warn');
  }
  refreshUI();
});

// Expose window.__game test hook
const gameHook = {};
Object.defineProperties(gameHook, {
  state: { get: () => sim.state, enumerable: true },
  timeLeft: { get: () => sim.timeLeft, enumerable: true },
  light: { get: () => sim.getTotalLight(), enumerable: true },
  walletLight: { get: () => sim.walletLight, enumerable: true },
  islandsLight: { get: () => sim.getIslandsLightSum(), enumerable: true },
  islands: { get: () => sim.islands, enumerable: true },
  bridges: { get: () => sim.bridges, enumerable: true },
  routes: { get: () => sim.routes, enumerable: true },
  ships: { get: () => sim.ships, enumerable: true },
  buildings: { get: () => sim.buildings, enumerable: true },
  score: { get: () => sim.score, enumerable: true },
  speed: { get: () => sim.speed, enumerable: true },
});

gameHook.api = {
  placeBuilding(islandId, type, slotIndex) {
    const res = sim.placeBuilding(islandId, type, slotIndex);
    refreshUI();
    return res;
  },
  buildBridge(islandA, islandB, high = false) {
    const res = sim.buildBridge(islandA, islandB, Boolean(high));
    refreshUI();
    return res;
  },
  removeBridge(bridgeId) {
    const res = sim.removeBridge(bridgeId);
    refreshUI();
    return res;
  },
  buildRoute(islandA, islandB) {
    const res = sim.buildRoute(islandA, islandB);
    refreshUI();
    return res;
  },
  startGame() {
    return startNewGame();
  },
  setSpeed(n) {
    const res = sim.setSpeed(n);
    refreshUI();
    return res;
  },
  screenPos(islandId, slotIndex) {
    const isl = sim.getIsland(islandId);
    if (!isl) return { x: 0, y: 0, visible: false };
    const bounds = getTappableBounds();
    let pt;
    if (slotIndex !== undefined && slotIndex !== null) {
      const slot = isl.slots[Number(slotIndex)];
      if (!slot) return { x: 0, y: 0, visible: false };
      pt = scene3d.projectToScreen(isl.x + slot.localX, isl.y + 0.35, isl.z + slot.localZ);
    } else {
      pt = scene3d.projectToScreen(isl.x, isl.y + 0.3, isl.z);
    }
    return {
      x: Math.round(pt.x * 10) / 10,
      y: Math.round(pt.y * 10) / 10,
      visible: isPointInTappableBounds(pt, bounds),
    };
  },
  focusIsland(islandId) {
    const isl = sim.getIsland(islandId);
    if (!isl) return { ok: false, reason: '島が見つかりません' };
    scene3d.focusOn(isl.x, isl.y, isl.z, 20);
    return { ok: true };
  },
};

window.__game = gameHook;

// Main Animation Loop
let lastPerf = performance.now();
let uiSyncAcc = 0;

function tick(now) {
  requestAnimationFrame(tick);
  const rawDt = Math.min(0.1, (now - lastPerf) / 1000);
  lastPerf = now;

  if (sim.state === 'title') {
    scene3d.orbit.targetTheta += rawDt * 0.08;
  } else if (sim.state === 'play' || sim.state === 'dawn') {
    sim.step(rawDt);
    handleEvents();
    uiSyncAcc += rawDt;
    if (uiSyncAcc >= 0.12 || (sim.state !== 'play' && sim.state !== 'dawn')) {
      uiSyncAcc = 0;
      refreshUI();
    }
  }

  scene3d.syncAndRender(sim, uiState, now / 1000);
  renderModeBadges();
}

refreshUI();
requestAnimationFrame(tick);
