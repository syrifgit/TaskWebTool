'use strict';

/**
 * plugin-route-bridge.js
 *
 * Format bridge between the tasks-tracker-plugin CustomRoute JSON and the
 * LeaguesMap planner (v3) JSON.
 * 
 */

function _genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ─── Plugin → LeaguesMap ─────────────────────────────────────────────────────

/**
 * Converts a plugin CustomRoute JSON to a LeaguesMap v3 planner object ready
 * for `applyPlanData`.
 *
 * taskName is intentionally left null — normalizePlannerItem resolves it
 * at render time via allTasksById.
 *
 * The returned object has an extra `_pluginRouteName` field (stripped before
 * any save) used to name the imported plan.
 *
 * @param {object} data - Parsed plugin CustomRoute JSON.
 * @returns {object} LeaguesMap v3 route object.
 */
export function convertPluginRouteToMapData(data) {
    const sections = (data.sections || []).map((section, sIdx) => {
        const name = section.name || `Section ${sIdx + 1}`;
        const rawItems = Array.isArray(section.items) ? section.items : [];
        const items = rawItems.flatMap(item => {
            if (item.taskId != null) {
                return [{
                    pinCoords: item.location ? { lat: item.location.y, lng: item.location.x } : null,
                    comments: item.note ? item.note.split('\n\n') : [],
                    taskId: item.taskId,
                }];
            }
            if (item.customItem) {
                const ci  = item.customItem;
                const note = item.note != null ? item.note : null;
                const customName = ci.name || 'Custom Stop';
                return [{
                    id: ci.id,
                    virtual: true,
                    customName,
                    customDesc: ci.label || '',
                    pinCoords: item.location ? { lat: item.location.y, lng: item.location.x, } : null,
                    comments: note ? note.split('\n\n') : [],
                }];
            }
            return [];
        });
        return { id: section.id || _genId(), name, items };
    });

    if (!data.id) {
        throw new Error("Plugin route data must have an id");
    }

    return {
        id: data.id,
        version: 3,
        taskType: data.taskType,
        source: 'GrootsLeagueMap',
        sections,
        _pluginRouteName: data.name || null,
    };
}

// ─── LeaguesMap → Plugin ─────────────────────────────────────────────────────

/**
 * Builds a plugin CustomRoute JSON from an already-prepared sections array
 * (as returned by `buildExportSections()` in the planner) and the route name.
 *
 * Keeping this pure (no planner-state access) makes it independently testable.
 *
 * @param {Array}  exportSections - Output of `buildExportSections()`.
 * @param {string} routeName      - Name for the plugin route.
 * @returns {object} Plugin CustomRoute JSON.
 */
export function convertMapDataToPluginRoute(exportSections, routeName, taskType) {
    const pluginSections = exportSections.map(section => {
        const items = (section.items || []).flatMap(item => {
            if (item.virtual) {
                const customItem = { id: _genId().slice(0, 8) };
                if (item.id) customItem.id = item.id;
                if (item.customDesc) customItem.description = item.customDesc;
                if (item.customName) customItem.label  = item.customName;
                const routeItem = { customItem };
                if (Array.isArray(item.comments) && item.comments.length) {
                    routeItem.note = item.comments.join('\n\n');
                }
                if (item.pinCoords != null) {
                    routeItem.location = { x: Math.floor(item.pinCoords.lng), y: Math.floor(item.pinCoords.lat), plane: 0 };
                }
                return routeItem;
            }
            if (item.taskId == null) return [];
            
            const routeItem = { taskId: item.taskId };
            if (Array.isArray(item.comments) && item.comments.length) {
                routeItem.note = item.comments.join('\n\n');
            }
            if (item.pinCoords != null) {
                routeItem.location = { x: Math.floor(item.pinCoords.lng), y: Math.floor(item.pinCoords.lat), plane: 0 };
            }
            return routeItem;        
        });
        return { id: section.id || genId(), name: section.name || 'Section', items };
    });

    return {
        id: exportSections.id || genId(),
        name: routeName,
        taskType: taskType,
        sections: pluginSections,
    };
}

/**
 * Merge existing pinCoords for task items where imported pinCoords is null.
 * Used to preserve user-placed pins when importing plugin routes.
 * @param {object} converted - LeaguesMap route object (from plugin)
 * @param {Array} existingSections - Current LeaguesMap sections (plannerGroups)
 * @returns {object} Mutated converted object
 */
export function mergeExistingPins(converted, existingSections) {
    const existing = new Map();
    const existingCustom = new Map();
    for (const group of existingSections || []) {
        for (const item of group.items || []) {
            if (item.taskId != null && item.pinCoords != null) {
                existing.set(item.taskId, item.pinCoords);
            }
            if (item.virtual && item.id && item.pinCoords != null) {
                existingCustom.set(item.id, item.pinCoords);
            }
        }
    }
    
    for (const section of converted.sections || []) {
        for (const imported of section.items) {
            // has a task id
            if (imported.taskId != null) {
                // already exists a task with pin
                if (existing.has(imported.taskId)) {
                    const importedCoords = imported.pinCoords;
                    const existingCoords = existing.get(imported.taskId);
                    const importedPrec = getPrecision(importedCoords);
                    const prevPrec = getPrecision(existingCoords);
                    if (importedCoords == null || importedPrec < prevPrec) {
                        console.log("imported task pin precision is worse, using existing coords for taskId", imported.taskId, { importedCoords, existingCoords });
                        imported.pinCoords = existingCoords;
                    }
                }
            }
            // virtual custom item with id
            if (imported.virtual && imported.id) {
                if (existingCustom.has(imported.id)) {
                    const importedCoords = imported.pinCoords;
                    const existingCoords = existingCustom.get(imported.id);
                    const importedPrec = getPrecision(importedCoords);
                    const prevPrec = getPrecision(existingCoords);
                    if (importedCoords == null || importedPrec < prevPrec) {
                        console.log("imported custom item pin precision is worse, using existing coords for id", imported.id, { importedCoords, existingCoords });
                        imported.pinCoords = existingCoords;
                    }
                }
            }
        }
    }
    return converted;
}

function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function getPrecision(coord) {
    if (!coord) return 0;
    const latDec = (coord.lat.toString().split('.')[1] || '').length;
    const lngDec = (coord.lng.toString().split('.')[1] || '').length;
    return Math.max(latDec, lngDec);
}