const { expect } = require('@playwright/test');

const ROUTES_KEY = 'league_planner_routes_v1';

async function clearAppStorage(page) {
  await page.goto('/');
  await page.evaluate((routesKey) => {
    localStorage.removeItem('league_tasks_completed');
    localStorage.removeItem('league_planner_v1');
    localStorage.removeItem('league_task_panel_width');

    // Force tests onto an editable empty user route instead of the default preset route.
    const routeId = 'test-route';
    localStorage.setItem(routesKey, JSON.stringify({
      routes: [{
        id: routeId,
        name: 'My Plan',
        sections: [{ id: 'main', name: 'Main', collapsed: false, items: [] }]
      }],
      activeRouteId: routeId
    }));
  }, ROUTES_KEY);
}

async function gotoApp(page) {
  await page.goto('/');
  await expect(page.locator('#task-panel')).toBeVisible();
  await page.waitForFunction(() => Array.isArray(window._allTasksRef) && window._allTasksRef.length > 0, null, {
    timeout: 30000
  });
  await expect(page.locator('#planner-container')).toBeVisible();
}

async function openTaskSearch(page) {
  const overlay = page.locator('#task-search-overlay');
  if (!(await overlay.isVisible())) {
    await page.locator('#task-search-open-btn').click();
  }

  await expect(overlay).toBeVisible();
  await expect(page.locator('#task-search-results .task-card').first()).toBeVisible({ timeout: 30000 });
}

async function openPlannerTab(page) {
  const overlay = page.locator('#task-search-overlay');
  if (await overlay.isVisible()) {
    await page.locator('#task-search-close-btn').click();
  }

  await page.waitForFunction(() => Array.isArray(window._allTasksRef) && window._allTasksRef.length > 0, null, {
    timeout: 30000
  });
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
  openTaskSearch,
  openPlannerTab,
  seedPlannerWithFirstTasks,
};
