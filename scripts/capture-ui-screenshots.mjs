import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screenshotDir = path.join(rootDir, 'docs', 'screenshots', 'ui-redesign');
const appUrl = process.env.WEB_URL || 'http://localhost:5173';
const apiUrl = process.env.API_URL || 'http://localhost:3001';

const chromeCandidates = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
].filter(Boolean);

async function resolveChromePath() {
  for (const candidate of chromeCandidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  throw new Error('Chrome executable not found.');
}

async function capture() {
  await fs.mkdir(screenshotDir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: await resolveChromePath(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

    // 1. Auth Login Screen
    await page.goto(appUrl, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: path.join(screenshotDir, '01-desktop-auth-screen.png'), fullPage: true });

    // 2. Perform Login via API and set localStorage
    const loginResponse = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'demo@example.com',
        password: 'Demo@123456'
      })
    });

    if (loginResponse.ok) {
      const auth = await loginResponse.json();
      await page.evaluate((value) => {
        localStorage.setItem('discord-clone-auth', JSON.stringify(value));
      }, auth);
      await page.reload({ waitUntil: 'networkidle0' });
      await new Promise((r) => setTimeout(r, 2000));

      // 2. Main Desktop App View
      await page.screenshot({ path: path.join(screenshotDir, '02-desktop-main-app.png'), fullPage: true });

      // 3. Settings Modal View (if trigger exists)
      const settingsButton = await page.$('button[title*="Settings"], button[aria-label*="Settings"], [data-testid="user-settings-button"]');
      if (settingsButton) {
        await settingsButton.click();
        await new Promise((r) => setTimeout(r, 1000));
        await page.screenshot({ path: path.join(screenshotDir, '03-desktop-settings-modal.png'), fullPage: true });
      }

      // 4. Mobile View Layout
      await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
      await page.reload({ waitUntil: 'networkidle0' });
      await new Promise((r) => setTimeout(r, 1500));
      await page.screenshot({ path: path.join(screenshotDir, '04-mobile-app-view.png'), fullPage: true });
    }

    console.log(
      JSON.stringify({
        success: true,
        folder: screenshotDir,
        files: [
          '01-desktop-auth-screen.png',
          '02-desktop-main-app.png',
          '03-desktop-settings-modal.png',
          '04-mobile-app-view.png'
        ]
      })
    );
  } finally {
    await browser.close();
  }
}

capture().catch((err) => {
  console.error(err);
  process.exit(1);
});
