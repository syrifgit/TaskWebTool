'use strict';

import "../../js/leaflet.js";
import "../../js/layers.js";
import "../../js/plugins/leaflet.plane.js";
import "../../js/plugins/leaflet.displays.js";
import { scheduleJsonWarmup } from "../../js/data/json-cache.js";


void function (global) {
    let runescape_map = global.runescape_map = L.gameMap('map', {

        maxBounds: [[-1000, -1000], [12800 + 1000, 12800 + 1000]],
        maxBoundsViscosity: 0.5,

        customZoomControl: true,
        fullscreenControl: true,
        planeControl: true,
        positionControl: true,
        messageBox: true,
        rect: true,
        initialMapId: -1,
        plane: 0,
        x: 1688,
        y: 3100,
        minPlane: 0,
        maxPlane: 3,
        minZoom: 0,
        maxZoom: 5,
        zoom: 1,
        doubleClickZoom: false,
        showMapBorder: true,
        enableUrlLocation: true
    });

    // Create global region filter control
    let regionControl = L.control.regionFilter({
        folder: "data_osrs"
    }).addTo(runescape_map);

    // Expose for task panel and notify any listeners
    window._regionControl = regionControl;
    window.dispatchEvent(new CustomEvent('regionControlReady', { detail: regionControl }));

    // Unified search control for Objects, NPCs, and Shops
    let unifiedSearch = L.control.display.unifiedSearch({
        folder: "data_osrs",
        show3d: true,
        regionControl: regionControl
    }).addTo(runescape_map);

    // Expose for task panel strategy
    window._unifiedSearch = unifiedSearch;

    // All shops toggle button
    L.control.allShopsToggle({
        folder: 'data_osrs',
        regionControl: regionControl,
        position: 'bottomleft'
    }).addTo(runescape_map);

    L.control.pickpocketToggle({
        folder: 'data_osrs',
        regionControl: regionControl,
        position: 'bottomleft'
    }).addTo(runescape_map);

    // Explv tiles — coordinate mapping from CRS.Simple to Explv's tile paths:
    //   ez = clamp(tz+6, 4, 11),  offsets: x_origin=960, y_origin=1216
    // NOTE: minNativeZoom MUST be 2. The Explv offsets (960, 1216) are only
    // divisible by the CRS tile scale at tz>=2, so tile grid alignment only
    // holds at zoom 2 and above. Below zoom 2 Leaflet scales up zoom-2 tiles.
    const explvLayer = L.tileLayer('', {
        minNativeZoom: 2,
        maxNativeZoom: 5,
        noWrap: true,
        attribution:
            'Game data &copy; <a href="https://oldschool.runescape.wiki" target="_blank" rel="noopener">OSRS Wiki</a>' +
            ' (<a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC-BY-SA 3.0</a>)' +
            ' | Tiles by <a href="https://github.com/Explv/osrs_map_tiles" target="_blank" rel="noopener">Explv</a>',
    });
    explvLayer.getTileUrl = function (coords) {
        const plane = (runescape_map && runescape_map._plane) || 0;
        const ez = Math.min(11, Math.max(4, coords.z + 6));
        const scaleCRS   = 256 / Math.pow(2, coords.z);
        const scaleExplv = Math.pow(2, 14 - ez);
        const osrsX =  coords.x * scaleCRS;
        const osrsY = -coords.y * scaleCRS;
        const ex     = Math.floor((osrsX - 960)  / scaleExplv);
        const ey_xyz = Math.floor(Math.pow(2, ez) - (osrsY - 1216) / scaleExplv);
        const ey_tms = Math.pow(2, ez) - 1 - ey_xyz;
        return `https://raw.githubusercontent.com/Explv/osrs_map_tiles/master/${plane}/${ez}/${ex}/${ey_tms}.png`;
    };
    explvLayer.createTile = function (coords, done) {
        const tile = L.TileLayer.prototype.createTile.call(this, coords, done);
        tile.onerror = (e) => e.preventDefault();
        return tile;
    };
    runescape_map.on('planechange', () => explvLayer.redraw());
    explvLayer.addTo(runescape_map).bringToBack();

    scheduleJsonWarmup([
        { url: 'data_osrs/monsters.json' },
        { url: 'data_osrs/scenery.json' },
        { url: 'data_osrs/storeline.json' },
        { url: 'data_osrs/item_spawns.json' },
        { url: 'data_osrs/names.json', options: { fallback: null } },
        { url: 'data_osrs/pickpocketable_npc_names.json' },
    ]);
}
(this || window);
