const { test, expect } = require('@playwright/test');
const { clearAppStorage, gotoApp, openPlannerTab, seedPlannerWithFirstTasks } = require('./helpers/app');

test.describe('performance budgets', () => {
  test.beforeEach(async ({ page }) => {
    await clearAppStorage(page);
  });

  test('boot to first task card stays within budget', async ({ page }) => {
    const start = Date.now();
    await gotoApp(page);
    const duration = Date.now() - start;
    test.info().annotations.push({ type: 'perf', description: `boot=${duration}ms` });
    expect(duration).toBeLessThan(4000);
  });

  test('planner tab opens within budget after seeded tasks', async ({ page }) => {
    await gotoApp(page);
    await seedPlannerWithFirstTasks(page, 5);

    const start = Date.now();
    await openPlannerTab(page);
    const duration = Date.now() - start;
    test.info().annotations.push({ type: 'perf', description: `planner-open=${duration}ms` });
    expect(duration).toBeLessThan(1500);
  });

  test('planner search returns results within budget', async ({ page }) => {
    await gotoApp(page);
    await openPlannerTab(page);

    const start = Date.now();
    await page.fill('#planner-search-input', 'kill');
    await expect(page.locator('.planner-search-result').first()).toBeVisible();
    const duration = Date.now() - start;
    test.info().annotations.push({ type: 'perf', description: `planner-search=${duration}ms` });
    expect(duration).toBeLessThan(1000);
  });

  test.skip('item spawns first toggle stays within budget', async ({ page }) => {
    await gotoApp(page);

    const start = Date.now();
    await page.locator('#task-spawns-toggle').click();
    await expect(page.locator('#task-spawns-toggle')).toHaveText('Hide Item Spawns');
    const duration = Date.now() - start;
    test.info().annotations.push({ type: 'perf', description: `spawns-toggle=${duration}ms` });
    expect(duration).toBeLessThan(4000);
  });

  test('reload with saved planner state stays within budget', async ({ page }) => {
    await gotoApp(page);
    await seedPlannerWithFirstTasks(page, 8);
    await openPlannerTab(page);

    const start = Date.now();
    await page.reload();
    await openPlannerTab(page);
    await expect(page.locator('.planner-card')).toHaveCount(8);
    const duration = Date.now() - start;
    test.info().annotations.push({ type: 'perf', description: `planner-reload=${duration}ms` });
    expect(duration).toBeLessThan(3500);
  });
});
