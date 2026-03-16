const { expect } = require('@playwright/test');

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

module.exports = {
  clearAppStorage,
  gotoApp,
  openPlannerTab,
  seedPlannerWithFirstTasks,
};
