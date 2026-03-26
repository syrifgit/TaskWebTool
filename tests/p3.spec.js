const { test, expect } = require('@playwright/test');
const { clearAppStorage } = require('./helpers/app');

const ALL_REGIONS = [
    'Asgarnia',
    'Desert',
    'Fremennik',
    'Kandarin',
    'Karamja',
    'Kourend',
    'Misthalin',
    'Morytania',
    'Tirannwn',
    'Varlamore',
    'Wilderness',
];

async function gotoTasksReady(page) {
    await page.goto('/');
    await expect(page.locator('#task-panel')).toBeVisible();
    await page.waitForFunction(
        () => Array.isArray(window._allTasksRef) && window._allTasksRef.length > 0,
        { timeout: 30000 }
    );
}

async function openTaskSearch(page) {
    await page.locator('#task-search-open-btn').click();
    await expect(page.locator('#task-search-overlay')).toBeVisible();
}

test.describe('Task search region coverage', () => {
    test.beforeEach(async ({ page }) => {
        await clearAppStorage(page);
        await page.evaluate(() => localStorage.removeItem('storeline_enabled_regions'));
    });

    for (const region of ALL_REGIONS) {
        test(`task search has tasks for ${region} region`, async ({ page }) => {
            await gotoTasksReady(page);

            // Default enabled region is Varlamore; swap to target region if different
            if (region !== 'Varlamore') {
                await page.locator('.leaflet-control-region-button[data-region="Varlamore"]').click();
                await page.locator(`.leaflet-control-region-button[data-region="${region}"]`).click();
            }

            await openTaskSearch(page);

            // Disable general tasks so only region-specific tasks are shown
            await page.locator('#task-show-general').uncheck();

            await expect(page.locator('#task-search-results .task-card').first()).toBeVisible({ timeout: 15000 });
        });
    }

    test('task search has general tasks', async ({ page }) => {
        await gotoTasksReady(page);

        // Disable Varlamore so only general tasks (no area) remain
        await page.locator('.leaflet-control-region-button[data-region="Varlamore"]').click();

        await openTaskSearch(page);

        // "Show general tasks" checkbox is checked by default
        await expect(page.locator('#task-show-general')).toBeChecked();

        await expect(page.locator('#task-search-results .task-card').first()).toBeVisible({ timeout: 15000 });
        await expect(
            page.locator('#task-search-results .task-card-area', { hasText: 'General' }).first()
        ).toBeVisible();
    });
});
