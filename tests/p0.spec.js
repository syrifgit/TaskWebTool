const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { clearAppStorage, gotoApp, openPlannerTab, seedPlannerWithFirstTasks } = require('./helpers/app');

test.describe('P0 feature coverage', () => {
  test.beforeEach(async ({ page }) => {
    await clearAppStorage(page);
  });

  test('task panel boot, search, complete + persistence', async ({ page }) => {
    await gotoApp(page);

    const cards = page.locator('#task-list .task-card');
    await expect(cards.first()).toBeVisible();

    await page.fill('#task-search', 'zzzz_not_a_real_task_query');
    await expect(page.locator('#task-list .task-panel-empty')).toContainText('No tasks match');

    await page.fill('#task-search', '');
    await expect(cards.first()).toBeVisible();

    const firstCard = cards.first();
    const taskName = (await firstCard.locator('.task-card-name').innerText()).trim();

    await firstCard.locator('.task-card-checkbox').click({ force: true });
    await page.locator('.task-tab[data-tab="completed"]').click();
    await expect(page.locator('#task-list .task-card .task-card-name', { hasText: taskName }).first()).toBeVisible();

    await page.reload();
    await expect(page.locator('#task-panel')).toBeVisible();
    await expect(page.locator('#task-list .task-card').first()).toBeVisible({ timeout: 30000 });
    await page.locator('.task-tab[data-tab="completed"]').click();
    await expect(page.locator('#task-list .task-card .task-card-name', { hasText: taskName }).first()).toBeVisible();
  });

  test('planner add task and prevent duplicates', async ({ page }) => {
    await gotoApp(page);

    const firstCard = page.locator('#task-list .task-card').first();
    const taskName = (await firstCard.locator('.task-card-name').innerText()).trim();

    await firstCard.locator('.task-card-plan-btn').click();
    await expect(page.locator('.task-tab[data-tab="planner"]')).toHaveClass(/task-tab-active/);

    const plannerTaskNameLocator = page.locator('.planner-card .planner-card-name', { hasText: taskName });
    await expect(plannerTaskNameLocator.first()).toBeVisible();

    await page.evaluate((name) => window._plannerAddTask(name), taskName);
    await expect(plannerTaskNameLocator).toHaveCount(1);
  });

  test('planner export and import JSON restores state', async ({ page }) => {
    await gotoApp(page);
    await seedPlannerWithFirstTasks(page, 2);
    await openPlannerTab(page);

    await expect(page.locator('.planner-card')).toHaveCount(2);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#planner-export-btn').click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    const exportedJson = fs.readFileSync(downloadPath, 'utf8');
    const exported = JSON.parse(exportedJson);
    expect(Array.isArray(exported.groups)).toBeTruthy();
    expect(exported.groups.length).toBeGreaterThan(0);

    await page.evaluate(() => {
      localStorage.setItem('league_planner_v1', JSON.stringify({ version: 2, groups: [{ id: 'g1', name: 'Main', collapsed: false, items: [] }] }));
    });

    await page.reload();
    await openPlannerTab(page);
    await expect(page.locator('.planner-card')).toHaveCount(0);

    await page.locator('#planner-import-input').setInputFiles({
      name: 'planner-import.json',
      mimeType: 'application/json',
      buffer: Buffer.from(exportedJson, 'utf8')
    });

    await expect(page.locator('.planner-card')).toHaveCount(2);
  });

  test('planner reorder, group add, move between groups, and persistence', async ({ page }) => {
    await gotoApp(page);
    await seedPlannerWithFirstTasks(page, 3);
    await openPlannerTab(page);

    const firstGroup = page.locator('.planner-group').first();
    await expect(firstGroup.locator('.planner-card')).toHaveCount(3);

    const beforeFirstName = (await firstGroup.locator('.planner-card .planner-card-name').first().innerText()).trim();
    const beforeSecondName = (await firstGroup.locator('.planner-card .planner-card-name').nth(1).innerText()).trim();

    await firstGroup.locator('.planner-card').first().dragTo(firstGroup.locator('.planner-drop-zone').last());
    await expect(firstGroup.locator('.planner-card .planner-card-name').first()).toHaveText(beforeSecondName);

    page.once('dialog', (dialog) => dialog.accept('Route B'));
    await page.locator('#planner-group-add').click();
    await expect(page.locator('.planner-group')).toHaveCount(2);

    const secondGroup = page.locator('.planner-group').nth(1);
    await firstGroup.locator('.planner-card').last().dragTo(secondGroup.locator('.planner-drop-top'));

    await expect(secondGroup.locator('.planner-card')).toHaveCount(1);
    await expect(secondGroup.locator('.planner-card .planner-card-name').first()).toHaveText(beforeFirstName);

    await page.reload();
    await openPlannerTab(page);

    const reloadedSecondGroup = page.locator('.planner-group').nth(1);
    await expect(reloadedSecondGroup.locator('.planner-group-name')).toHaveValue('Route B');
    await expect(reloadedSecondGroup.locator('.planner-card .planner-card-name').first()).toHaveText(beforeFirstName);
  });
});
