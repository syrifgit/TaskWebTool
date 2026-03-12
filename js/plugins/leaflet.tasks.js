'use strict';

/**
 * League Tasks Panel
 * Renders a full-height task list to the right of the map,
 * filtered by the existing region filter control.
 * Supports marking tasks complete with a two-tab view.
 */

const TASKS_URL = 'data_osrs/Raging_Echoes_League-Tasks.json';
const STORAGE_KEY = 'league_tasks_completed';

let allTasks = [];
let currentSearch = '';
let currentRegions = null;
let showGeneralTasks = false;
let selectedTaskName = null;
let activeTab = 'active'; // 'active' | 'completed'
let taskPointsLayer = null; // L.LayerGroup of strategy point markers

// Persisted set of completed task names
let completedTasks = new Set();
try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) completedTasks = new Set(JSON.parse(saved));
} catch (e) { /* ignore */ }

function saveCompleted() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(completedTasks))); } catch (e) { /* storage unavailable */ }
}

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

function clearTaskPoints() {
    if (taskPointsLayer) {
        const map = window.runescape_map;
        if (map) map.removeLayer(taskPointsLayer);
        taskPointsLayer = null;
    }
}

function drawTaskPoints(task) {
    clearTaskPoints();
    const pointsStr = task.strategy && task.strategy.points ? task.strategy.points.trim() : '';
    if (!pointsStr) return;

    const map = window.runescape_map;
    const L = window.L;
    if (!map || !L) return;

    const coords = parseStrategyPoints(pointsStr);
    if (coords.length === 0) return;

    const popupHtml = `<div class="osrs-popup-inner"><b>${escHtml(task.name)}</b><br><span style="color:#e8d5a0;">${escHtml(task.task)}</span></div>`;

    taskPointsLayer = L.layerGroup();
    coords.forEach(({ x, y }) => {
        const marker = L.marker([y + 0.5, x + 0.5], {
            icon: L.icon({
                iconUrl: 'images/marker-icon.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            })
        });
        marker.bindPopup(popupHtml, { autoPan: false, className: 'osrs-popup' });
        taskPointsLayer.addLayer(marker);
    });
    taskPointsLayer.addTo(map);
}

// ── DOM references ────────────────────────────────────────────────
const taskList   = document.getElementById('task-list');
const taskStats  = document.getElementById('task-panel-stats');
const taskSearch = document.getElementById('task-search');

// ── Filtering ─────────────────────────────────────────────────────
function filterActiveTasks() {
    const search = currentSearch.toLowerCase();
    const regions = currentRegions;

    return allTasks.filter(task => {
        if (completedTasks.has(task.name)) return false;

        if (!task.area) {
            if (!showGeneralTasks) return false;
        } else if (regions !== null && !regions.includes(task.area)) {
            return false;
        }

        if (search) {
            const haystack = `${task.name} ${task.task} ${task.area}`.toLowerCase();
            if (!haystack.includes(search)) return false;
        }

        return true;
    });
}

function filterCompletedTasks() {
    const search = currentSearch.toLowerCase();
    return allTasks.filter(task => {
        if (!completedTasks.has(task.name)) return false;
        if (search) {
            const haystack = `${task.name} ${task.task} ${task.area}`.toLowerCase();
            if (!haystack.includes(search)) return false;
        }
        return true;
    });
}

// ── Rendering helpers ─────────────────────────────────────────────
function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderStats() {
    // Base set: tasks visible under current region + general toggle (no text search, no completion filter)
    const regions = currentRegions;
    const regionFiltered = allTasks.filter(task => {
        if (!task.area) {
            return showGeneralTasks;
        }
        return regions === null || regions.includes(task.area);
    });

    const total     = regionFiltered.length;
    const done      = regionFiltered.filter(t =>  completedTasks.has(t.name));
    const remaining = regionFiltered.filter(t => !completedTasks.has(t.name));
    const donePts   = done.reduce((s, t) => s + (t.points || 0), 0);
    const leftPts   = remaining.reduce((s, t) => s + (t.points || 0), 0);

    taskStats.innerHTML =
        `<div class="stat-item">Remaining: <span>${remaining.length}</span> / ${total}</div>` +
        `<div class="stat-item">Pts done: <span>${donePts.toLocaleString()}</span></div>` +
        `<div class="stat-item">Pts left: <span>${leftPts.toLocaleString()}</span></div>`;
}

function buildCard(task, isCompleted) {
    const card = document.createElement('div');
    card.className = 'task-card' + (isCompleted ? ' task-card-completed' : '');

    if (!isCompleted && task.name === selectedTaskName) {
        card.classList.add('task-card-selected');
    }

    const searchTerm = task.strategy && task.strategy.search ? task.strategy.search.trim() : '';
    const pointsStr  = task.strategy && task.strategy.points ? task.strategy.points.trim() : '';
    const strictSearch = !(task.strategy && task.strategy.no_strict);
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

    const reqHtml = (task.requirements && task.requirements !== 'N/A')
        ? `<div class="task-card-requirements">Req: ${escHtml(task.requirements)}</div>`
        : '';

    const checkboxHtml =
        `<label class="task-card-check" title="${isCompleted ? 'Mark incomplete' : 'Mark complete'}" onclick="event.stopPropagation();">` +
            `<input type="checkbox" class="task-card-checkbox" data-name="${escHtml(task.name)}" ${isCompleted ? 'checked' : ''} />` +
        `</label>`;

    const planBtnHtml = !isCompleted
        ? `<button class="task-card-plan-btn" data-name="${escHtml(task.name)}" onclick="event.stopPropagation();" title="Add to planner">📋</button>`
        : '';

    card.innerHTML =
        `<div class="task-card-header">` +
            checkboxHtml +
            `<div class="task-card-name">${escHtml(task.name)}</div>` +
            `<div class="task-card-points">${escHtml(task.points)} pts</div>` +
            planBtnHtml +
        `</div>` +
        `<div class="task-card-desc">${escHtml(task.task)}</div>` +
        reqHtml +
        `<div class="task-card-meta">` +
            areaHtml +
            (searchTerm ? `<span class="task-card-strategy-hint">🔍 ${escHtml(searchTerm)}</span>` : '') +
            (pointsStr  ? `<span class="task-card-strategy-hint">📍 ${parseStrategyPoints(pointsStr).length} pin(s)</span>` : '') +
            `<span class="task-card-completion">${escHtml(task.completion)} players</span>` +
        `</div>`;

    // Plan button
    if (!isCompleted) {
        card.querySelector('.task-card-plan-btn')?.addEventListener('click', e => {
            e.stopPropagation();
            if (window._plannerAddTask) window._plannerAddTask(task.name);
        });
        // Make active cards draggable into the planner
        card.draggable = true;
        card.addEventListener('dragstart', e => {
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('text/plain', task.name);
        });
    }

    // Checkbox toggle
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
        updateTabBadges();
        renderTasks();
    });

    // Card body click (selection + strategy) — only on active tab
    if (!isCompleted) {
        card.addEventListener('click', () => {
            const wasSelected = selectedTaskName === task.name;
            selectedTaskName = wasSelected ? null : task.name;
            clearTaskPoints(); // always clear previous pins on any click
            // Always clear search first, then apply new task's strategy if selecting
            const ctrl = window._unifiedSearch;
            if (ctrl && ctrl.triggerSearch) ctrl.triggerSearch('', false);
            renderTasks();
            if (!wasSelected) {
                if (searchTerm && ctrl && ctrl.triggerSearch) ctrl.triggerSearch(searchTerm, strictSearch);
                if (pointsStr) drawTaskPoints(task);
            }
        });
    }

    return card;
}

function updateTabBadges() {
    const completedBtn = document.querySelector('.task-tab[data-tab="completed"]');
    if (completedBtn) {
        completedBtn.textContent = completedTasks.size
            ? `Completed (${completedTasks.size})`
            : 'Completed';
    }
}

function renderTasks() {
    if (allTasks.length === 0) return;

    renderStats();
    updateTabBadges();

    const frag = document.createDocumentFragment();

    if (activeTab === 'active') {
        const visible = filterActiveTasks();
        if (visible.length === 0) {
            taskList.innerHTML = '<div class="task-panel-empty">No tasks match the current filters.</div>';
            return;
        }
        for (const task of visible) frag.appendChild(buildCard(task, false));
    } else {
        const visible = filterCompletedTasks();

        // Reset button always shown when there are any completions
        if (completedTasks.size > 0) {
            const resetBtn = document.createElement('button');
            resetBtn.className = 'task-reset-btn';
            resetBtn.textContent = `Reset all (${completedTasks.size})`;
            resetBtn.addEventListener('click', () => {
                if (confirm('Clear all completed tasks?')) {
                    completedTasks.clear();
                    saveCompleted();
                    updateTabBadges();
                    renderTasks();
                }
            });
            frag.appendChild(resetBtn);
        }

        if (visible.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'task-panel-empty';
            empty.textContent = 'No completed tasks yet.';
            frag.appendChild(empty);
        } else {
            for (const task of visible) frag.appendChild(buildCard(task, true));
        }
    }

    taskList.innerHTML = '';
    taskList.appendChild(frag);
}

// ── Tabs ──────────────────────────────────────────────────────────
document.querySelectorAll('.task-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        document.querySelectorAll('.task-tab').forEach(b => b.classList.remove('task-tab-active'));
        btn.classList.add('task-tab-active');
        renderTasks();
    });
});

// ── Search & toggles ─────────────────────────────────────────────
taskSearch.addEventListener('input', e => {
    currentSearch = e.target.value.trim();
    renderTasks();
});

document.getElementById('task-show-general').addEventListener('change', e => {
    showGeneralTasks = e.target.checked;
    renderTasks();
});

// ── Item spawns toggle ────────────────────────────────────────────
(function () {
    const btn = document.getElementById('task-spawns-toggle');
    if (!btn) return;

    const L   = window.L;
    let spawnsLayer = null;   // L.layerGroup, created on first show
    let allSpawnsData = null; // cached JSON
    let allNamesData = null;  // cached names map (id -> name)
    let spawnsVisible = false;

    async function loadSpawnsData() {
        if (allSpawnsData) return allSpawnsData;
        try {
            [allSpawnsData, allNamesData] = await Promise.all([
                fetch('data_osrs/item_spawns.json').then(r => r.json()),
                fetch('data_osrs/names.json').then(r => r.json()).catch(() => null)
            ]);
        } catch (e) {
            console.error('item_spawns: failed to load', e);
            allSpawnsData = [];
        }
        return allSpawnsData;
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

        // Build reverse name->id lookup once, keeping the lowest numeric ID per name
        const nameToId = {};
        if (allNamesData) {
            for (const id in allNamesData) {
                const key = allNamesData[id].toLowerCase();
                if (!(key in nameToId) || +id < +nameToId[key]) nameToId[key] = id;
            }
        }

        const fallbackHtml = `<div class="item-spawn-icon-fallback"></div>`;

        allSpawnsData.forEach(item => {
            if (!item.leagueregion || !item.coordinates || item.coordinates.length === 0) return;
            if (!item.leagueregion.some(r => regionSet.has(r.toLowerCase()))) return;

            const regionLabel = item.leagueregion
                .map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(', ');

            const itemId = nameToId[item.page_name.toLowerCase()] ?? null;
            const iconHtml = itemId !== null
                ? `<img src="https://raw.githubusercontent.com/runelite/static.runelite.net/refs/heads/gh-pages/cache/item/icon/${itemId}.png" alt="${item.page_name}" class="item-spawn-icon-img" onerror="this.outerHTML='${fallbackHtml}'">`
                : fallbackHtml;

            const divIcon = L.divIcon({
                html: iconHtml,
                className: 'item-spawn-icon',
                iconAnchor: [0, 0],
                popupAnchor: [0, -18],
            });

            item.coordinates.forEach(coord => {
                const marker = L.marker([coord[1] + 0.5, coord[0] + 0.5], { icon: divIcon });

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

    // Keep spawns in sync with region changes while visible
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
})();

// ── Region filter integration ─────────────────────────────────────
function wireRegionControl(regionControl) {
    currentRegions = regionControl.getEnabledRegions();
    window._getCurrentRegions = () => currentRegions;
    regionControl.onRegionChange(regions => {
        currentRegions = regions;
        renderTasks();
    });
}

if (window._regionControl) {
    wireRegionControl(window._regionControl);
} else {
    window.addEventListener('regionControlReady', e => {
        wireRegionControl(e.detail);
        renderTasks();
    }, { once: true });
}

// ── Bootstrap ─────────────────────────────────────────────────────
async function init() {
    try {
        const resp = await fetch(TASKS_URL);
        allTasks = await resp.json();
    } catch (err) {
        taskList.innerHTML = '<div class="task-panel-empty">Failed to load tasks.</div>';
        console.error('LeagueTasks: failed to fetch tasks JSON', err);
        return;
    }
    updateTabBadges();
    renderTasks();
    // Expose tasks globally for the planner plugin
    window._allTasksRef = allTasks;
}

init();

