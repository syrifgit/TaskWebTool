'use strict';

import { fetchJsonCached } from "../data/json-cache.js";

/**
 * League Tasks — Search overlay + item spawns toggle
 * Active/Completed tabs removed; tasks are searched via an overlay
 * opened by the "Task Search" button in the panel header.
 * Completed-task tracking persists in localStorage and is shown on planner cards.
 */

const TASKS_URL = 'https://raw.githubusercontent.com/syrifgit/full-task-scraper/refs/heads/main/generated/league-5-raging-echoes/LEAGUE_5.full.json';
const TASK_STRATEGY_URL = 'data_osrs/strategy.json';
const STORAGE_KEY = 'league_tasks_completed';

// Maps region button names to area names used in the task dataset
const TASK_AREA_MAP = {
    'Desert': 'Kharidian Desert',
    'Fremennik': 'Fremennik Province',
    'Kourend': 'Kourend & Kebos',
};
const TASK_SEARCH_DEBOUNCE_MS = 100;

const TIER_POINTS = {
    1: 10,
    2: 40,
    3: 80,
    4: 200,
    5: 400,
};

let allTasks = [];
let taskSearchQuery = '';
let currentRegions = null;
let showGeneralTasks = true;
let selectedTaskName = null;
let taskPointsLayer = null; // L.LayerGroup of strategy point markers
let taskSearchDebounce = null;
let taskPointIcon = null;

// Persisted set of completed task names
let completedTasks = new Set();
try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) completedTasks = new Set(JSON.parse(saved));
} catch (e) { /* ignore */ }

function saveCompleted() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(completedTasks))); } catch (e) { /* storage unavailable */ }
}

// Expose globally for planner plugin
window._completedTasks = completedTasks;
window._saveCompleted = saveCompleted;

// ── Strategy point markers ────────────────────────────────────────
function parseStrategyPoints(pointsStr) {
    // Expects "x1,y1,x2,y2,..." pairs
    const nums = pointsStr.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    const coords = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
        coords.push({ x: nums[i], y: nums[i + 1] });
    }
    return coords;
}

const SKILL_NAME_MAP = {
    AGILITY: 'Agility',
    ATTACK: 'Attack',
    CONSTRUCTION: 'Construction',
    COOKING: 'Cooking',
    CRAFTING: 'Crafting',
    DEFENCE: 'Defence',
    FARMING: 'Farming',
    FIREMAKING: 'Firemaking',
    FISHING: 'Fishing',
    FLETCHING: 'Fletching',
    HERBLORE: 'Herblore',
    HITPOINTS: 'Hitpoints',
    HUNTER: 'Hunter',
    MAGIC: 'Magic',
    MINING: 'Mining',
    PRAYER: 'Prayer',
    RANGED: 'Ranged',
    RUNECRAFT: 'Runecraft',
    RUNECRAFTING: 'Runecraft',
    SLAYER: 'Slayer',
    SMITHING: 'Smithing',
    STRENGTH: 'Strength',
    THIEVING: 'Thieving',
    WOODCUTTING: 'Woodcutting',
};

function displaySkillName(value) {
    const key = String(value ?? '').trim().toUpperCase();
    if (!key) return '';
    if (SKILL_NAME_MAP[key]) return SKILL_NAME_MAP[key];
    return key.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function normalizeSkills(skills) {
    if (!Array.isArray(skills)) return [];
    return skills
        .map(entry => {
            const skill = displaySkillName(entry?.skill);
            const level = Number(entry?.level);
            if (!skill || !Number.isFinite(level)) return null;
            return {
                skill,
                level,
                iconUrl: `https://oldschool.runescape.wiki/images/${skill.replace(/ /g, '_')}_icon.png`,
            };
        })
        .filter(Boolean);
}

function normalizeArea(area) {
    const value = String(area ?? '').trim();
    if (!value) return '';
    if (value.toLowerCase() === 'global') return '';
    return value;
}

function normalizeCompletion(task) {
    if (typeof task.completion === 'string' && task.completion.trim()) {
        return task.completion.trim();
    }
    const pct = Number(task.completionPercent);
    if (Number.isFinite(pct)) {
        return `${pct.toFixed(1)}%`;
    }
    return '0.0%';
}

function pointsForTask(task) {
    const explicit = Number(task.points);
    if (Number.isFinite(explicit) && explicit > 0) {
        return explicit;
    }
    const tierNum = Number(task.tier);
    if (Number.isFinite(tierNum) && TIER_POINTS[tierNum]) {
        return TIER_POINTS[tierNum];
    }
    const tierName = String(task.tierName ?? '').trim().toLowerCase();
    if (tierName === 'easy') return 10;
    if (tierName === 'medium') return 40;
    if (tierName === 'hard') return 80;
    if (tierName === 'elite') return 200;
    if (tierName === 'master') return 400;
    return 0;
}

function normalizeTask(rawTask, strategyMap) {
    const structId = Number(rawTask.structId ?? rawTask.structID ?? rawTask.id ?? rawTask.taskId);
    const strategy = Number.isFinite(structId) ? (strategyMap[String(structId)] || null) : null;
    const name = String(rawTask.name ?? strategy?.taskName ?? '').trim();
    const description = String(rawTask.description ?? rawTask.task ?? '').trim();
    const area = normalizeArea(rawTask.area);
    const completion = normalizeCompletion(rawTask);
    const points = pointsForTask(rawTask);
    const requirements = String(rawTask.requirements ?? 'N/A').trim() || 'N/A';
    const wikiNotes = String(rawTask.wikiNotes ?? '').trim();
    const skills = normalizeSkills(rawTask.skills);
    const strategySearch = strategy && strategy.search ? strategy.search.trim() : '';
    const strategyPoints = strategy && strategy.points ? strategy.points.trim() : '';
    const parsedStrategyPoints = strategyPoints ? parseStrategyPoints(strategyPoints) : [];

    return {
        taskId: Number.isFinite(structId) ? structId : null,
        name,
        task: description,
        area,
        points,
        completion,
        requirements,
        wikiNotes,
        skills,
        category: rawTask.category ?? '',
        skill: rawTask.skill ?? '',
        tier: rawTask.tier ?? null,
        tierName: rawTask.tierName ?? '',
        sortId: rawTask.sortId ?? null,
        strategy,
        _searchText: `${name} ${description} ${wikiNotes} ${area} ${rawTask.category ?? ''} ${rawTask.skill ?? ''}`.toLowerCase(),
        _pointsValue: Number(points) || 0,
        _strategySearch: strategySearch,
        _strategyPoints: strategyPoints,
        _strategyPinCount: parsedStrategyPoints.length,
        _strategyCoords: parsedStrategyPoints,
        _strictSearch: !(strategy && strategy.no_strict),
    };
}

function getTaskPointIcon() {
    if (!taskPointIcon && window.L) {
        taskPointIcon = window.L.icon({
            iconUrl: 'images/marker-icon.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });
    }

    return taskPointIcon;
}

function taskMatchesRegion(task, regionSet) {
    if (!task.area) {
        return showGeneralTasks;
    }
    if (!regionSet) return true;
    const mappedSet = new Set([...regionSet].map(r => TASK_AREA_MAP[r] ?? r));
    return mappedSet.has(task.area);
}

function clearTaskPoints() {
    if (taskPointsLayer) {
        const map = window.runescape_map;
        if (map) map.removeLayer(taskPointsLayer);
        taskPointsLayer = null;
    }
}

function drawTaskPoints(task) {
    clearTaskPoints();
    const coords = task._strategyCoords || [];
    if (coords.length === 0) return;

    const map = window.runescape_map;
    const L = window.L;
    if (!map || !L) return;

    const popupHtml = `<div class="osrs-popup-inner"><b>${escHtml(task.name)}</b><br><span style="color:#e8d5a0;">${escHtml(task.task)}</span></div>`;
    const icon = getTaskPointIcon();

    taskPointsLayer = L.layerGroup();
    coords.forEach(({ x, y }) => {
        const marker = L.marker([y + 0.5, x + 0.5], { icon });
        marker.bindPopup(popupHtml, { autoPan: false, className: 'osrs-popup' });
        taskPointsLayer.addLayer(marker);
    });
    taskPointsLayer.addTo(map);
}

// ── DOM references ────────────────────────────────────────────────
const taskStats = document.getElementById('task-panel-stats');

// ── Rendering helpers ─────────────────────────────────────────────
function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderStats() {
    if (!taskStats) return;
    const regionSet = currentRegions !== null ? new Set(currentRegions) : null;
    let total = 0;
    let doneCount = 0;
    let donePts = 0;
    let leftPts = 0;

    for (const task of allTasks) {
        if (!taskMatchesRegion(task, regionSet)) continue;
        total += 1;
        if (completedTasks.has(task.name)) {
            doneCount += 1;
            donePts += task._pointsValue;
        } else {
            leftPts += task._pointsValue;
        }
    }

    taskStats.innerHTML =
        `<div class="stat-item">Remaining: <span>${total - doneCount}</span> / ${total}</div>` +
        `<div class="stat-item">Pts done: <span>${donePts.toLocaleString()}</span></div>` +
        `<div class="stat-item">Pts left: <span>${leftPts.toLocaleString()}</span></div>`;
}

// Expose so planner can refresh stats after toggling completion
window._renderStats = renderStats;

// ── Task search card builder ───────────────────────────────────────
function buildCard(task) {
    const isCompleted = completedTasks.has(task.name);
    const card = document.createElement('div');
    card.className = 'task-card' + (isCompleted ? ' task-card-completed' : '');

    if (task.name === selectedTaskName) {
        card.classList.add('task-card-selected');
    }

    const searchTerm = task._strategySearch;
    const pointsStr  = task._strategyPoints;
    const strictSearch = task._strictSearch;
    const hasStrategy = !isCompleted && (searchTerm || pointsStr);
    if (hasStrategy) {
        card.classList.add('task-card-has-strategy');
        const hints = [];
        if (searchTerm) hints.push(`Search: "${searchTerm}"${strictSearch ? '' : ' (partial)'}`);
        if (pointsStr) hints.push('Show pins');
        card.title = `Click to: ${hints.join(' + ')}`;
    }

    const areaHtml = task.area
        ? `<span class="task-card-area">${escHtml(task.area)}</span>`
        : `<span class="task-card-area" style="color:#7a6840;border-color:#2a2000;">General</span>`;

    const skillReqHtml = Array.isArray(task.skills) && task.skills.length > 0
        ? `<div class="task-card-skill-reqs">` +
          task.skills.map(s =>
              `<span class="task-card-skill-chip" title="${escHtml(s.skill)} ${s.level}">` +
                  `<img class="task-card-skill-icon" src="${escHtml(s.iconUrl)}" alt="${escHtml(s.skill)} icon" loading="lazy"/>` +
                  `<span class="task-card-skill-level">${s.level}</span>` +
              `</span>`
          ).join('') +
        `</div>`
        : '';

    const reqHtml = (task.requirements && task.requirements !== 'N/A')
        ? `<div class="task-card-requirements">Req: ${escHtml(task.requirements)}</div>`
        : '';

    const checkboxHtml =
        `<label class="task-card-check" title="${isCompleted ? 'Mark incomplete' : 'Mark complete'}" onclick="event.stopPropagation();">` +
            `<input type="checkbox" class="task-card-checkbox" data-name="${escHtml(task.name)}" ${isCompleted ? 'checked' : ''} />` +
        `</label>`;

    const planBtnHtml =
        `<button class="task-card-plan-btn" data-name="${escHtml(task.name)}" onclick="event.stopPropagation();" title="Add to planner">📋</button>`;

    card.innerHTML =
        `<div class="task-card-header">` +
            checkboxHtml +
            `<div class="task-card-name">${escHtml(task.name)}</div>` +
            `<div class="task-card-points">${escHtml(task.points)} pts</div>` +
            planBtnHtml +
        `</div>` +
        `<div class="task-card-desc">${escHtml(task.task)}</div>` +
        skillReqHtml +
        reqHtml +
        `<div class="task-card-meta">` +
            areaHtml +
            (searchTerm ? `<span class="task-card-strategy-hint">🔍 ${escHtml(searchTerm)}</span>` : '') +
            (pointsStr  ? `<span class="task-card-strategy-hint">📍 ${task._strategyPinCount} pin(s)</span>` : '') +
            `<span class="task-card-completion">${escHtml(task.completion)} players</span>` +
        `</div>`;

    // Plan button — always present now
    card.querySelector('.task-card-plan-btn')?.addEventListener('click', e => {
        e.stopPropagation();
        if (window._plannerAddTask) window._plannerAddTask(task.name);
        renderSearchResults();
    });

    // Drag into planner drop zones
    if (!isCompleted) {
        card.draggable = true;
        card.addEventListener('dragstart', e => {
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('text/plain', task.name);
        });
    }

    // Checkbox toggle — mark complete/incomplete
    card.querySelector('.task-card-checkbox').addEventListener('change', e => {
        const name = e.target.dataset.name;
        if (e.target.checked) {
            completedTasks.add(name);
            if (selectedTaskName === name) {
                selectedTaskName = null;
                clearTaskPoints();
            }
        } else {
            completedTasks.delete(name);
        }
        saveCompleted();
        renderStats();
        if (window._renderPlanner) window._renderPlanner();
        renderSearchResults();
    });

    // Card body click — strategy search/pins (only for non-completed tasks)
    if (!isCompleted) {
        card.addEventListener('click', () => {
            const wasSelected = selectedTaskName === task.name;
            selectedTaskName = wasSelected ? null : task.name;
            clearTaskPoints();
            const ctrl = window._unifiedSearch;
            if (ctrl && ctrl.triggerSearch) ctrl.triggerSearch('', false);
            renderSearchResults();
            if (!wasSelected) {
                if (searchTerm && ctrl && ctrl.triggerSearch) ctrl.triggerSearch(searchTerm, strictSearch);
                if (pointsStr) drawTaskPoints(task);
            }
        });
    }

    return card;
}

// ── Task search overlay ───────────────────────────────────────────
function renderSearchResults() {
    const resultsEl = document.getElementById('task-search-results');
    if (!resultsEl) return;

    const regionSet = currentRegions !== null ? new Set(currentRegions) : null;
    const search = taskSearchQuery.toLowerCase();

    const plannedNames = window._getPlannerTaskNames ? window._getPlannerTaskNames() : null;

    const matches = allTasks.filter(task => {
        if (!taskMatchesRegion(task, regionSet)) return false;
        if (search && !task._searchText.includes(search)) return false;
        if (plannedNames && plannedNames.has(task.name)) return false;
        return true;
    });

    const frag = document.createDocumentFragment();
    if (matches.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'task-panel-empty';
        empty.textContent = search ? 'No tasks match the search.' : 'No tasks for the current region filter.';
        frag.appendChild(empty);
    } else {
        for (const task of matches) frag.appendChild(buildCard(task));
    }
    resultsEl.innerHTML = '';
    resultsEl.appendChild(frag);
}

// Wire overlay open/close and internal search input
(function wireSearchOverlay() {
    const openBtn          = document.getElementById('task-search-open-btn');
    const closeBtn         = document.getElementById('task-search-close-btn');
    const overlay          = document.getElementById('task-search-overlay');
    const searchInput      = document.getElementById('task-search-input');
    const plannerContainer = document.getElementById('planner-container');
    const statsEl          = document.getElementById('task-panel-stats');

    if (!openBtn || !overlay) return;

    function openOverlay() {
        overlay.style.display = '';
        if (plannerContainer) plannerContainer.style.display = 'none';
        if (statsEl) statsEl.style.display = 'none';
        if (allTasks.length > 0) renderSearchResults();
        requestAnimationFrame(() => { if (searchInput) searchInput.focus(); });
    }

    function closeOverlay() {
        overlay.style.display = 'none';
        if (plannerContainer) plannerContainer.style.display = '';
        if (statsEl) statsEl.style.display = '';
        // Clear strategy pins/search when closing
        clearTaskPoints();
        selectedTaskName = null;
        const ctrl = window._unifiedSearch;
        if (ctrl && ctrl.triggerSearch) ctrl.triggerSearch('', false);
    }

    openBtn.addEventListener('click', openOverlay);
    if (closeBtn) closeBtn.addEventListener('click', closeOverlay);

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (taskSearchDebounce) clearTimeout(taskSearchDebounce);
            taskSearchDebounce = setTimeout(() => {
                taskSearchQuery = searchInput.value.trim();
                renderSearchResults();
                taskSearchDebounce = null;
            }, TASK_SEARCH_DEBOUNCE_MS);
        });
    }

    const generalToggle = document.getElementById('task-show-general');
    if (generalToggle) {
        generalToggle.checked = true;
        generalToggle.addEventListener('change', e => {
            showGeneralTasks = e.target.checked;
            if (taskSearchDebounce) { clearTimeout(taskSearchDebounce); taskSearchDebounce = null; }
            renderSearchResults();
        });
    }
})();

// ── Item spawns toggle (Leaflet control — alongside shops/thieving buttons) ──
(function mountSpawnsControl() {
    const L = window.L;
    let spawnsLayer = null;
    let allSpawnsData = null;
    let allNamesData = null;
    let nameToId = null;
    let spawnsVisible = false;

    async function loadSpawnsData() {
        if (allSpawnsData) return allSpawnsData;
        try {
            [allSpawnsData, allNamesData] = await Promise.all([
                fetchJsonCached('data_osrs/item_spawns.json'),
                fetchJsonCached('data_osrs/names.json', { fallback: null })
            ]);
            nameToId = {};
            if (allNamesData) {
                for (const id in allNamesData) {
                    const key = allNamesData[id].toLowerCase();
                    if (!(key in nameToId) || +id < +nameToId[key]) nameToId[key] = id;
                }
            }
        } catch (e) {
            console.error('item_spawns: failed to load', e);
            allSpawnsData = [];
            nameToId = {};
        }
        return allSpawnsData;
    }

    function getSpawnTypeOffsets(count) {
        const radius = 0.24;
        if (count <= 1) return [[0, 0]];
        if (count === 2) return [[-radius, 0], [radius, 0]];
        if (count === 3) return [[0, -radius], [radius * 0.87, radius * 0.5], [-radius * 0.87, radius * 0.5]];
        if (count === 4) return [[-radius, -radius], [radius, -radius], [-radius, radius], [radius, radius]];

        const offsets = [];
        for (let i = 0; i < count; i++) {
            const angle = (-Math.PI / 2) + ((Math.PI * 2 * i) / count);
            offsets.push([Math.cos(angle) * 0.3, Math.sin(angle) * 0.3]);
        }
        return offsets;
    }

    function buildSpawnOffsetLookup(items) {
        const tileTypes = new Map();
        items.forEach(item => {
            const itemKey = item.page_name.toLowerCase();
            item.coordinates.forEach(coord => {
                const tileKey = `${coord[0]},${coord[1]}`;
                if (!tileTypes.has(tileKey)) tileTypes.set(tileKey, []);
                const types = tileTypes.get(tileKey);
                if (!types.includes(itemKey)) types.push(itemKey);
            });
        });
        const offsetLookup = new Map();
        tileTypes.forEach((types, tileKey) => {
            if (types.length <= 1) return;
            const offsets = getSpawnTypeOffsets(types.length);
            types.forEach((itemKey, index) => {
                offsetLookup.set(`${tileKey}|${itemKey}`, offsets[index] || [0, 0]);
            });
        });
        return offsetLookup;
    }

    function buildSpawnsLayer(regions) {
        if (spawnsLayer) {
            const map = window.runescape_map;
            if (map && map.hasLayer(spawnsLayer)) map.removeLayer(spawnsLayer);
            spawnsLayer = null;
        }
        if (!allSpawnsData || regions.length === 0) return;

        const regionSet = new Set(regions.map(r => r.toLowerCase()));
        spawnsLayer = L.layerGroup();

        const fallbackHtml = `<div class='item-spawn-icon-fallback'></div>`;
        const visibleSpawns = allSpawnsData.filter(item => {
            if (!item.leagueregion || !item.coordinates || item.coordinates.length === 0) return false;
            return item.leagueregion.some(r => regionSet.has(r.toLowerCase()));
        });
        const spawnOffsetLookup = buildSpawnOffsetLookup(visibleSpawns);

        visibleSpawns.forEach(item => {
            const regionLabel = item.leagueregion
                .map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(', ');

            const itemKey = item.page_name.toLowerCase();
            const itemId = nameToId[itemKey] ?? null;
            const iconHtml = itemId !== null
                ? `<img src="https://raw.githubusercontent.com/runelite/static.runelite.net/refs/heads/gh-pages/cache/item/icon/${itemId}.png" alt="${item.page_name}" class="item-spawn-icon-img" onerror="this.outerHTML='${fallbackHtml}'">`
                : fallbackHtml;

            const divIcon = L.divIcon({
                html: iconHtml,
                className: 'item-spawn-icon',
                iconSize: [28, 29],
                iconAnchor: [14, 15],
                popupAnchor: [0, -15],
            });

            item.coordinates.forEach(coord => {
                const offset = spawnOffsetLookup.get(`${coord[0]},${coord[1]}|${itemKey}`) || [0, 0];
                const marker = L.marker([coord[1] + 0.5 + offset[1], coord[0] + 0.5 + offset[0]], { icon: divIcon });

                let popupContent = `<div class="osrs-popup-inner" style="display: flex; align-items: center; gap: 8px;">`;
                if (itemId !== null) {
                    popupContent += `<img src="https://raw.githubusercontent.com/runelite/static.runelite.net/refs/heads/gh-pages/cache/item/icon/${itemId}.png" alt="${item.page_name}" style="width: 36px; height: 36px; image-rendering: pixelated;" onerror="this.style.display='none'">`;
                }
                popupContent += `<div>`;
                popupContent += `<b><a href="https://oldschool.runescape.wiki/w/${encodeURIComponent(item.page_name.replace(/ /g, '_'))}" target="_blank">${item.page_name}</a></b><br>`;
                popupContent += `<span class="popup-region">Region: ${regionLabel}</span><br>`;
                popupContent += `<span class="popup-coords">x = ${coord[0]}, y = ${coord[1]}</span>`;
                popupContent += `</div></div>`;

                marker.bindPopup(popupContent, { autoPan: false, className: 'osrs-popup' });
                spawnsLayer.addLayer(marker);
            });
        });
    }

    function wireSpawnsButton(btn) {
        btn.addEventListener('click', async () => {
            const map = window.runescape_map;
            if (!map) return;

            if (spawnsVisible) {
                if (spawnsLayer && map.hasLayer(spawnsLayer)) map.removeLayer(spawnsLayer);
                spawnsVisible = false;
                btn.classList.remove('task-spawns-btn-active');
                btn.textContent = 'Show Item Spawns';
            } else {
                btn.textContent = 'Loading…';
                btn.disabled = true;
                await loadSpawnsData();
                btn.disabled = false;
                buildSpawnsLayer(currentRegions || []);
                if (spawnsLayer) spawnsLayer.addTo(map);
                spawnsVisible = true;
                btn.classList.add('task-spawns-btn-active');
                btn.textContent = 'Hide Item Spawns';
            }
        });

        function onSpawnsRegionChange(regions) {
            if (!spawnsVisible) return;
            const map = window.runescape_map;
            buildSpawnsLayer(regions);
            if (spawnsLayer && map) spawnsLayer.addTo(map);
        }

        if (window._regionControl) {
            window._regionControl.onRegionChange(onSpawnsRegionChange);
        } else {
            window.addEventListener('regionControlReady', e => {
                e.detail.onRegionChange(onSpawnsRegionChange);
            }, { once: true });
        }
    }

    function addSpawnsControl() {
        if (!L || !window.runescape_map) return;
        const SpawnsControl = L.Control.extend({
            onAdd: function () {
                const container = L.DomUtil.create('div', 'leaflet-control-spawns');
                const btn = L.DomUtil.create('button', 'task-spawns-btn leaflet-control-spawns-btn', container);
                btn.textContent = 'Show Item Spawns';
                L.DomEvent.disableClickPropagation(container);
                wireSpawnsButton(btn);
                return container;
            }
        });
        new SpawnsControl({ position: 'bottomleft' }).addTo(window.runescape_map);
    }

    if (window.runescape_map) {
        addSpawnsControl();
    } else {
        let attempts = 0;
        const poll = setInterval(() => {
            if (window.runescape_map || ++attempts > 40) {
                clearInterval(poll);
                if (window.runescape_map) addSpawnsControl();
            }
        }, 200);
    }
})();

// ── Region filter integration ─────────────────────────────────────
function wireRegionControl(regionControl) {
    currentRegions = regionControl.getEnabledRegions();
    window._getCurrentRegions = () => currentRegions;
    regionControl.onRegionChange(regions => {
        currentRegions = regions;
        renderStats();
        // Re-render search results if overlay is currently open
        const overlay = document.getElementById('task-search-overlay');
        if (overlay && overlay.style.display !== 'none') {
            renderSearchResults();
        }
    });
}

if (window._regionControl) {
    wireRegionControl(window._regionControl);
} else {
    window.addEventListener('regionControlReady', e => {
        wireRegionControl(e.detail);
    }, { once: true });
}

// ── Bootstrap ─────────────────────────────────────────────────────
async function init() {
    try {
        const [tasksData, strategyData] = await Promise.all([
            fetchJsonCached(TASKS_URL),
            fetchJsonCached(TASK_STRATEGY_URL, { fallback: {} }),
        ]);

        const taskList = Array.isArray(tasksData)
            ? tasksData
            : (Array.isArray(tasksData?.tasks) ? tasksData.tasks : []);

        const strategyMap = strategyData && typeof strategyData === 'object'
            ? strategyData
            : {};

        allTasks = taskList
            .map(task => normalizeTask(task, strategyMap))
            .filter(task => task.name && task.taskId !== null);
    } catch (err) {
        const resultsEl = document.getElementById('task-search-results');
        if (resultsEl) resultsEl.innerHTML = '<div class="task-panel-empty">Failed to load tasks.</div>';
        console.error('LeagueTasks: failed to fetch tasks/strategy JSON', err);
        return;
    }
    renderStats();
    // Expose tasks globally for the planner plugin
    window._allTasksRef = allTasks;
}

init();


