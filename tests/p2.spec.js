const { test, expect } = require('@playwright/test');
const { clearAppStorage, gotoApp, openPlannerTab, seedPlannerWithFirstTasks } = require('./helpers/app');

test.describe('P2 comprehensive feature coverage', () => {
  test.beforeEach(async ({ page }) => {
    await clearAppStorage(page);
  });

  test('active/completed tabs and reset all flow', async ({ page }) => {
    await gotoApp(page);

    const firstCard = page.locator('#task-list .task-card').first();
    const taskName = (await firstCard.locator('.task-card-name').innerText()).trim();
    await firstCard.locator('.task-card-checkbox').click({ force: true });

    const completedTab = page.locator('.task-tab[data-tab="completed"]');
    await expect(completedTab).toContainText('Completed (1)');
    await completedTab.click();

    await expect(page.locator('#task-list .task-card .task-card-name', { hasText: taskName }).first()).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('.task-reset-btn').click();

    await expect(completedTab).toHaveText('Completed');
    await expect(page.locator('#task-list .task-panel-empty')).toContainText('No completed tasks yet.');
  });

  test('show general tasks toggle affects visible task list', async ({ page }) => {
    await gotoApp(page);

    await expect(page.locator('#task-list .task-card-area', { hasText: 'General' })).toHaveCount(0);
    await page.locator('#task-show-general').check();
    await expect(page.locator('#task-list .task-card-area', { hasText: 'General' }).first()).toBeVisible();

    await page.locator('#task-show-general').uncheck();
    await expect(page.locator('#task-list .task-card-area', { hasText: 'General' })).toHaveCount(0);
  });

  test('planner group rename persists after reload', async ({ page }) => {
    await gotoApp(page);
    await seedPlannerWithFirstTasks(page, 1);
    await openPlannerTab(page);

    const groupName = page.locator('.planner-group').first().locator('.planner-group-name');
    await groupName.fill('Boss Route');
    await groupName.blur();

    await expect(page.locator('.planner-group').first().locator('.planner-group-name')).toHaveValue('Boss Route');

    await page.reload();
    await openPlannerTab(page);
    await expect(page.locator('.planner-group').first().locator('.planner-group-name')).toHaveValue('Boss Route');
  });

  test('pickpocket toggle respects region filter and popup has wiki links', async ({ page }) => {
    await gotoApp(page);

    const toggle = page.locator('.leaflet-control-pickpocket-btn');
    const varlamoreButton = page.locator('.leaflet-control-region-button[data-region="Varlamore"]');
    const misthalinButton = page.locator('.leaflet-control-region-button[data-region="Misthalin"]');

    await varlamoreButton.click();
    await toggle.click();

    await page.waitForTimeout(300);
    await expect(page.locator('.pickpocket-npc-marker')).toHaveCount(0);
    await expect(page.locator('.leaflet-control-pickpocket-panel')).toBeVisible();
    await expect(page.locator('.leaflet-control-pickpocket-list')).not.toContainText('Loading...', { timeout: 15000 });
    await expect(page.locator('.leaflet-control-pickpocket-list')).toContainText('No results');

    await misthalinButton.click();
    await page.waitForFunction(() => document.querySelectorAll('.pickpocket-npc-marker').length > 0);
    const firstRow = page.locator('[data-pickpocket-name]').first();
    await expect(firstRow).toBeVisible();

    const beforeCenter = await page.evaluate(() => {
      const center = window.runescape_map.getCenter();
      return { lat: center.lat, lng: center.lng };
    });

    await firstRow.click();
    await expect(firstRow).toHaveClass(/is-selected/);

    const afterCenter = await page.evaluate(() => {
      const center = window.runescape_map.getCenter();
      return { lat: center.lat, lng: center.lng };
    });

    expect(afterCenter.lat).not.toBe(beforeCenter.lat);
    expect(afterCenter.lng).not.toBe(beforeCenter.lng);

    const popupLink = page.locator('.leaflet-popup-content .popup-pickpocket-entry a').first();
    await expect(popupLink).toBeVisible();
    await expect(popupLink).toHaveAttribute('href', /oldschool\.runescape\.wiki\/w\//);
  });

  test('planner group collapse state persists after reload', async ({ page }) => {
    await gotoApp(page);
    await seedPlannerWithFirstTasks(page, 2);
    await openPlannerTab(page);

    const firstGroup = page.locator('.planner-group').first();
    await expect(firstGroup.locator('.planner-group-body')).toBeVisible();

    await firstGroup.locator('.planner-group-toggle').click();
    await expect(firstGroup.locator('.planner-group-body')).toHaveCount(0);

    await page.reload();
    await openPlannerTab(page);
    await expect(page.locator('.planner-group').first().locator('.planner-group-body')).toHaveCount(0);
  });

  test('planner pin set persists and clear persists', async ({ page }) => {
    await gotoApp(page);
    await seedPlannerWithFirstTasks(page, 1);
    await openPlannerTab(page);

    const card = page.locator('.planner-card').first();
    await card.locator('.planner-pin-btn').click();
    await page.locator('#map').click({ position: { x: 130, y: 130 } });

    const pinnedText = await card.locator('.planner-pin-btn').innerText();
    expect(pinnedText).toMatch(/📍\s*\d+\s*,\s*\d+/);

    await page.reload();
    await openPlannerTab(page);

    const reloadedCard = page.locator('.planner-card').first();
    await expect(reloadedCard.locator('.planner-pin-clear-btn')).toBeVisible();

    await reloadedCard.locator('.planner-pin-clear-btn').click();
    await expect(reloadedCard.locator('.planner-pin-clear-btn')).toHaveCount(0);

    await page.reload();
    await openPlannerTab(page);
    await expect(page.locator('.planner-card').first().locator('.planner-pin-btn')).toHaveText('📍 Set pin');
  });

  test('planner line mode and pins visibility controls update state', async ({ page }) => {
    await gotoApp(page);
    await seedPlannerWithFirstTasks(page, 2);
    await openPlannerTab(page);

    const noneBtn = page.locator('.planner-line-btn[data-mode="none"]');
    const nearbyBtn = page.locator('.planner-line-btn[data-mode="nearby"]');
    const allBtn = page.locator('.planner-line-btn[data-mode="all"]');

    await noneBtn.click();
    await expect(noneBtn).toHaveClass(/planner-line-btn-active/);

    await nearbyBtn.click();
    await expect(nearbyBtn).toHaveClass(/planner-line-btn-active/);

    await allBtn.click();
    await expect(allBtn).toHaveClass(/planner-line-btn-active/);

    const pinsBtn = page.locator('#planner-pins-toggle');
    await expect(pinsBtn).toHaveClass(/planner-line-btn-active/);
    await pinsBtn.click();
    await expect(pinsBtn).not.toHaveClass(/planner-line-btn-active/);
    await pinsBtn.click();
    await expect(pinsBtn).toHaveClass(/planner-line-btn-active/);
  });

  test('planner import legacy flat array format works', async ({ page }) => {
    await gotoApp(page);
    await openPlannerTab(page);

    const legacyImport = JSON.stringify([
      { id: 'legacy-1', taskName: 'Achieve Your First Level 10', pinCoords: null, comments: [] }
    ]);

    await page.locator('#planner-import-input').setInputFiles({
      name: 'legacy-planner.json',
      mimeType: 'application/json',
      buffer: Buffer.from(legacyImport, 'utf8')
    });

    await expect(page.locator('.planner-card')).toHaveCount(1);
    await expect(page.locator('.planner-card .planner-card-name', { hasText: 'Achieve Your First Level 10' }).first()).toBeVisible();
  });

  test('planner import unknown format shows alert and keeps current state', async ({ page }) => {
    await gotoApp(page);
    await seedPlannerWithFirstTasks(page, 1);
    await openPlannerTab(page);

    await expect(page.locator('.planner-card')).toHaveCount(1);

    const dialogPromise = page.waitForEvent('dialog');
    await page.locator('#planner-import-input').setInputFiles({
      name: 'unknown-format.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"version":2,"foo":[]}', 'utf8')
    });

    const dialog = await dialogPromise;
    expect(dialog.message()).toContain('Unrecognised planner file format.');
    await dialog.accept();

    await expect(page.locator('.planner-card')).toHaveCount(1);
  });
});
