import {
  BRIDGE_COST,
  BRIDGE_MAX_DIST,
  BRIDGE_TIME,
  BUILDING_DEFS,
  GameSimulation,
  HALF_ROUTE_COST,
  HIGH_BRIDGE_COST,
  HIGH_BRIDGE_TIME,
  ISLAND_TRAITS,
  REMOTE_ISLAND_MULT,
  REMOVE_BRIDGE_COST,
  ROUTE_COST,
  distance2D,
  getTodaySeedString,
  segmentsIntersect2D,
} from './gameLogic.js';
import { Scene3D } from './scene3d.js';

const BEST_SCORE_PREFIX = 'ukishima_best_';
const GUIDE_DISMISSED_KEY = 'ukishima_guide_dismissed';

function formatIslandName(isl) {
  if (!isl) return '';
  const tr = isl.trait ? ISLAND_TRAITS[isl.trait] : null;
  return tr ? `${isl.name}${tr.icon}` : isl.name;
}

function getChartStorageKey(chartMode, seed) {
  if (chartMode === 'daily') {
    return `${BEST_SCORE_PREFIX}${seed || getTodaySeedString()}`;
  }
  return `${BEST_SCORE_PREFIX}random_${seed || 'latest'}`;
}

function loadBestScore(chartMode, seed) {
  try {
    const key = getChartStorageKey(chartMode, seed);
    const val = Number(localStorage.getItem(key) || 0);
    return Number.isFinite(val) ? val : 0;
  } catch {
    return 0;
  }
}

function saveBestScore(score, chartMode, seed) {
  try {
    const key = getChartStorageKey(chartMode, seed);
    const prev = loadBestScore(chartMode, seed);
    const next = Math.max(prev, score);
    localStorage.setItem(key, String(next));
    if (chartMode === 'random') {
      const prevLatest = loadBestScore('random', 'latest');
      const nextLatest = Math.max(prevLatest, next);
      localStorage.setItem(getChartStorageKey('random', 'latest'), String(nextLatest));
      return nextLatest;
    }
    return next;
  } catch {
    return score;
  }
}

function loadGuideDismissed() {
  try {
    return localStorage.getItem(GUIDE_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function saveGuideDismissed(val) {
  try {
    if (val) localStorage.setItem(GUIDE_DISMISSED_KEY, '1');
    else localStorage.removeItem(GUIDE_DISMISSED_KEY);
  } catch {
    // ignore storage errors
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
const btnConstellation = document.getElementById('btn-constellation');
const constellationHudName = document.getElementById('constellation-hud-name');
const eventBanner = document.getElementById('event-banner');
const btnFastForward = document.getElementById('btn-fast-forward');
const btnPause = document.getElementById('btn-pause');
const btnGuideHelp = document.getElementById('btn-guide-help');

const guideBubble = document.getElementById('guide-bubble');
const guideStep1El = document.getElementById('guide-step-1');
const guideStep2El = document.getElementById('guide-step-2');
const guideStep3El = document.getElementById('guide-step-3');
const guideTimerNote = document.getElementById('guide-timer-note');
const btnGuideClose = document.getElementById('btn-guide-close');
const btnGuideDismiss = document.getElementById('btn-guide-dismiss');

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
const btnChartDaily = document.getElementById('btn-chart-daily');
const btnChartRandom = document.getElementById('btn-chart-random');
const titleChartNote = document.getElementById('title-chart-note');
const resultChartLabel = document.getElementById('result-chart-label');
const resultReason = document.getElementById('result-reason');
const resultScore = document.getElementById('result-score');
const resultBest = document.getElementById('result-best');
const resultMapCanvas = document.getElementById('result-map-canvas');
const rbIslandsLight = document.getElementById('rb-islands-light');
const rbWalletLight = document.getElementById('rb-wallet-light');
const rbConnected = document.getElementById('rb-connected');
const rbTimeBonus = document.getElementById('rb-time-bonus');
const rbLoopBonus = document.getElementById('rb-loop-bonus');
const rbConstellationBonus = document.getElementById('rb-constellation-bonus');

// Simulation & Scene
const urlParams = new URLSearchParams(window.location.search);
const isFastMode = urlParams.get('fast') === '1';
const isBotMode = urlParams.get('bot') === '1';
const urlSeed = urlParams.get('seed');
const initialSpeed = isFastMode ? 10 : 1;
const initialSeed = urlSeed || getTodaySeedString();
const sim = new GameSimulation(initialSpeed, { seed: initialSeed });

const guideState = {
  visible: false,
  dismissed: loadGuideDismissed(),
  step1Done: false,
  step2Done: false,
  step3Done: false,
  completedNotified: false,
};

const dawnExtinguishedIds = new Set();
const flyOrbs = [];
let hudBounceTimeout = null;
let resultCountAnimId = null;
let guideHideTimer = null;

function bounceHudLight() {
  hudTotalLight.classList.remove('hud-bounce');
  // Force reflow so rapid consecutive arrivals restart the bounce
  void hudTotalLight.offsetWidth;
  hudTotalLight.classList.add('hud-bounce');
  clearTimeout(hudBounceTimeout);
  hudBounceTimeout = setTimeout(() => {
    hudTotalLight.classList.remove('hud-bounce');
  }, 300);
}

function spawnFlyOrbs(worldX, worldY, worldZ, count = 3, tone = 'amber') {
  if (sim.state === 'dawn' || sim.state === 'result') return;
  const pt = scene3d.projectToScreen(worldX, worldY, worldZ);
  if (!pt.inFront) return;
  const maxOrbs = scene3d.quality === 'low' ? 6 : 18;
  const actualCount = scene3d.quality === 'low' ? 1 : count;
  const targetRect = hudTotalLight.getBoundingClientRect();
  const tx = targetRect.width > 0 ? targetRect.left + targetRect.width * 0.5 : 70;
  const ty = targetRect.height > 0 ? targetRect.top + targetRect.height * 0.5 : 42;

  for (let i = 0; i < actualCount; i++) {
    if (flyOrbs.length >= maxOrbs) break;
    const el = document.createElement('div');
    el.className = `fly-orb ${tone === 'cyan' ? 'cyan' : ''}`;
    popupsLayer.appendChild(el);
    const sx = pt.x + (Math.random() - 0.5) * 18;
    const sy = pt.y + (Math.random() - 0.5) * 14;
    const arcX = (sx + tx) * 0.5 + (Math.random() - 0.5) * 70;
    const arcY = Math.min(sy, ty) - 24 - Math.random() * 40;
    flyOrbs.push({
      el,
      sx,
      sy,
      tx,
      ty,
      arcX,
      arcY,
      elapsed: -i * 0.06,
      duration: 0.52 + Math.random() * 0.14,
    });
  }
}

function updateFlyOrbs(rawDt) {
  for (let i = flyOrbs.length - 1; i >= 0; i--) {
    const o = flyOrbs[i];
    o.elapsed += rawDt;
    if (o.elapsed < 0) {
      o.el.style.opacity = '0';
      continue;
    }
    const t = Math.min(1, o.elapsed / o.duration);
    const inv = 1 - t;
    const x = inv * inv * o.sx + 2 * inv * t * o.arcX + t * t * o.tx;
    const y = inv * inv * o.sy + 2 * inv * t * o.arcY + t * t * o.ty;
    o.el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${1.05 - t * 0.35})`;
    o.el.style.opacity = t > 0.85 ? String((1 - t) / 0.15) : '1';
    if (t >= 1) {
      o.el.remove();
      flyOrbs.splice(i, 1);
      bounceHudLight();
    }
  }
}

const uiState = {
  mode: 'build', // 'build' | 'bridge' | 'highBridge' | 'route' | 'remove'
  selectedIslandId: 0,
  selectedSlotIndex: 0,
  originIslandId: null,
  pendingBridgeTargetId: null,
  pendingBlockedRoutes: [],
  selectedBridgeId: null,
  howtoReturnTo: 'title',
  chartMode: urlSeed ? 'random' : 'daily',
  activeSeed: initialSeed,
  lastDescribedIslandId: null,
  constellationHighlight: false,
  fastForward: false,
  islandHighlight: new Map(),
};

const scene3d = new Scene3D(canvasWrap, handleWorldTap);
scene3d.buildIslands(sim.islands);

function syncToastContainerPosition() {
  let hudBottomY = 104;
  if (!hudTop.classList.contains('hidden')) {
    const hr = hudTop.getBoundingClientRect();
    if (hr.height > 0) {
      hudBottomY = Math.round(hr.bottom);
    }
  }
  if (!guideBubble.classList.contains('hidden')) {
    guideBubble.style.top = `${hudBottomY + 8}px`;
    const r = guideBubble.getBoundingClientRect();
    if (r.height > 0) {
      toastContainer.style.top = `${Math.round(r.bottom + 8)}px`;
      return;
    }
  }
  toastContainer.style.top = `${hudBottomY + 8}px`;
}

function clearToasts() {
  for (const el of toastContainer.children) {
    if (el._removeTimer) clearTimeout(el._removeTimer);
  }
  toastContainer.innerHTML = '';
}

function clearPopups() {
  for (const entry of activePopups) {
    if (entry?.el) entry.el.remove();
  }
  activePopups.length = 0;
  for (const el of popupsLayer.querySelectorAll('.float-popup')) {
    el.remove();
  }
}

function showToast(text, kind = 'normal', options = null) {
  const isDawnToast = Boolean(options?.dawn);
  if ((sim.state === 'dawn' || sim.state === 'result') && !isDawnToast) {
    return;
  }
  syncToastContainerPosition();
  if (isDawnToast) {
    clearToasts();
    const el = document.createElement('div');
    el.className = 'toast good toast-dawn';
    el.dataset.toastText = text;
    el.textContent = text;
    toastContainer.appendChild(el);
    return;
  }

  const cls = `toast ${kind === 'warn' ? 'warn' : kind === 'good' ? 'good' : ''}`.trim();
  for (const existing of toastContainer.children) {
    if (existing.dataset.toastText === text) {
      existing.className = cls;
      existing.style.animation = 'none';
      void existing.offsetWidth;
      existing.style.animation = '';
      clearTimeout(existing._removeTimer);
      existing._removeTimer = setTimeout(() => {
        existing.remove();
      }, 2600);
      return;
    }
  }

  const el = document.createElement('div');
  el.className = cls;
  el.dataset.toastText = text;
  el.textContent = text;
  toastContainer.appendChild(el);
  while (toastContainer.children.length > 3) {
    const oldest = toastContainer.firstChild;
    if (oldest) clearTimeout(oldest._removeTimer);
    toastContainer.removeChild(oldest);
  }
  el._removeTimer = setTimeout(() => {
    el.remove();
  }, 2600);
}

const activePopups = [];

function spawnWorldPopup(worldX, worldY, worldZ, text, tone = 'amber') {
  if (sim.state === 'dawn' || sim.state === 'result') return;
  const pt = scene3d.projectToScreen(worldX, worldY, worldZ);
  if (!pt.visible) return;

  const now = performance.now();
  // Clean stale entries whose DOM fade has completed
  for (let i = activePopups.length - 1; i >= 0; i--) {
    if (now - activePopups[i].createdAt > 2000 || !activePopups[i].el.isConnected) {
      activePopups.splice(i, 1);
    }
  }

  // 同時に表示するワールドポップアップは最大3つまで（古いものから消す）
  while (activePopups.length >= 3) {
    const oldest = activePopups.shift();
    if (oldest?.el) oldest.el.remove();
  }
  const existingDomPopups = popupsLayer.querySelectorAll('.float-popup');
  for (let i = 0; i <= existingDomPopups.length - 3; i++) {
    existingDomPopups[i].remove();
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

  const entry = { x, y, createdAt: now, el };
  activePopups.push(entry);
  while (activePopups.length > 3) {
    const oldest = activePopups.shift();
    if (oldest?.el) oldest.el.remove();
  }

  setTimeout(() => {
    const idx = activePopups.indexOf(entry);
    if (idx !== -1) activePopups.splice(idx, 1);
    el.remove();
  }, 2000);
}

function clearSelection() {
  uiState.selectedIslandId = null;
  uiState.selectedSlotIndex = null;
  uiState.originIslandId = null;
  uiState.pendingBridgeTargetId = null;
  uiState.pendingBlockedRoutes = [];
  uiState.selectedBridgeId = null;
}

function setMode(mode) {
  uiState.mode = mode;
  uiState.originIslandId = null;
  uiState.pendingBridgeTargetId = null;
  uiState.pendingBlockedRoutes = [];
  uiState.selectedBridgeId = null;
  if (mode !== 'build') {
    uiState.selectedSlotIndex = null;
  }
  for (const tab of modeTabs) {
    tab.classList.toggle('active', tab.dataset.mode === mode);
  }
  refreshUI();
}

function maybeNotifyIslandTrait(isl) {
  if (!isl || !isl.trait || uiState.lastDescribedIslandId === isl.id) return;
  const tr = ISLAND_TRAITS[isl.trait];
  if (!tr) return;
  uiState.lastDescribedIslandId = isl.id;
  showToast(`${tr.icon} ${isl.name}（${tr.name}）: ${tr.desc}`, 'normal');
}

function handleWorldTap(hit) {
  if (sim.state !== 'play') return;

  if (hit && hit.kind === 'meteor') {
    const res = sim.catchMeteor();
    if (res.ok) {
      refreshUI();
    }
    return;
  }

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
        maybeNotifyIslandTrait(isl);
        showToast('つながっている島を先に選んでください', 'warn');
        return;
      }
      uiState.originIslandId = islandId;
      uiState.selectedIslandId = islandId;
      uiState.pendingBridgeTargetId = null;
      uiState.pendingBlockedRoutes = [];
      maybeNotifyIslandTrait(isl);
      refreshUI();
      return;
    }

    if (uiState.originIslandId === islandId) {
      uiState.originIslandId = null;
      uiState.selectedIslandId = null;
      uiState.pendingBridgeTargetId = null;
      uiState.pendingBlockedRoutes = [];
      refreshUI();
      return;
    }

    if (uiState.mode === 'bridge' || uiState.mode === 'highBridge') {
      const isHigh = uiState.mode === 'highBridge';
      if (uiState.pendingBridgeTargetId !== islandId) {
        const check = sim.canBuildBridge(uiState.originIslandId, islandId, isHigh);
        if (!check.ok) {
          maybeNotifyIslandTrait(isl);
          showToast(check.reason, 'warn');
          uiState.pendingBridgeTargetId = null;
          uiState.pendingBlockedRoutes = [];
          refreshUI();
          return;
        }
        uiState.pendingBridgeTargetId = islandId;
        uiState.pendingBlockedRoutes = sim.getFutureBlockedRoutes(
          uiState.originIslandId,
          islandId,
          isHigh
        );
        if (uiState.pendingBlockedRoutes.length > 0) {
          const names = uiState.pendingBlockedRoutes
            .map((b) => b.toIsland.name)
            .join('・');
          showToast(`この橋で ${names} への航路がふさがります（再タップで確定）`, 'warn');
        } else {
          const tr = isl.trait ? ISLAND_TRAITS[isl.trait] : null;
          const trNote = tr ? ` [${tr.icon}${tr.name}: ${tr.desc}]` : '';
          showToast(`もう1回 ${isl.name} をタップで確定${trNote}`, 'normal');
        }
        refreshUI();
        return;
      }
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
      uiState.pendingBridgeTargetId = null;
      uiState.pendingBlockedRoutes = [];
    } else {
      maybeNotifyIslandTrait(isl);
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
    maybeNotifyIslandTrait(sim.getIsland(hit.islandId));
    refreshUI();
    return;
  }

  if (hit.kind === 'island') {
    uiState.selectedBridgeId = null;
    uiState.selectedIslandId = hit.islandId;
    const isl = sim.getIsland(hit.islandId);
    const emptySlot = isl ? isl.slots.find((s) => s.buildingId === null) : null;
    uiState.selectedSlotIndex = emptySlot ? emptySlot.index : 0;
    maybeNotifyIslandTrait(isl);
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
        if (
          isl.connected ||
          sim.routes.some((rt) => rt.islandB === isl.id || rt.islandA === isl.id)
        ) {
          continue;
        }
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
        if (origin.trait === 'fog' || isl.trait === 'fog') {
          map.set(isl.id, 'blocked');
          continue;
        }
        if (!isHigh && (origin.trait === 'wind' || isl.trait === 'wind')) {
          map.set(isl.id, 'blocked');
          continue;
        }
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

  if (uiState.constellationHighlight && sim.constellation) {
    for (const cid of sim.constellation.islandIds) {
      if (!map.has(cid)) {
        map.set(cid, 'constellation');
      }
    }
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
  if (selectionBanner && !selectionBanner.classList.contains('hidden')) {
    const sr = selectionBanner.getBoundingClientRect();
    if (sr.height > 0) bottom = Math.min(bottom, sr.top);
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
const blockedBadgePool = new Map();
const edgeBadgePool = new Map();
let edgeSummaryBadge = null;

function clearModeBadgePools() {
  if (edgeSummaryBadge) {
    edgeSummaryBadge.remove();
    edgeSummaryBadge = null;
  }
  if (blockedBadgePool.size === 0 && edgeBadgePool.size === 0) return;
  for (const el of blockedBadgePool.values()) el.remove();
  for (const el of edgeBadgePool.values()) el.remove();
  blockedBadgePool.clear();
  edgeBadgePool.clear();
}

function findNonOverlappingEdgeY(placedBoxes, cx, desiredY, hw, hh, minY, maxY) {
  const offsets = [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150];
  for (const off of offsets) {
    const candY = Math.max(minY, Math.min(maxY, desiredY + off));
    const clash = placedBoxes.some(
      (b) => Math.abs(b.cx - cx) < b.hw + hw + 6 && Math.abs(b.cy - candY) < b.hh + hh + 6
    );
    if (!clash) return candY;
  }
  return desiredY;
}

function renderModeBadges() {
  if (
    sim.state !== 'play' ||
    uiState.originIslandId === null ||
    (uiState.mode !== 'bridge' && uiState.mode !== 'highBridge' && uiState.mode !== 'route')
  ) {
    clearModeBadgePools();
    return;
  }

  const bounds = getTappableBounds();
  const originIsl = sim.getIsland(uiState.originIslandId) || sim.getIsland(0);
  const placedBoxes = [];
  const seenBlocked = new Set();
  const seenEdge = new Set();
  const offscreenCandidates = [];

  for (const [islandId, status] of uiState.islandHighlight.entries()) {
    const isl = sim.getIsland(islandId);
    if (!isl) continue;

    if (status === 'blocked' || status === 'tooFar') {
      const pt = scene3d.projectToScreen(isl.x, isl.y + 1.2, isl.z);
      if (!isPointInTappableBounds(pt, bounds)) continue;
      seenBlocked.add(isl.id);
      let badge = blockedBadgePool.get(isl.id);
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'mode-badge';
        modeBadgesLayer.appendChild(badge);
        blockedBadgePool.set(isl.id, badge);
      }
      let txt = status === 'blocked' ? '✕ ふさがれ' : '✕ 遠い';
      if (status === 'blocked' && (uiState.mode === 'bridge' || uiState.mode === 'highBridge')) {
        if (isl.trait === 'fog' || originIsl?.trait === 'fog') {
          txt = '🌫 航路のみ';
        } else if (uiState.mode === 'bridge' && (isl.trait === 'wind' || originIsl?.trait === 'wind')) {
          txt = '🌀 高い橋のみ';
        }
      }
      if (badge.textContent !== txt) badge.textContent = txt;
      badge.style.left = `${pt.x.toFixed(1)}px`;
      badge.style.top = `${pt.y.toFixed(1)}px`;
      continue;
    }

    if (status === 'candidate') {
      const pt = scene3d.projectToScreen(isl.x, isl.y + 0.3, isl.z);
      if (isPointInTappableBounds(pt, bounds)) continue;
      const dist = originIsl ? distance2D(originIsl, isl) : distance2D({ x: 0, z: 0 }, isl);
      offscreenCandidates.push({ isl, pt, dist });
    }
  }

  offscreenCandidates.sort((a, b) => a.dist - b.dist || a.isl.id - b.isl.id);

  const cx = bounds.w * 0.5;
  const cy = (bounds.top + bounds.bottom) * 0.5;
  const minX = 64;
  const maxX = Math.max(minX, bounds.w - 64);
  const minY = bounds.top + 16;
  const maxY = Math.max(minY, bounds.bottom - 16);

  const sideCounts = { left: 0, right: 0 };
  let shownCount = 0;

  for (const item of offscreenCandidates) {
    if (shownCount >= 4) break;
    const { isl, pt } = item;
    const dx = pt.dirX;
    const dy = pt.dirY;
    const tx = Math.abs(dx) > 1e-4 ? (dx > 0 ? (maxX - cx) / dx : (minX - cx) / dx) : Infinity;
    const ty = Math.abs(dy) > 1e-4 ? (dy > 0 ? (maxY - cy) / dy : (minY - cy) / dy) : Infinity;

    let leftPx;
    let centerX;
    let rawY;
    let edgeClass = '';

    if (tx <= ty) {
      const isLeft = dx < 0;
      leftPx = isLeft ? 8 : bounds.w - 8;
      centerX = isLeft ? 63 : bounds.w - 63;
      edgeClass = isLeft ? 'edge-left' : 'edge-right';
      rawY = Math.max(minY, Math.min(maxY, cy + dy * tx));
    } else {
      const ex = Math.max(minX, Math.min(maxX, cx + dx * ty));
      leftPx = ex;
      centerX = ex;
      rawY = dy < 0 ? minY : maxY;
    }

    const side = edgeClass === 'edge-left' || centerX < bounds.w * 0.5 ? 'left' : 'right';
    if (sideCounts[side] >= 3) continue;
    sideCounts[side] += 1;
    shownCount += 1;

    const hw = 55;
    const hh = 12;
    const ey = findNonOverlappingEdgeY(placedBoxes, centerX, rawY, hw, hh, minY, maxY);
    placedBoxes.push({ cx: centerX, cy: ey, hw, hh });

    seenEdge.add(isl.id);
    const sector = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
    const arrow = DIRECTION_ARROWS[sector];
    const txt = `${arrow} ${formatIslandName(isl)}`;

    let badge = edgeBadgePool.get(isl.id);
    if (!badge) {
      badge = document.createElement('button');
      badge.type = 'button';
      badge.dataset.islandId = String(isl.id);
      badge.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
      });
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        gameHook.api.focusIsland(isl.id);
      });
      modeBadgesLayer.appendChild(badge);
      edgeBadgePool.set(isl.id, badge);
    }

    const cls = `mode-badge candidate-edge${edgeClass ? ' ' + edgeClass : ''}`;
    if (badge.className !== cls) badge.className = cls;
    if (badge.textContent !== txt) badge.textContent = txt;
    badge.style.left = `${leftPx.toFixed(1)}px`;
    badge.style.top = `${ey.toFixed(1)}px`;
  }

  const overflowCount = offscreenCandidates.length - shownCount;
  if (overflowCount > 0) {
    if (!edgeSummaryBadge) {
      edgeSummaryBadge = document.createElement('button');
      edgeSummaryBadge.type = 'button';
      edgeSummaryBadge.id = 'edge-summary-pill';
      edgeSummaryBadge.className = 'mode-badge candidate-edge edge-summary';
      edgeSummaryBadge.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
      });
      edgeSummaryBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        scene3d.zoomOutToFitAll(sim.islands, getTappableBounds());
        renderModeBadges();
      });
      modeBadgesLayer.appendChild(edgeSummaryBadge);
    }
    const sumText = `ほか ${overflowCount} 島`;
    if (edgeSummaryBadge.textContent !== sumText) edgeSummaryBadge.textContent = sumText;
    const sumX = bounds.w * 0.5;
    const sumY = findNonOverlappingEdgeY(
      placedBoxes,
      sumX,
      Math.max(minY, bounds.bottom - 18),
      46,
      12,
      minY,
      maxY
    );
    edgeSummaryBadge.style.left = `${sumX.toFixed(1)}px`;
    edgeSummaryBadge.style.top = `${sumY.toFixed(1)}px`;
  } else if (edgeSummaryBadge) {
    edgeSummaryBadge.remove();
    edgeSummaryBadge = null;
  }

  for (const [id, el] of blockedBadgePool.entries()) {
    if (!seenBlocked.has(id)) {
      el.remove();
      blockedBadgePool.delete(id);
    }
  }
  for (const [id, el] of edgeBadgePool.entries()) {
    if (!seenEdge.has(id)) {
      el.remove();
      edgeBadgePool.delete(id);
    }
  }
}

function updateGuideUI() {
  if (sim.state === 'play') {
    if (
      !guideState.step1Done &&
      sim.buildings.some((b) => b.built && b.type === 'streetlight') &&
      sim.buildings.some((b) => b.built && b.type === 'stall')
    ) {
      guideState.step1Done = true;
    }
    if (!guideState.step2Done && sim.bridges.some((b) => b.built === true)) {
      guideState.step2Done = true;
    }
    if (!guideState.step3Done && sim.routes.some((rt) => rt.established === true)) {
      guideState.step3Done = true;
    }
  }

  const showGuide = sim.state === 'play' && guideState.visible;
  guideBubble.classList.toggle('hidden', !showGuide);
  syncToastContainerPosition();
  if (!showGuide) return;

  const steps = [
    { el: guideStep1El, done: guideState.step1Done, num: '1' },
    { el: guideStep2El, done: guideState.step2Done, num: '2' },
    { el: guideStep3El, done: guideState.step3Done, num: '3' },
  ];
  let foundActive = false;
  for (const s of steps) {
    s.el.classList.toggle('done', s.done);
    const active = !s.done && !foundActive;
    s.el.classList.toggle('active', active);
    if (active) foundActive = true;
    const check = s.el.querySelector('.guide-check');
    if (check) check.textContent = s.done ? '✓' : s.num;
  }

  const timerFrozen = !guideState.step1Done && !isFastMode && !isBotMode;
  guideTimerNote.classList.toggle('hidden', !timerFrozen);

  if (
    guideState.step1Done &&
    guideState.step2Done &&
    guideState.step3Done &&
    !guideState.completedNotified
  ) {
    guideState.completedNotified = true;
    showToast('ガイド完了！夜の街を育てよう', 'good');
    clearTimeout(guideHideTimer);
    guideHideTimer = setTimeout(() => {
      guideState.visible = false;
      guideBubble.classList.add('hidden');
      syncToastContainerPosition();
    }, 1800);
  }
}

function refreshScreens() {
  const st = sim.state;
  screenTitle.classList.toggle('hidden', st !== 'title');
  screenPause.classList.toggle('hidden', st !== 'paused');
  screenResult.classList.toggle('hidden', st !== 'result');

  const showTopHud = st === 'play' || st === 'paused' || st === 'dawn';
  hudTop.classList.toggle('hidden', !showTopHud);
  btnConstellation.classList.toggle('hidden', st !== 'play' || !sim.constellation);
  btnFastForward.classList.toggle('hidden', st !== 'play');
  btnPause.classList.toggle('hidden', st === 'dawn');
  btnGuideHelp.classList.toggle('hidden', st !== 'play');
  hudBottom.classList.toggle('hidden', st !== 'play');
  if (st !== 'play') {
    eventBanner.classList.add('hidden');
    selectionBanner.classList.add('hidden');
    guideBubble.classList.add('hidden');
    syncToastContainerPosition();
  }

  if (st === 'title') {
    const dailySeed = getTodaySeedString();
    const chartSeed = uiState.chartMode === 'daily' ? dailySeed : 'latest';
    const best = loadBestScore(uiState.chartMode, chartSeed);
    titleBestScore.textContent = best > 0 ? `ベストスコア: ${best}` : 'ベストスコア: ---';
    btnChartDaily.classList.toggle('active', uiState.chartMode === 'daily');
    btnChartRandom.classList.toggle('active', uiState.chartMode === 'random');
    titleChartNote.textContent =
      uiState.chartMode === 'daily'
        ? `今日の星図（${dailySeed}）: 毎日同じ配置に挑戦`
        : 'おまかせ: 遊ぶたびに新しい星図を生成';
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
  hudTimeLeft.classList.toggle('timer-climax', sim.state === 'play' && sim.climaxActive && sim.timeLeft > 30);
  hudTimeLeft.classList.toggle('timer-urgent', sim.state === 'play' && sim.timeLeft <= 30);
  hudConnectedCount.textContent = String(connectedCount);
  hudTotalIslands.textContent = String(sim.islands.length);

  if (sim.speed !== 1) {
    hudSpeedBadge.textContent = `${sim.speed}倍速`;
    hudSpeedBadge.classList.remove('hidden');
  } else {
    hudSpeedBadge.classList.add('hidden');
  }
  btnFastForward.classList.toggle('active', Boolean(uiState.fastForward));

  if (sim.state === 'play') {
    const ev = sim.activeEvent;
    let evText = '';
    let evCls = 'hud-event-pill';
    if (ev) {
      const sec = Math.max(1, Math.ceil(ev.timeLeft));
      if (ev.phase === 'warning') {
        if (ev.type === 'meteor') evText = `🌠 ${sec}秒後に流れ星`;
        else if (ev.type === 'nightWind') evText = `🌬 ${sec}秒後に夜風`;
        else if (ev.type === 'fullMoon') evText = `🌕 ${sec}秒後に満月`;
        else if (ev.type === 'strayShip') evText = `⛵ ${sec}秒後に迷い船`;
      } else {
        if (ev.type === 'meteor') {
          evText = `🌠 空をタップ！ (${sec}秒)`;
          evCls += ' active';
        } else if (ev.type === 'nightWind') {
          evText = `🌬 夜風・船半速 ${sec}秒`;
          evCls += ' wind';
        } else if (ev.type === 'fullMoon') {
          evText = `🌕 満月・生産2倍 ${sec}秒`;
          evCls += ' active';
        } else if (ev.type === 'strayShip') {
          const target = sim.getIsland(ev.targetIslandId);
          evText = `⛵ 迷い船(${target?.name || ''}) 航路半額 ${sec}秒`;
          evCls += ' active';
        }
      }
    } else if (sim.climaxActive) {
      evText = `🌅 夜明け前・建築半減`;
      evCls += ' active';
    }
    if (evText) {
      eventBanner.textContent = evText;
      eventBanner.className = evCls;
    } else {
      eventBanner.classList.add('hidden');
    }
    syncToastContainerPosition();
  }

  if (sim.constellation) {
    const c = sim.constellation;
    constellationHudName.textContent = c.completed ? `${c.name}✓` : c.name;
    btnConstellation.classList.toggle('done', Boolean(c.completed));
    btnConstellation.classList.toggle('active', Boolean(uiState.constellationHighlight));
  }

  if (sim.state !== 'play') {
    modeBadgesLayer.innerHTML = '';
    scene3d.updateBridgePreview(sim, null, null, false, []);
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
    const tr = isl?.trait ? ISLAND_TRAITS[isl.trait] : null;
    const traitTag = tr ? `・${tr.icon}${tr.desc}` : '';

    if (!isl) {
      buildHint.textContent = 'つながった島のスロットをタップして建物を選ぼう';
    } else if (!isl.connected) {
      buildHint.textContent = `${formatIslandName(isl)}は未接続です${traitTag}`;
    } else if (slotOccupied) {
      buildHint.textContent = 'このスロットには建物があります（別の空きスロットを選択）';
    } else {
      const remoteTag = isl.remote ? `・遠島×${REMOTE_ISLAND_MULT}` : '';
      buildHint.textContent = `${formatIslandName(isl)} #${uiState.selectedSlotIndex + 1} に建てる${traitTag}${remoteTag}`;
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
        uiState.pendingBridgeTargetId !== null
          ? '同じ候補の島をもう一度タップで確定（赤線はふさがる未来の航路）'
          : uiState.originIslandId === null
            ? 'つながっている島をタップ → 光る近くの島をタップして接続'
            : '光っている候補の島をタップしてプレビュー・再タップで架橋';
    } else if (uiState.mode === 'highBridge') {
      actionTitle.textContent = `高い橋を架ける（灯り${HIGH_BRIDGE_COST} / ${HIGH_BRIDGE_TIME}秒）`;
      actionDesc.textContent =
        uiState.pendingBridgeTargetId !== null
          ? '同じ候補の島をもう一度タップで高い橋を架けます'
          : uiState.originIslandId === null
            ? '船が下をくぐれる高い橋を架けます（つながっている島から選択）'
            : '光っている候補の島をタップしてプレビュー・再タップで架橋';
    } else if (uiState.mode === 'route') {
      const strayActive =
        sim.strayShip && !sim.strayShip.claimed && sim.strayShip.timeLeft > 0
          ? sim.getIsland(sim.strayShip.islandId)
          : null;
      actionTitle.textContent = strayActive
        ? `船の航路を引く（通常${ROUTE_COST}／⛵${strayActive.name}は${HALF_ROUTE_COST}）`
        : `船の航路を引く（灯り${ROUTE_COST}）`;
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
  let warnBanner = false;
  if (uiState.selectedBridgeId) {
    const br = sim.bridges.find((b) => b.id === uiState.selectedBridgeId);
    if (br) {
      const a = sim.getIsland(br.islandA);
      const b = sim.getIsland(br.islandB);
      bannerMsg = `${br.high ? '高い橋' : '橋'}: ${formatIslandName(a)} ↔ ${formatIslandName(b)}`;
    }
  } else if (
    uiState.originIslandId !== null &&
    uiState.pendingBridgeTargetId !== null &&
    (uiState.mode === 'bridge' || uiState.mode === 'highBridge')
  ) {
    const orig = sim.getIsland(uiState.originIslandId);
    const tgt = sim.getIsland(uiState.pendingBridgeTargetId);
    if (uiState.pendingBlockedRoutes.length > 0) {
      const names = uiState.pendingBlockedRoutes
        .map((r) => formatIslandName(r.toIsland || r.island))
        .join('・');
      bannerMsg = `⚠️ この橋で ${names} への航路がふさがります（再タップで確定）`;
      warnBanner = true;
    } else if (orig && tgt) {
      const label = uiState.mode === 'highBridge' ? '高い橋' : '橋';
      bannerMsg = `${formatIslandName(orig)} ↔ ${formatIslandName(tgt)} に${label}（再タップで確定）`;
    }
  } else if (uiState.originIslandId !== null) {
    const orig = sim.getIsland(uiState.originIslandId);
    bannerMsg = `出発島: ${formatIslandName(orig)} → 接続先の島をタップ`;
  } else if (uiState.selectedIslandId !== null) {
    const isl = sim.getIsland(uiState.selectedIslandId);
    if (isl) {
      const lightStr = isl.connected ? `灯り ${Math.round(isl.light)}` : '未接続';
      const tr = isl.trait ? ISLAND_TRAITS[isl.trait] : null;
      const traitStr = tr ? `・${tr.name}` : '';
      if (uiState.selectedSlotIndex !== null && isBuild) {
        const b = sim.getBuildingAt(isl.id, uiState.selectedSlotIndex);
        const slotInfo = b
          ? `${BUILDING_DEFS[b.type].name}${b.built ? '' : '（建築中）'}`
          : `空きスロット#${uiState.selectedSlotIndex + 1}`;
        bannerMsg = `${formatIslandName(isl)}（${lightStr}${traitStr}）・${slotInfo}`;
      } else {
        bannerMsg = `${formatIslandName(isl)}（${lightStr}${traitStr}）`;
      }
    }
  }

  selectionBanner.classList.toggle('warn', warnBanner);
  if (bannerMsg) {
    selectionText.textContent = bannerMsg;
    selectionBanner.classList.remove('hidden');
    const bottomH = hudBottom.offsetHeight || 168;
    selectionBanner.style.bottom = `${bottomH + 10}px`;
  } else {
    selectionBanner.classList.add('hidden');
  }

  if (
    (uiState.mode === 'bridge' || uiState.mode === 'highBridge') &&
    uiState.originIslandId !== null &&
    uiState.pendingBridgeTargetId !== null
  ) {
    scene3d.updateBridgePreview(
      sim,
      uiState.originIslandId,
      uiState.pendingBridgeTargetId,
      uiState.mode === 'highBridge',
      uiState.pendingBlockedRoutes
    );
  } else {
    scene3d.updateBridgePreview(sim, null, null, false, []);
  }

  renderModeBadges();
  updateGuideUI();
}

function updateDawnExtinguishOrbs() {
  if (sim.state !== 'dawn') return;
  for (const isl of sim.islands) {
    if (!isl.connected || dawnExtinguishedIds.has(isl.id)) continue;
    const delay = isl.id * 0.085 + 0.06;
    if (sim.dawnProgress >= delay) {
      dawnExtinguishedIds.add(isl.id);
      spawnFlyOrbs(isl.x, isl.y + 0.6, isl.z, 3, 'amber');
    }
  }
}

function handleEvents() {
  const events = sim.consumeEvents();
  const nowSec = performance.now() / 1000;
  for (const ev of events) {
    if (ev.type === 'buildingCompleted') {
      const slot = ev.island.slots[ev.building.slotIndex];
      const wx = ev.island.x + slot.localX;
      const wy = ev.island.y + 1.6;
      const wz = ev.island.z + slot.localZ;
      spawnWorldPopup(wx, wy, wz, `${BUILDING_DEFS[ev.building.type].name} 完成！`);
      spawnFlyOrbs(wx, ev.island.y + 0.7, wz, 3, 'amber');
      if (ev.type === 'buildingCompleted') {
        uiSyncAcc = 1;
      }
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
    } else if (ev.type === 'islandMilestone') {
      const isl = ev.island;
      scene3d.triggerIslandPulse(isl.id, nowSec);
      const label = ev.starlight
        ? `✨星灯の島ボーナス！ +${ev.bonus}`
        : `島が灯った！ +${ev.bonus}`;
      spawnWorldPopup(isl.x, isl.y + 1.9, isl.z, label, 'amber');
      spawnFlyOrbs(isl.x, isl.y + 0.8, isl.z, ev.starlight ? 4 : 2, 'amber');
    } else if (ev.type === 'bridgeCompleted') {
      uiSyncAcc = 1;
      const r = ev.recipient;
      spawnWorldPopup(r.x, r.y + 1.9, r.z, `橋開通！ ${r.name} +${ev.bonus}`, 'cyan');
      spawnFlyOrbs(r.x, r.y + 0.6, r.z, 3, 'cyan');
    } else if (ev.type === 'shipArrived') {
      if (sim.state === 'dawn' || sim.state === 'result') continue;
      const isl = ev.island;
      const wStr = ev.walletGain > 0 ? ` / 所持+${ev.walletGain}` : '';
      if (ev.firstArrival) {
        uiSyncAcc = 1;
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
      spawnFlyOrbs(isl.x, isl.y + 0.7, isl.z, 3, ev.walletGain > 0 ? 'amber' : 'cyan');
    } else if (ev.type === 'loopFormed') {
      scene3d.triggerLoopPulse(ev.cycleIslandIds, nowSec);
      let cx = 0;
      let cy = 0;
      let cz = 0;
      let cnt = 0;
      for (const id of ev.cycleIslandIds || []) {
        const isl = sim.getIsland(id);
        if (isl) {
          scene3d.triggerIslandPulse(isl.id, nowSec);
          cx += isl.x;
          cy += isl.y;
          cz += isl.z;
          cnt += 1;
        }
      }
      if (cnt > 0) {
        spawnWorldPopup(cx / cnt, cy / cnt + 2.2, cz / cnt, `✨ 光の環ができた！ +${ev.bonus}`, 'amber');
      }
      showToast(`✨ 光の環が完成！（${ev.loopCount}/3・生産+25%） +${ev.bonus}`, 'good');
    } else if (ev.type === 'constellationCompleted') {
      const c = ev.constellation;
      const lastId = c.islandIds[c.islandIds.length - 1];
      const anchor = sim.getIsland(lastId) || sim.getIsland(0);
      for (const id of c.islandIds) {
        scene3d.triggerIslandPulse(id, nowSec);
      }
      if (anchor) {
        spawnWorldPopup(anchor.x, anchor.y + 2.3, anchor.z, `✦ 星座完成「${c.name}」 +${ev.bonus}`, 'amber');
      }
      showToast(`✦ 今夜の星座「${c.name}」完成！ +${ev.bonus}`, 'good');
    } else if (ev.type === 'nightEventWarning') {
      const nEv = ev.event;
      if (nEv.type === 'nightWind') showToast('🌬 10秒後に夜風が吹きます', 'normal');
      else if (nEv.type === 'fullMoon') showToast('🌕 10秒後に満月が昇ります（生産2倍）', 'good');
      else if (nEv.type === 'meteor') showToast('🌠 10秒後に流れ星が流れます！', 'good');
      else if (nEv.type === 'strayShip') showToast('⛵ 10秒後に迷い船が現れます！', 'good');
    } else if (ev.type === 'nightEventStarted') {
      const nEv = ev.event;
      if (nEv.type === 'nightWind') showToast('🌬 夜風！20秒間 船が半分の速さに', 'warn');
      else if (nEv.type === 'fullMoon') showToast('🌕 満月！15秒間 全島の生産が2倍', 'good');
      else if (nEv.type === 'meteor') showToast('🌠 流れ星！3秒以内に空をタップ！', 'good');
      else if (nEv.type === 'strayShip') {
        const tgt = sim.getIsland(nEv.targetIslandId);
        showToast(`⛵ ${tgt?.name || '遠くの島'}に迷い船！20秒間 航路半額`, 'good');
      }
      uiSyncAcc = 1;
    } else if (ev.type === 'meteorCaught') {
      const mPos = scene3d.getMeteorWorldPosition(ev.progress, ev.dirSeed);
      spawnFlyOrbs(mPos.x, mPos.y, mPos.z, 5, 'amber');
      spawnWorldPopup(mPos.x, mPos.y, mPos.z, `🌠 +${ev.reward}`, 'amber');
      showToast(`🌠 流れ星キャッチ！ 灯り+${ev.reward}`, 'good');
    } else if (ev.type === 'strayShipJoined') {
      const isl = ev.island;
      scene3d.triggerIslandPulse(isl.id, nowSec);
      spawnWorldPopup(isl.x, isl.y + 2.0, isl.z, '⛵ 迷い船が仲間に！半額開通', 'cyan');
      showToast(`⛵ 迷い船が${isl.name}の航路に加わりました！`, 'good');
    } else if (ev.type === 'climaxStarted') {
      showToast('🌅 夜明け前のひと押し！建築時間が半分になりました', 'good');
      uiSyncAcc = 1;
    } else if (ev.type === 'dawnStarted') {
      dawnExtinguishedIds.clear();
      clearSelection();
      uiState.constellationHighlight = false;
      updateIslandHighlights();
      clearModeBadgePools();
      clearPopups();
      clearToasts();
      guideBubble.classList.add('hidden');
      showToast(ev.reason, 'good', { dawn: true });
    } else if (ev.type === 'gameEnded') {
      clearToasts();
      clearPopups();
      showResultScreen();
    }
  }
}

function renderResultLightMap(canvas, simState) {
  if (!canvas || !simState?.islands?.length) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const bg = ctx.createRadialGradient(w * 0.5, h * 0.5, 8, w * 0.5, h * 0.5, Math.max(w, h) * 0.65);
  bg.addColorStop(0, '#13224a');
  bg.addColorStop(1, '#070d20');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const isl of simState.islands) {
    minX = Math.min(minX, isl.x);
    maxX = Math.max(maxX, isl.x);
    minZ = Math.min(minZ, isl.z);
    maxZ = Math.max(maxZ, isl.z);
  }
  const pad = 22;
  const spanX = Math.max(10, maxX - minX);
  const spanZ = Math.max(10, maxZ - minZ);
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanZ);
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const mapPt = (isl) => ({
    x: w * 0.5 + (isl.x - cx) * scale,
    y: h * 0.5 + (isl.z - cz) * scale,
  });

  // Loop halos
  for (const cyc of simState.loops || []) {
    if (!Array.isArray(cyc) || cyc.length < 3) continue;
    ctx.save();
    ctx.beginPath();
    cyc.forEach((id, idx) => {
      const isl = simState.getIsland(id);
      if (!isl) return;
      const p = mapPt(isl);
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 209, 102, 0.13)';
    ctx.fill();
    ctx.restore();
  }

  // Constellation guide lines
  if (simState.constellation?.edges) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = simState.constellation.completed
      ? 'rgba(255, 236, 138, 0.96)'
      : 'rgba(145, 208, 255, 0.5)';
    ctx.lineWidth = simState.constellation.completed ? 2.8 : 1.6;
    for (const [uId, vId] of simState.constellation.edges) {
      const u = simState.getIsland(uId);
      const v = simState.getIsland(vId);
      if (!u || !v) continue;
      const pu = mapPt(u);
      const pv = mapPt(v);
      ctx.beginPath();
      ctx.moveTo(pu.x, pu.y);
      ctx.lineTo(pv.x, pv.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Routes (cyan dashed, width & glow proportional to flow)
  for (const rt of simState.routes) {
    const a = simState.getIsland(rt.islandA);
    const b = simState.getIsland(rt.islandB);
    if (!a || !b) continue;
    const pa = mapPt(a);
    const pb = mapPt(b);
    const flowNorm = Math.min(1, (rt.flow || 0) / 22);
    const lw = 2.4 + flowNorm * 4.4;
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = rt.established ? 'rgba(118, 246, 246, 0.28)' : 'rgba(118, 246, 246, 0.15)';
    ctx.lineWidth = lw + 3;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
    ctx.strokeStyle = rt.established ? 'rgba(128, 248, 248, 0.96)' : 'rgba(128, 248, 248, 0.6)';
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
    ctx.restore();
  }

  // Bridges (amber / high-gold, width & glow proportional to flow)
  for (const br of simState.bridges) {
    const a = simState.getIsland(br.islandA);
    const b = simState.getIsland(br.islandB);
    if (!a || !b) continue;
    const pa = mapPt(a);
    const pb = mapPt(b);
    const flowNorm = Math.min(1, (br.flow || 0) / 26);
    const lw = 2.8 + flowNorm * 5.0;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = br.high ? 'rgba(165, 232, 255, 0.28)' : 'rgba(255, 200, 82, 0.3)';
    ctx.lineWidth = lw + 3.2;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
    ctx.strokeStyle = br.high
      ? 'rgba(186, 240, 255, 0.98)'
      : `rgba(255, 212, 102, ${0.78 + flowNorm * 0.22})`;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
    ctx.restore();
  }

  // Island nodes
  const constSet = new Set(simState.constellation?.islandIds || []);
  for (const isl of simState.islands) {
    const p = mapPt(isl);
    const r = isl.id === 0 ? 7.2 : isl.connected ? 4.8 + Math.min(2.6, isl.light / 200) : 3.4;
    if (isl.connected) {
      const halo = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, r * 2.7);
      halo.addColorStop(0, isl.id === 0 ? 'rgba(255, 235, 148, 0.8)' : 'rgba(255, 204, 96, 0.56)');
      halo.addColorStop(1, 'rgba(255, 196, 86, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 2.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = isl.id === 0 ? '#fff6bd' : isl.connected ? '#ffd86b' : '#5e7399';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    if (isl.id === 0) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    if (constSet.has(isl.id)) {
      ctx.strokeStyle = simState.constellation.completed ? '#fff9cc' : '#8ce0ff';
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 2.6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function showResultScreen() {
  clearToasts();
  clearPopups();
  const islandsSum = Math.round(sim.getIslandsLightSum());
  const walletSum = Math.round(sim.walletLight);
  const connectedCount = sim.getConnectedCount();
  const best = saveBestScore(sim.score, uiState.chartMode, uiState.activeSeed);

  resultChartLabel.textContent =
    uiState.chartMode === 'daily'
      ? `今夜の星図: 今日の星図（${uiState.activeSeed}）`
      : `今夜の星図: おまかせ（${uiState.activeSeed}）`;
  resultReason.textContent = sim.dawnReason || '夜明けが訪れました';
  resultBest.textContent = `ベスト: ${best}`;
  rbIslandsLight.textContent = String(islandsSum);
  rbWalletLight.textContent = String(walletSum);
  rbConnected.textContent = `${connectedCount} / ${sim.islands.length}`;
  rbTimeBonus.textContent = `+${sim.allConnectedBonus}`;
  rbLoopBonus.textContent = `+${sim.loopBonus || 0}（${sim.loopCount || 0}環）`;
  rbConstellationBonus.textContent = sim.constellation?.completed
    ? `+${sim.constellationBonus || 0}`
    : '未達成';
  renderResultLightMap(resultMapCanvas, sim);
  refreshScreens();

  cancelAnimationFrame(resultCountAnimId);
  const targetScore = Math.max(0, sim.score);
  if (targetScore === 0) {
    resultScore.textContent = '0';
    return;
  }
  const startAt = performance.now();
  const duration = 900;
  resultScore.textContent = '0';
  const stepCountUp = (ts) => {
    const t = Math.min(1, (ts - startAt) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    resultScore.textContent = String(Math.round(targetScore * eased));
    if (t < 1 && sim.state === 'result') {
      resultCountAnimId = requestAnimationFrame(stepCountUp);
    } else {
      resultScore.textContent = String(targetScore);
    }
  };
  resultCountAnimId = requestAnimationFrame(stepCountUp);
}

let pendingUrlSeed = urlSeed;

function startNewGame(options = {}) {
  cancelAnimationFrame(resultCountAnimId);
  clearTimeout(guideHideTimer);
  clearToasts();
  clearPopups();
  clearModeBadgePools();
  dawnExtinguishedIds.clear();
  for (const o of flyOrbs) o.el.remove();
  flyOrbs.length = 0;

  let seed;
  if (options && options.seed !== undefined && options.seed !== null) {
    seed = String(options.seed);
    pendingUrlSeed = null;
  } else if (uiState.chartMode === 'daily') {
    seed = getTodaySeedString();
  } else if (pendingUrlSeed) {
    seed = pendingUrlSeed;
    pendingUrlSeed = null;
  } else {
    seed = `rand-${Math.random().toString(36).slice(2, 8)}`;
  }
  uiState.activeSeed = seed;

  sim.startGame({ seed });
  scene3d.buildIslands(sim.islands);
  scene3d.resetCameraForNewGame();
  scene3d.updateBridgePreview(sim, null, null, false, []);
  uiState.mode = 'build';
  uiState.selectedIslandId = 0;
  uiState.selectedSlotIndex = 0;
  uiState.originIslandId = null;
  uiState.pendingBridgeTargetId = null;
  uiState.pendingBlockedRoutes = [];
  uiState.selectedBridgeId = null;
  uiState.lastDescribedIslandId = null;
  uiState.constellationHighlight = false;
  uiState.fastForward = false;
  guideState.step1Done = false;
  guideState.step2Done = false;
  guideState.step3Done = false;
  guideState.completedNotified = false;
  guideState.visible = !guideState.dismissed && !isBotMode;
  for (const tab of modeTabs) {
    tab.classList.toggle('active', tab.dataset.mode === 'build');
  }
  refreshUI();
  return { ok: true };
}

// Button bindings
btnChartDaily.addEventListener('click', () => {
  uiState.chartMode = 'daily';
  const dailySeed = getTodaySeedString();
  sim.seed = dailySeed;
  uiState.activeSeed = dailySeed;
  sim.resetToTitle();
  scene3d.buildIslands(sim.islands);
  refreshUI();
});

btnChartRandom.addEventListener('click', () => {
  uiState.chartMode = 'random';
  const previewSeed = `rand-${Math.random().toString(36).slice(2, 8)}`;
  sim.seed = previewSeed;
  uiState.activeSeed = previewSeed;
  sim.resetToTitle();
  scene3d.buildIslands(sim.islands);
  refreshUI();
});

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

btnFastForward.addEventListener('click', () => {
  uiState.fastForward = !uiState.fastForward;
  const baseSpeed = isFastMode ? 10 : 1;
  sim.setSpeed(uiState.fastForward ? baseSpeed * 2 : baseSpeed);
  refreshUI();
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

btnConstellation.addEventListener('click', () => {
  const c = sim.constellation;
  if (!c) return;
  uiState.constellationHighlight = !uiState.constellationHighlight;
  const nowSec = performance.now() / 1000;
  if (uiState.constellationHighlight) {
    for (const id of c.islandIds) {
      scene3d.triggerIslandPulse(id, nowSec);
    }
    const names = c.islandIds.map((id) => sim.getIsland(id)?.name || `#${id}`).join('・');
    const stateStr = c.completed ? '達成済み✓' : `+${c.bonus}`;
    showToast(`✦ 今夜の星座「${c.name}」: ${names}（${stateStr}）`, c.completed ? 'good' : 'normal');
  }
  refreshUI();
});

btnGuideHelp.addEventListener('click', () => {
  guideState.visible = !guideState.visible;
  refreshUI();
});

btnGuideClose.addEventListener('click', () => {
  guideState.visible = false;
  refreshUI();
});

btnGuideDismiss.addEventListener('click', () => {
  guideState.dismissed = true;
  guideState.visible = false;
  saveGuideDismissed(true);
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
  quality: { get: () => scene3d.quality, enumerable: true },
  seed: { get: () => sim.seed, enumerable: true },
  constellation: { get: () => sim.constellation, enumerable: true },
  loopCount: { get: () => sim.loopCount, enumerable: true },
  loopBonus: { get: () => sim.loopBonus, enumerable: true },
  constellationBonus: { get: () => sim.constellationBonus, enumerable: true },
  activeEvent: { get: () => sim.activeEvent, enumerable: true },
  climaxActive: { get: () => sim.climaxActive, enumerable: true },
  fullMoonActive: { get: () => sim.fullMoonActive, enumerable: true },
  nightWindActive: { get: () => sim.nightWindActive, enumerable: true },
  strayShip: { get: () => sim.strayShip, enumerable: true },
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
  catchMeteor() {
    const res = sim.catchMeteor();
    refreshUI();
    return res;
  },
  startGame(options = {}) {
    return startNewGame(options);
  },
  setSpeed(n) {
    const res = sim.setSpeed(n);
    refreshUI();
    return res;
  },
  screenPos(islandId, slotIndex) {
    const bounds = getTappableBounds();
    if (islandId === 'meteor') {
      const ev = sim.activeEvent;
      if (!ev || ev.type !== 'meteor' || ev.phase !== 'active' || ev.caught) {
        return { x: 0, y: 0, visible: false };
      }
      const prog = Math.max(0, Math.min(1, 1 - ev.timeLeft / Math.max(0.1, ev.duration)));
      const mPos = scene3d.getMeteorWorldPosition(prog, ev.dirSeed ?? 0.5);
      const pt = scene3d.projectToScreen(mPos.x, mPos.y, mPos.z);
      return {
        x: Math.round(pt.x * 10) / 10,
        y: Math.round(pt.y * 10) / 10,
        visible: isPointInTappableBounds(pt, bounds),
      };
    }
    const isl = sim.getIsland(islandId);
    if (!isl) return { x: 0, y: 0, visible: false };
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
    scene3d.focusOn(isl.x, isl.y, isl.z, 22);
    return { ok: true };
  },
};

window.__game = gameHook;

// Simple auto-play bot for ?bot=1 screenshot/verification runs
let botThinkAcc = 0;
function stepAutoBot() {
  if (sim.state !== 'play') return;

  // 0. Catch shooting star & claim half-price stray ship route
  if (sim.activeEvent?.type === 'meteor' && sim.activeEvent.phase === 'active') {
    if (sim.catchMeteor().ok) {
      refreshUI();
      return;
    }
  }
  if (
    sim.strayShip &&
    !sim.strayShip.claimed &&
    sim.strayShip.timeLeft > 0 &&
    sim.walletLight >= HALF_ROUTE_COST
  ) {
    const strayTarget = sim.getIsland(sim.strayShip.islandId);
    if (
      strayTarget &&
      !strayTarget.connected &&
      !sim.routes.some((rt) => rt.islandB === strayTarget.id || rt.islandA === strayTarget.id)
    ) {
      for (const a of sim.islands) {
        if (!a.connected) continue;
        if (sim.buildRoute(a.id, strayTarget.id).ok) {
          refreshUI();
          return;
        }
      }
    }
  }

  // 1. Starter buildings on home island first
  const home = sim.getIsland(0);
  if (home) {
    const used = home.slots.filter((s) => s.buildingId !== null).length;
    if (used < 2) {
      const empty = home.slots.find((s) => s.buildingId === null);
      const desired = used === 0 ? 'stall' : 'streetlight';
      if (empty && sim.walletLight >= BUILDING_DEFS[desired].cost) {
        if (sim.placeBuilding(0, desired, empty.index).ok) {
          refreshUI();
          return;
        }
      }
    }
  }

  // 2. Connect distant islands with ship routes (only unconnected islands without existing route)
  if (sim.walletLight >= ROUTE_COST) {
    for (const b of sim.islands) {
      if (b.connected || !b.remote) continue;
      if (sim.routes.some((rt) => rt.islandB === b.id || rt.islandA === b.id)) continue;
      for (const a of sim.islands) {
        if (!a.connected) continue;
        if (sim.buildRoute(a.id, b.id).ok) {
          refreshUI();
          return;
        }
      }
    }
  }

  // 3. Connect nearby islands with bridges (respect fog/wind and avoid blocking future routes)
  for (const b of sim.islands) {
    if (b.connected || b.trait === 'fog') continue;
    for (const a of sim.islands) {
      if (!a.connected || a.trait === 'fog') continue;
      if (distance2D(a, b) <= BRIDGE_MAX_DIST) {
        const needsHigh = a.trait === 'wind' || b.trait === 'wind';
        const futureBlocked = sim.getFutureBlockedRoutes(a.id, b.id, false);
        const useHigh = needsHigh || futureBlocked.length > 0;
        const cost = useHigh ? HIGH_BRIDGE_COST : BRIDGE_COST;
        if (sim.walletLight >= cost && sim.buildBridge(a.id, b.id, useHigh).ok) {
          refreshUI();
          return;
        }
      }
    }
  }

  // 4. Route fallback for any remaining unconnected island (e.g. fog or awkward angle)
  if (sim.walletLight >= ROUTE_COST) {
    for (const b of sim.islands) {
      if (b.connected) continue;
      if (sim.routes.some((rt) => rt.islandB === b.id || rt.islandA === b.id)) continue;
      for (const a of sim.islands) {
        if (!a.connected) continue;
        if (sim.buildRoute(a.id, b.id).ok) {
          refreshUI();
          return;
        }
      }
    }
  }

  // 5. Build balanced starter/mid-game mix on connected islands
  for (const isl of sim.islands) {
    if (!isl.connected) continue;
    const used = isl.slots.filter((s) => s.buildingId !== null).length;
    if (used >= (isl.id === 0 ? 4 : 2)) continue;
    const empty = isl.slots.find((s) => s.buildingId === null);
    if (!empty) continue;
    const order =
      isl.id === 0
        ? ['stall', 'streetlight', 'house', 'lighthouse']
        : isl.trait === 'market'
          ? ['stall', 'house', 'streetlight']
          : ['stall', 'streetlight', 'house'];
    const desired = order[used % order.length];
    if (sim.walletLight >= BUILDING_DEFS[desired].cost) {
      if (sim.placeBuilding(isl.id, desired, empty.index).ok) {
        refreshUI();
        return;
      }
    }
  }
}

// FPS monitor for automatic mobile low-quality fallback
let fpsFrames = 0;
let fpsAccMs = 0;
let lowFpsStreak = 0;

function updatePerformanceMonitor(frameMs) {
  if (document.hidden || frameMs > 250 || scene3d.quality === 'low') return;
  fpsFrames += 1;
  fpsAccMs += frameMs;
  if (fpsAccMs >= 1000) {
    const fps = (fpsFrames * 1000) / fpsAccMs;
    fpsFrames = 0;
    fpsAccMs = 0;
    if (fps < 40) {
      lowFpsStreak += 1;
      if (lowFpsStreak >= 3) {
        scene3d.setQuality('low');
      }
    } else {
      lowFpsStreak = 0;
    }
  }
}

// Main Animation Loop
let lastPerf = performance.now();
let uiSyncAcc = 0;

function tick(now) {
  requestAnimationFrame(tick);
  const frameMs = now - lastPerf;
  const rawDt = Math.min(0.1, frameMs / 1000);
  lastPerf = now;

  updatePerformanceMonitor(frameMs);

  if (sim.state === 'title') {
    scene3d.orbit.targetTheta += rawDt * 0.08;
  } else if (sim.state === 'play' || sim.state === 'dawn') {
    const freezeTimer =
      sim.state === 'play' &&
      guideState.visible &&
      !guideState.step1Done &&
      !isFastMode &&
      !isBotMode;
    const savedTimeLeft = sim.timeLeft;
    sim.step(rawDt);
    if (freezeTimer) {
      sim.timeLeft = savedTimeLeft;
    }
    if (isBotMode && sim.state === 'play') {
      botThinkAcc += rawDt;
      const interval = isFastMode ? 0.12 : 0.45;
      if (botThinkAcc >= interval) {
        botThinkAcc = 0;
        stepAutoBot();
      }
    }
    handleEvents();
    updateDawnExtinguishOrbs();
    uiSyncAcc += rawDt;
    if (uiSyncAcc >= 0.12 || (sim.state !== 'play' && sim.state !== 'dawn')) {
      uiSyncAcc = 0;
      refreshUI();
    }
  }

  updateFlyOrbs(rawDt);
  scene3d.syncAndRender(sim, uiState, now / 1000);
  renderModeBadges();
}

if (isBotMode) {
  startNewGame();
} else {
  refreshUI();
}
requestAnimationFrame(tick);
