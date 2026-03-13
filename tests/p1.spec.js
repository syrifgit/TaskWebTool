const { test, expect } = require('@playwright/test');

async function clearAppStorage(page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.removeItem('league_tasks_completed');
    localStorage.removeItem('league_planner_v1');
  });
}

async function gotoApp(page) {
  await page.goto('/');
  await expect(page.locator('#task-panel')).toBeVisible();
  await expect(page.locator('#task-list .task-card').first()).toBeVisible({ timeout: 30000 });
}

async function openPlannerTab(page) {
  await page.locator('.task-tab[data-tab="planner"]').click();
  await expect(page.locator('#planner-container')).toBeVisible();
  await expect(page.locator('#planner-list')).toBeVisible();
}

async function seedPlannerWithFirstTasks(page, count) {
  await page.waitForFunction((n) => Array.isArray(window._allTasksRef) && window._allTasksRef.length >= n, count);
  const names = await page.evaluate((n) => window._allTasksRef.slice(0, n).map((t) => t.name), count);
  for (const taskName of names) {
    await page.evaluate((name) => window._plannerAddTask(name), taskName);
  }
  return names;
}

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
    const seeded = await seedPlannerWithFirstTasks(page, 2);
    await openPlannerTab(page);

    await addPlannerGroup(page, 'Route B');
    await expect(page.locator('.planner-group')).toHaveCount(2);

    const firstGroup = page.locator('.planner-group').first();
    const secondGroup = page.locator('.planner-group').nth(1);

    await firstGroup.locator('.planner-card').first().dragTo(secondGroup.locator('.planner-drop-top'));
    await expect(secondGroup.locator('.planner-card')).toHaveCount(1);

    await secondGroup.locator('.planner-group-remove').click();

    await expect(page.locator('.planner-group')).toHaveCount(1);
    await expect(page.locator('.planner-group').first().locator('.planner-card')).toHaveCount(2);
    await expect(page.locator('.planner-group').first().locator('.planner-card .planner-card-name', { hasText: seeded[0] }).first()).toBeVisible();
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
