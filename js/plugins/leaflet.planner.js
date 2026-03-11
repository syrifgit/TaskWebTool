'use strict';

/**
 * League Task Planner
 * Adds a "Planner" tab to the task panel.
 * Features:
 *  - Add tasks from active list or inline search
 *  - Drop a pin on the map for each task
 *  - Coloured pins by task tier (Easy/Medium/Hard/Elite/Master)
 *  - Running cumulative points total next to each entry
 *  - Per-task comments / step notes
 *  - Polylines between pinned tasks (all | nearby | none)
 *  - Drag-and-drop reordering within the planner list
 *  - Drag tasks from the active list drop zone into planner
 */

const PLANNER_KEY    = 'league_planner_v1';
const NEARBY_WINDOW  = 2; // tasks either side to show when mode = 'nearby'

// ─── Tier colour helpers ──────────────────────────────────────────
const TIERS = [
    { min: 500, name: 'Master', color: '#ffd700' },
    { min: 250, name: 'Elite',  color: '#cc66ff' },
    { min: 100, name: 'Hard',   color: '#ff8800' },
    { min: 50,  name: 'Medium', color: '#4488ff' },
    { min: 0,   name: 'Easy',   color: '#44cc44' },
];

function tierFor(points) {
    return TIERS.find(t => (points || 0) >= t.min) || TIERS[TIERS.length - 1];
}

// ─── State ────────────────────────────────────────────────────────
let plannerItems = [];   // [{ id, taskName, pinCoords:{lat,lng}|null, comments:[] }]
let allTasksRef  = [];   // mirror of allTasks from leaflet.tasks.js
let plannerMap   = null;
let plannerLineMode    = 'all';      // 'all' | 'nearby' | 'none'
let plannerPinsVisible = true;
let plannerSelectedId  = null;       // highlighted item id (for nearby mode)
let pinningMode        = false;
let pinningItemId      = null;
let plannerPinsLayer   = null;
let plannerLinesLayer  = null;
let dragSrcId          = null;

// ─── Persistence ──────────────────────────────────────────────────
function loadPlanner() {
    try {
        const raw = localStorage.getItem(PLANNER_KEY);
        if (raw) plannerItems = JSON.parse(raw);
    } catch (_) { plannerItems = []; }
}

function savePlanner() {
    try { localStorage.setItem(PLANNER_KEY, JSON.stringify(plannerItems)); } catch (_) {}
}

function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ─── Task lookup ──────────────────────────────────────────────────
function getTask(name) {
    return allTasksRef.find(t => t.name === name) || null;
}

// ─── HTML escaping ────────────────────────────────────────────────
function esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── SVG pin icon ─────────────────────────────────────────────────
function makePinIcon(color, number) {
    const numSvg = number != null
        ? `<text x="12" y="15" font-size="9" font-family="sans-serif" font-weight="bold" fill="#fff" text-anchor="middle">${number}</text>`
        : '';
    const svg = encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">` +
        `<path d="M14 0C6.3 0 0 6.3 0 14c0 8.4 14 26 14 26S28 22.4 28 14C28 6.3 21.7 0 14 0z" fill="${color}" stroke="#1a1000" stroke-width="1.5"/>` +
        `<circle cx="14" cy="14" r="6" fill="#000" opacity="0.25"/>` +
        numSvg +
        `</svg>`
    );
    return window.L && L.icon({
        iconUrl: 'data:image/svg+xml;charset=utf-8,' + svg,
        iconSize:    [28, 40],
        iconAnchor:  [14, 40],
        popupAnchor: [0, -42],
    });
}

// ─── Map overlay ──────────────────────────────────────────────────
function redrawMapOverlays() {
    const L   = window.L;
    const map = plannerMap;
    if (!L || !map) return;

    if (plannerPinsLayer)  { map.removeLayer(plannerPinsLayer);  plannerPinsLayer  = null; }
    if (plannerLinesLayer) { map.removeLayer(plannerLinesLayer); plannerLinesLayer = null; }

    const pinned = plannerItems
        .map((item, idx) => ({ item, idx, task: getTask(item.taskName) }))
        .filter(x => x.item.pinCoords);

    if (pinned.length === 0) return;

    if (plannerPinsVisible) {
    plannerPinsLayer = L.layerGroup();

    pinned.forEach(({ item, idx, task }) => {
        const pts   = task ? (task.points || 10) : 10;
        const tier  = tierFor(pts);
        const icon  = makePinIcon(tier.color, idx + 1);
        if (!icon) return;

        const commentsHtml = item.comments.length
            ? '<ul style="margin:4px 0 0 0;padding-left:16px;color:#c8b880;">' +
              item.comments.map(c => `<li>${esc(c)}</li>`).join('') + '</ul>'
            : '';

        const marker = L.marker([item.pinCoords.lat, item.pinCoords.lng], { icon, zIndexOffset: 200 });
        marker.bindPopup(
            `<div class="osrs-popup-inner">` +
            `<b>#${idx + 1} ${esc(task ? task.name : item.taskName)}</b><br>` +
            `<span style="color:${tier.color};font-weight:bold;">${tier.name}</span>` +
            ` · <span style="color:#e8d5a0;">${pts} pts</span><br>` +
            (task ? `<span style="color:#c8b880;">${esc(task.task)}</span>` : '') +
            commentsHtml +
            `</div>`,
            { autoPan: false, className: 'osrs-popup' }
        );
        plannerPinsLayer.addLayer(marker);
    });

        plannerPinsLayer.addTo(map);
    } // end plannerPinsVisible

    // Lines
    if (plannerLineMode !== 'none' && pinned.length >= 2) {
        plannerLinesLayer = L.layerGroup();

        let pairs = [];
        if (plannerLineMode === 'all') {
            for (let i = 0; i < pinned.length - 1; i++) pairs.push([pinned[i], pinned[i + 1]]);
        } else if (plannerLineMode === 'nearby' && plannerSelectedId) {
            const selIdx = pinned.findIndex(x => x.item.id === plannerSelectedId);
            if (selIdx !== -1) {
                const lo = Math.max(0, selIdx - NEARBY_WINDOW);
                const hi = Math.min(pinned.length - 1, selIdx + NEARBY_WINDOW);
                for (let i = lo; i < hi; i++) pairs.push([pinned[i], pinned[i + 1]]);
            }
        }

        pairs.forEach(([a, b]) => {
            L.polyline(
                [[a.item.pinCoords.lat, a.item.pinCoords.lng], [b.item.pinCoords.lat, b.item.pinCoords.lng]],
                { color: '#ffd700', weight: 2, opacity: 0.75, dashArray: '6 5' }
            ).addTo(plannerLinesLayer);
        });

        plannerLinesLayer.addTo(map);
    }
}

// ─── Pinning mode ─────────────────────────────────────────────────
function startPinning(itemId) {
    cancelPinning();
    pinningMode   = true;
    pinningItemId = itemId;

    const map = plannerMap;
    if (!map) return;
    map.getContainer().style.cursor = 'crosshair';

    // Use a native capturing listener on the container so it fires BEFORE
    // Leaflet dispatches to any marker (which would open a popup instead).
    map._plannerPinHandler = function (e) {
        e.stopPropagation();   // prevent marker popup
        e.preventDefault();
        const latlng = map.mouseEventToLatLng(e);
        const item = plannerItems.find(i => i.id === pinningItemId);
        if (item) {
            item.pinCoords = { lat: latlng.lat, lng: latlng.lng };
            savePlanner();
            redrawMapOverlays();
            renderPlanner();
        }
        cancelPinning();
    };
    map.getContainer().addEventListener('click', map._plannerPinHandler, { capture: true });

    document.querySelectorAll('.planner-card').forEach(c => {
        c.classList.toggle('planner-card-pinning', c.dataset.id === itemId);
    });
    updateStatusBanner('Click on the map to place the pin. Press Esc to cancel.');
}

function cancelPinning() {
    pinningMode   = false;
    pinningItemId = null;
    const map = plannerMap;
    if (map) {
        map.getContainer().style.cursor = '';
        if (map._plannerPinHandler) {
            map.getContainer().removeEventListener('click', map._plannerPinHandler, { capture: true });
            map._plannerPinHandler = null;
        }
    }
    document.querySelectorAll('.planner-card').forEach(c => c.classList.remove('planner-card-pinning'));
    updateStatusBanner(null);
}

// ─── Status banner ────────────────────────────────────────────────
function updateStatusBanner(msg) {
    const el = document.getElementById('planner-status');
    if (!el) return;
    if (msg) {
        el.textContent = msg;
        el.style.display = '';
    } else {
        el.style.display = 'none';
    }
}

// ─── Render planner list ──────────────────────────────────────────
function renderPlanner() {
    const container = document.getElementById('planner-list');
    if (!container) return;

    // Preserve scroll position
    const scrollTop = container.scrollTop;

    container.innerHTML = '';

    // Controls bar
    const ctrl = document.createElement('div');
    ctrl.id = 'planner-controls';
    ctrl.className = 'planner-controls';
    const pinnedCount = plannerItems.filter(i => i.pinCoords).length;
    let runningTotal = plannerItems.reduce((s, i) => {
        const t = getTask(i.taskName);
        return s + (t ? (t.points || 10) : 10);
    }, 0);
    ctrl.innerHTML =
        `<span class="planner-ctrl-label">Lines:</span>` +
        ['all','nearby','none'].map(m =>
            `<button class="planner-line-btn${plannerLineMode === m ? ' planner-line-btn-active' : ''}" data-mode="${m}">${m}</button>`
        ).join('') +
        `<span class="planner-ctrl-sep"></span>` +
        `<button class="planner-line-btn${plannerPinsVisible ? ' planner-line-btn-active' : ''}" id="planner-pins-toggle">Pins</button>` +
        `<span class="planner-ctrl-sep"></span>` +
        `<span class="planner-ctrl-label">${plannerItems.length} tasks · ${pinnedCount} pinned · ${runningTotal} pts total</span>`;
    ctrl.querySelectorAll && ctrl.querySelectorAll('.planner-line-btn[data-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            plannerLineMode = btn.dataset.mode;
            redrawMapOverlays();
            renderPlanner();
        });
    });
    const pinsToggle = ctrl.querySelector('#planner-pins-toggle');
    if (pinsToggle) {
        pinsToggle.addEventListener('click', () => {
            plannerPinsVisible = !plannerPinsVisible;
            redrawMapOverlays();
            renderPlanner();
        });
    }
    container.appendChild(ctrl);

    // Drop zone when items exist (allow dragging from task list)
    const dropTop = document.createElement('div');
    dropTop.className = 'planner-drop-zone planner-drop-top';
    dropTop.textContent = '+ Drop task here (top)';
    wireExternalDrop(dropTop, 0);
    container.appendChild(dropTop);

    if (plannerItems.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'task-panel-empty';
        empty.innerHTML = 'No tasks planned yet.<br><small style="color:#5a4a20;">Use the search below or drag tasks from the Active tab.</small>';
        container.appendChild(empty);
    } else {
        // Running point total
        let runPts = 0;
        plannerItems.forEach((item, idx) => {
            const task = getTask(item.taskName);
            const pts  = task ? (task.points || 10) : 10;
            runPts += pts;
            container.appendChild(buildPlannerCard(item, task, pts, runPts, idx));

            // Drop zone between cards
            const dz = document.createElement('div');
            dz.className = 'planner-drop-zone';
            dz.textContent = '↓';
            wireExternalDrop(dz, idx + 1);
            container.appendChild(dz);
        });
    }

    // Add-task search section
    container.appendChild(buildAddSection());

    container.scrollTop = scrollTop;
}

function wireExternalDrop(el, insertIdx) {
    el.addEventListener('dragover', e => {
        e.preventDefault();
        // Internal reorder uses 'move'; external drags from task list use 'copy'
        e.dataTransfer.dropEffect = dragSrcId ? 'move' : 'copy';
        el.classList.add('planner-drop-zone-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('planner-drop-zone-over'));
    el.addEventListener('drop', e => {
        e.preventDefault();
        el.classList.remove('planner-drop-zone-over');

        // Internal reorder
        const srcId = dragSrcId;
        if (srcId) {
            const srcIdx = plannerItems.findIndex(i => i.id === srcId);
            if (srcIdx !== -1) {
                let target = insertIdx;
                if (srcIdx < target) target--; // account for removal shifting
                const [moved] = plannerItems.splice(srcIdx, 1);
                plannerItems.splice(target, 0, moved);
                savePlanner();
                redrawMapOverlays();
                renderPlanner();
                return;
            }
        }

        // External drop from task list
        const taskName = e.dataTransfer.getData('text/plain');
        if (taskName && !plannerItems.some(i => i.taskName === taskName)) {
            const newItem = { id: genId(), taskName, pinCoords: null, comments: [] };
            plannerItems.splice(insertIdx, 0, newItem);
            savePlanner();
            redrawMapOverlays();
            renderPlanner();
        }
    });
}

function buildPlannerCard(item, task, pts, runPts, idx) {
    const tier  = tierFor(pts);
    const color = tier.color;

    const card = document.createElement('div');
    card.className = 'planner-card';
    if (plannerSelectedId === item.id) card.classList.add('planner-card-selected');
    card.dataset.id   = item.id;
    card.draggable    = true;
    card.style.borderLeftColor = color;

    const pinLabel = item.pinCoords
        ? `📍 ${Math.round(item.pinCoords.lng)}, ${Math.round(item.pinCoords.lat)}`
        : '📍 Set pin';

    const commentsHtml = item.comments.length
        ? item.comments.map((c, ci) =>
            `<div class="planner-comment-item">` +
            `<span class="planner-comment-text">${esc(c)}</span>` +
            `<button class="planner-comment-del" data-id="${item.id}" data-ci="${ci}" title="Remove">✕</button>` +
            `</div>`
          ).join('')
        : '';

    card.innerHTML =
        `<div class="planner-card-header">` +
            `<span class="planner-drag-handle" title="Drag to reorder">⠿</span>` +
            `<span class="planner-order-num">${idx + 1}</span>` +
            `<span class="planner-tier-dot" style="background:${color}" title="${tier.name} (${pts} pts)"></span>` +
            `<span class="planner-card-name">${esc(task ? task.name : item.taskName)}</span>` +
            `<span class="planner-card-pts" style="color:${color}">${pts} pts</span>` +
            `<span class="planner-running-pts" title="Running total">${runPts} pts</span>` +
            `<button class="planner-remove-btn" data-id="${item.id}" title="Remove from planner">✕</button>` +
        `</div>` +
        (task ? `<div class="planner-card-desc">${esc(task.task)}</div>` : '') +
        `<div class="planner-card-pin-row">` +
            `<button class="planner-pin-btn${item.pinCoords ? ' planner-pin-set' : ''}" data-id="${item.id}">${pinLabel}</button>` +
            (item.pinCoords ? `<button class="planner-pin-clear-btn" data-id="${item.id}" title="Clear pin">✕</button>` : '') +
        `</div>` +
        (commentsHtml ? `<div class="planner-comments">${commentsHtml}</div>` : '') +
        `<div class="planner-add-comment-row">` +
            `<input class="planner-comment-input" type="text" placeholder="Add step/note..." data-id="${item.id}" autocomplete="off"/>` +
            `<button class="planner-comment-add-btn" data-id="${item.id}">＋</button>` +
        `</div>`;

    // ── Drag (internal reorder) ──────────────────────────────────
    card.addEventListener('dragstart', e => {
        dragSrcId = item.id;
        card.classList.add('planner-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.taskName);
    });
    card.addEventListener('dragend', () => {
        dragSrcId = null;
        card.classList.remove('planner-dragging');
    });

    // ── Selection (for nearby lines) ─────────────────────────────
    card.addEventListener('click', e => {
        if (e.target.closest('button, input')) return;
        plannerSelectedId = (plannerSelectedId === item.id) ? null : item.id;
        redrawMapOverlays();
        document.querySelectorAll('.planner-card').forEach(c => {
            c.classList.toggle('planner-card-selected', c.dataset.id === plannerSelectedId);
        });
    });

    // ── Remove ───────────────────────────────────────────────────
    card.querySelector('.planner-remove-btn').addEventListener('click', e => {
        e.stopPropagation();
        plannerItems = plannerItems.filter(i => i.id !== item.id);
        if (plannerSelectedId === item.id) plannerSelectedId = null;
        savePlanner();
        redrawMapOverlays();
        renderPlanner();
    });

    // ── Pin button ───────────────────────────────────────────────
    card.querySelector('.planner-pin-btn').addEventListener('click', e => {
        e.stopPropagation();
        if (pinningItemId === item.id) {
            cancelPinning();
        } else {
            startPinning(item.id);
        }
    });

    const clearPinBtn = card.querySelector('.planner-pin-clear-btn');
    if (clearPinBtn) {
        clearPinBtn.addEventListener('click', e => {
            e.stopPropagation();
            item.pinCoords = null;
            savePlanner();
            redrawMapOverlays();
            renderPlanner();
        });
    }

    // ── Comments ─────────────────────────────────────────────────
    card.querySelectorAll('.planner-comment-del').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const ci = parseInt(btn.dataset.ci, 10);
            item.comments.splice(ci, 1);
            savePlanner();
            renderPlanner();
        });
    });

    const commentInput = card.querySelector('.planner-comment-input');
    const addCommentBtn = card.querySelector('.planner-comment-add-btn');
    const submitComment = () => {
        const val = commentInput.value.trim();
        if (!val) return;
        item.comments.push(val);
        commentInput.value = '';
        savePlanner();
        renderPlanner();
    };
    addCommentBtn.addEventListener('click', e => { e.stopPropagation(); submitComment(); });
    commentInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitComment(); });
    commentInput.addEventListener('click', e => e.stopPropagation());

    return card;
}

function buildAddSection() {
    const wrap = document.createElement('div');
    wrap.className = 'planner-add-section';
    wrap.innerHTML =
        `<div class="planner-add-label">Add tasks to planner:</div>` +
        `<input id="planner-search-input" class="planner-search-input" type="text" placeholder="Search tasks..." autocomplete="off"/>` +
        `<div id="planner-search-results" class="planner-search-results"></div>`;

    const input   = wrap.querySelector('#planner-search-input');
    const results = wrap.querySelector('#planner-search-results');

    input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        results.innerHTML = '';
        if (!q || q.length < 2) return;

        const regions = window._getCurrentRegions ? window._getCurrentRegions() : null;
        const matches = allTasksRef.filter(t => {
            // Region filter: match enabled regions (null = all; tasks with no area are general, always included)
            if (regions !== null) {
                if (t.area && !regions.includes(t.area)) return false;
            }
            const hay = `${t.name} ${t.task} ${t.area || ''}`.toLowerCase();
            return hay.includes(q);
        }).slice(0, 12);

        if (matches.length === 0) {
            results.innerHTML = '<div class="planner-no-results">No tasks found.</div>';
            return;
        }

        matches.forEach(task => {
            const alreadyIn = plannerItems.some(i => i.taskName === task.name);
            const tier = tierFor(task.points || 10);
            const row = document.createElement('div');
            row.className = 'planner-search-result';
            row.draggable = !alreadyIn;
            row.innerHTML =
                `<span class="planner-search-tier-dot" style="background:${tier.color}"></span>` +
                `<span class="planner-search-result-name">${esc(task.name)}</span>` +
                `<span class="planner-search-result-pts" style="color:${tier.color}">${task.points} pts</span>` +
                `<button class="planner-search-add-btn" ${alreadyIn ? 'disabled' : ''}>${alreadyIn ? '✓' : '+ Add'}</button>`;

            if (!alreadyIn) {
                row.querySelector('.planner-search-add-btn').addEventListener('click', () => {
                    plannerItems.push({ id: genId(), taskName: task.name, pinCoords: null, comments: [] });
                    savePlanner();
                    input.value = '';
                    results.innerHTML = '';
                    redrawMapOverlays();
                    renderPlanner();
                });
                // Allow dragging from search results directly onto the drop zones
                row.addEventListener('dragstart', e => {
                    dragSrcId = null;
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('text/plain', task.name);
                });
            }
            results.appendChild(row);
        });
    });

    return wrap;
}

// ─── Public API ───────────────────────────────────────────────────
// Called by leaflet.tasks.js to add a task from the active list
window._plannerAddTask = function(taskName) {
    if (plannerItems.some(i => i.taskName === taskName)) {
        // Already added – just switch to planner tab
        activatePlannerTab();
        return;
    }
    plannerItems.push({ id: genId(), taskName, pinCoords: null, comments: [] });
    savePlanner();
    redrawMapOverlays();
    activatePlannerTab();
};

function activatePlannerTab() {
    const plannerTab = document.querySelector('.task-tab[data-tab="planner"]');
    if (plannerTab && !plannerTab.classList.contains('task-tab-active')) {
        plannerTab.click();
    } else {
        renderPlanner();
    }
}

// ─── Tab integration ──────────────────────────────────────────────
function setupTabSwitching() {
    const plannerContainer = document.getElementById('planner-container');
    const taskList         = document.getElementById('task-list');
    const taskStats        = document.getElementById('task-panel-stats');
    const taskSearch       = document.getElementById('task-search');
    const taskGenToggle    = document.getElementById('task-general-toggle');
    const taskSpawnsBtn    = document.getElementById('task-spawns-toggle');

    if (!plannerContainer) return;

    document.querySelectorAll('.task-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;

            if (tab === 'planner') {
                plannerContainer.style.display = '';
                if (taskList)      taskList.style.display      = 'none';
                if (taskStats)     taskStats.style.display     = 'none';
                if (taskSearch)    taskSearch.style.display    = 'none';
                if (taskGenToggle) taskGenToggle.style.display = 'none';
                if (taskSpawnsBtn) taskSpawnsBtn.style.display = 'none';
                renderPlanner();
            } else {
                plannerContainer.style.display = 'none';
                if (taskList)      taskList.style.display      = '';
                if (taskStats)     taskStats.style.display     = '';
                if (taskSearch)    taskSearch.style.display    = '';
                if (taskGenToggle) taskGenToggle.style.display = '';
                if (taskSpawnsBtn) taskSpawnsBtn.style.display = '';
                cancelPinning();
            }
        });
    });
}

// ─── Escape to cancel pinning ─────────────────────────────────────
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && pinningMode) cancelPinning();
});

// ─── Bootstrap ────────────────────────────────────────────────────
loadPlanner();
setupTabSwitching();

function initPlanner(map) {
    plannerMap = map;

    // Try to get allTasks; retry until leaflet.tasks.js populates it
    function tryGetTasks() {
        if (window._allTasksRef && window._allTasksRef.length > 0) {
            allTasksRef = window._allTasksRef;
            // Render if planner tab is already active
            if (document.querySelector('.planner-card') !== null ||
                document.querySelector('.task-tab[data-tab="planner"]')?.classList.contains('task-tab-active')) {
                renderPlanner();
            }
        } else {
            setTimeout(tryGetTasks, 250);
        }
    }
    tryGetTasks();
}

if (window.runescape_map) {
    initPlanner(window.runescape_map);
} else {
    // Poll for map — main_osrs.js assigns it synchronously so it's typically ready
    let attempts = 0;
    const mapPoll = setInterval(() => {
        if (window.runescape_map || ++attempts > 40) {
            clearInterval(mapPoll);
            if (window.runescape_map) initPlanner(window.runescape_map);
        }
    }, 200);
}
