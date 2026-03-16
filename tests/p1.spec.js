const { test, expect } = require('@playwright/test');
const { clearAppStorage, gotoApp, openPlannerTab, seedPlannerWithFirstTasks } = require('./helpers/app');

async function addPlannerGroup(page, name) {
  page.once('dialog', (dialog) => dialog.accept(name));
  await page.locator('#planner-group-add').click();
}

test.describe('P1 feature coverage', () => {
  test.beforeEach(async ({ page }) => {
    await clearAppStorage(page);
  });

  test('group reorder drag persists after reload', async ({ page }) => {
    await gotoApp(page);
    await seedPlannerWithFirstTasks(page, 1);
    await openPlannerTab(page);

    await addPlannerGroup(page, 'Route A');
    await addPlannerGroup(page, 'Route B');
    await expect(page.locator('.planner-group')).toHaveCount(3);

    const firstGroupName = page.locator('.planner-group').first().locator('.planner-group-name');
    await expect(firstGroupName).toHaveValue('Main');

    const sourceGroup = page.locator('.planner-group').first();
    const sourceHandle = sourceGroup.locator('.planner-group-drag-handle');
    const targetDropZone = page.locator('.planner-group-drop-zone').last();

    await sourceHandle.dispatchEvent('mousedown');
    await sourceGroup.dragTo(targetDropZone);

    const firstGroupAfter = page.locator('.planner-group').first().locator('.planner-group-name');
    await expect(firstGroupAfter).toHaveValue('Route A');

    await page.reload();
    await openPlannerTab(page);
    await expect(page.locator('.planner-group').first().locator('.planner-group-name')).toHaveValue('Route A');
    await expect(page.locator('.planner-group').nth(2).locator('.planner-group-name')).toHaveValue('Main');
  });

  test('group delete moves tasks to fallback group', async ({ page }) => {
    await gotoApp(page);
    await seedPlannerWithFirstTasks(page, 2);
    await openPlannerTab(page);

    await addPlannerGroup(page, 'Route B');
    await expect(page.locator('.planner-group')).toHaveCount(2);

    const secondGroup = page.locator('.planner-group').nth(1);
    const groupSelect = page.locator('#planner-target-group');
    await groupSelect.selectOption({ label: 'Route B' });

    await page.fill('#planner-search-input', 'kill');
    const routeBAddRow = page.locator('.planner-search-result').first();
    const movedTaskName = (await routeBAddRow.locator('.planner-search-result-name').innerText()).trim();
    await routeBAddRow.locator('.planner-search-add-btn').click();

    await expect(secondGroup.locator('.planner-card')).toHaveCount(1);
    await expect(secondGroup.locator('.planner-card .planner-card-name', { hasText: movedTaskName }).first()).toBeVisible();

    await secondGroup.locator('.planner-group-remove').click();

    await expect(page.locator('.planner-group')).toHaveCount(1);
    await expect(page.locator('.planner-group').first().locator('.planner-card')).toHaveCount(3);
    await expect(page.locator('.planner-group').first().locator('.planner-card .planner-card-name', { hasText: movedTaskName }).first()).toBeVisible();
  });

  test('planner inline search add inserts into selected target group', async ({ page }) => {
    await gotoApp(page);
    await openPlannerTab(page);

    await addPlannerGroup(page, 'Route B');
    const groupSelect = page.locator('#planner-target-group');
    await groupSelect.selectOption({ label: 'Route B' });

    await page.fill('#planner-search-input', 'kill');
    const results = page.locator('.planner-search-result');
    await expect(results.first()).toBeVisible();

    const row = results.first();
    const taskName = (await row.locator('.planner-search-result-name').innerText()).trim();
    await row.locator('.planner-search-add-btn').click();

    const routeBGroup = page.locator('.planner-group').filter({ has: page.locator('.planner-group-name[value="Route B"]') }).first();
    await expect(routeBGroup.locator('.planner-card .planner-card-name', { hasText: taskName }).first()).toBeVisible();
  });

  test('custom step creation persists across reload', async ({ page }) => {
    await gotoApp(page);
    await openPlannerTab(page);

    await page.fill('#planner-virtual-name-input', 'Buy stew from shop');
    await page.fill('#planner-virtual-desc-input', 'Talk to shopkeeper first');
    await page.locator('#planner-virtual-add-btn').click();

    const virtualCard = page.locator('.planner-card-virtual').first();
    await expect(virtualCard).toBeVisible();
    await expect(virtualCard.locator('.planner-virtual-name')).toHaveValue('Buy stew from shop');

    await page.reload();
    await openPlannerTab(page);
    await expect(page.locator('.planner-card-virtual').first().locator('.planner-virtual-name')).toHaveValue('Buy stew from shop');
  });

  test('custom step edited name persists', async ({ page }) => {
    await gotoApp(page);
    await openPlannerTab(page);

    await page.fill('#planner-virtual-name-input', 'Buy stew from shop');
    await page.fill('#planner-virtual-desc-input', 'Talk to shopkeeper first');
    await page.locator('#planner-virtual-add-btn').click();

    const virtualCard = page.locator('.planner-card-virtual').first();
    const virtualNameInput = virtualCard.locator('.planner-virtual-name');
    await virtualNameInput.fill('Buy stew and deliver');
    await virtualNameInput.blur();

    await page.reload();
    await openPlannerTab(page);
    await expect(page.locator('.planner-card-virtual').first().locator('.planner-virtual-name')).toHaveValue('Buy stew and deliver');
  });

  test('planner comments add and remove', async ({ page }) => {
    await gotoApp(page);
    await seedPlannerWithFirstTasks(page, 1);
    await openPlannerTab(page);

    const card = page.locator('.planner-card').first();
    await card.locator('.planner-comment-input').fill('Bring teleport tabs');
    await card.locator('.planner-comment-input').press('Enter');

    await expect(card.locator('.planner-comment-text', { hasText: 'Bring teleport tabs' })).toBeVisible();

    await card.locator('.planner-comment-del').first().click();
    await expect(card.locator('.planner-comment-text', { hasText: 'Bring teleport tabs' })).toHaveCount(0);
  });

  test('planner clear pin removes selected location', async ({ page }) => {
    await gotoApp(page);
    await seedPlannerWithFirstTasks(page, 1);
    await openPlannerTab(page);

    const card = page.locator('.planner-card').first();
    await card.locator('.planner-pin-btn').click();
    await page.locator('#map').click({ position: { x: 120, y: 120 } });

    const clearBtn = card.locator('.planner-pin-clear-btn');
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();

    await expect(card.locator('.planner-pin-clear-btn')).toHaveCount(0);
    await expect(card.locator('.planner-pin-btn')).toHaveText('📍 Set pin');
  });

  test('import malformed JSON shows error and keeps state', async ({ page }) => {
    await gotoApp(page);
    await seedPlannerWithFirstTasks(page, 1);
    await openPlannerTab(page);

    await expect(page.locator('.planner-card')).toHaveCount(1);

    const dialogPromise = page.waitForEvent('dialog');
    await page.locator('#planner-import-input').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"broken":', 'utf8')
    });
    const dialog = await dialogPromise;
    expect(dialog.message()).toContain('Failed to parse JSON');
    await dialog.accept();

    await expect(page.locator('.planner-card')).toHaveCount(1);
  });

  test('item spawns toggle updates button state', async ({ page }) => {
    await gotoApp(page);

    const btn = page.locator('#task-spawns-toggle');
    await expect(btn).toHaveText('Show Item Spawns');

    await btn.click();
    await expect(btn).toHaveText('Hide Item Spawns');
    await expect(btn).toHaveClass(/task-spawns-btn-active/);

    await btn.click();
    await expect(btn).toHaveText('Show Item Spawns');
  });
});
