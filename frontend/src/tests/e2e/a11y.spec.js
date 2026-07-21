import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Mock backend API responses
    await page.route('/api/status', async route => {
      const json = { status: "online", version: "1.0" };
      await route.fulfill({ json });
    });
    
    await page.route('/api/models', async route => {
      const json = { models: ["gemma4:e4b"] };
      await route.fulfill({ json });
    });
    
    await page.route('/api/personas', async route => {
      const json = { personas: [] };
      await route.fulfill({ json });
    });
    
    await page.route('/api/scenarios', async route => {
      const json = { scenarios: [] };
      await route.fulfill({ json });
    });
    
    await page.route('/api/sessions', async route => {
      const json = { sessions: [] };
      await route.fulfill({ json });
    });
    
    await page.route('/api/settings', async route => {
      const json = { settings: {} };
      await route.fulfill({ json });
    });
  });

  test('welcome screen should have no automatically detectable accessibility violations', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the app to load
    await expect(page.locator('text=Mainframe Corp')).toBeVisible();

    // Check accessibility of the page
    const accessibilityScanResults = await new AxeBuilder({ page })
      // We exclude certain rules if they are intentionally overridden by the design
      // Currently the only role issue is main having role="alert" when error boundary fires (which shouldn't fire now)
      // and html missing lang attribute (which we should fix in index.html, not exclude)
      .analyze();
    
    // Display the violations nicely if there are any
    if (accessibilityScanResults.violations.length > 0) {
        console.log(JSON.stringify(accessibilityScanResults.violations, null, 2));
    }
    
    expect(accessibilityScanResults.violations.length).toEqual(0);
  });
});
