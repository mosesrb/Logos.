import { test, expect } from '@playwright/test';

test.describe('App E2E', () => {
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

  test('loads the welcome screen', async ({ page }) => {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    
    await page.goto('/');
    
    // Check for Mainframe Corp title
    await expect(page.locator('text=Mainframe Corp')).toBeVisible();
    
    // Check for NEW_CHAT hint
    await expect(page.locator('text=NEW_CHAT')).toBeVisible();
  });
});
