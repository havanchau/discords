import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screenshotDir = path.join(rootDir, 'artifacts', 'ui');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const appUrl = process.env.WEB_URL || 'http://localhost:5173';
const apiUrl = process.env.API_URL || 'http://localhost:3000';

await fs.mkdir(screenshotDir, { recursive: true });
const uploadFixturePath = path.join(screenshotDir, 'upload-smoke.txt');
await fs.writeFile(uploadFixturePath, 'Discord clone upload smoke fixture.\n', 'utf8');

const loginResponse = await fetch(`${apiUrl}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'demo@example.com',
    password: 'Demo@123456'
  })
});

if (!loginResponse.ok) {
  throw new Error(`Login failed: ${loginResponse.status} ${await loginResponse.text()}`);
}

const auth = await loginResponse.json();
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check']
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(appUrl, { waitUntil: 'networkidle0' });
  await page.evaluate((value) => {
    localStorage.setItem('discord-clone-auth', JSON.stringify(value));
  }, auth);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="composer-input"]', { timeout: 10000 });

  const channelName = `ui-${Date.now().toString().slice(-6)}`;
  await page.type('[data-testid="create-channel-input"]', channelName);
  await page.click('[data-testid="create-channel-button"]');
  await page.waitForFunction(
    (text) => document.body.innerText.includes(text),
    { timeout: 10000 },
    channelName
  );

  const message = `UI smoke ${new Date().toISOString()} https://example.com/smoke`;
  await page.$eval('.file-input', (input, filePath) => input.setAttribute('data-smoke-path', filePath), uploadFixturePath);
  const fileInput = await page.$('.file-input');
  await fileInput.uploadFile(uploadFixturePath);
  await page.type('[data-testid="composer-input"]', message);
  await page.click('[data-testid="composer-send"]');
  await page.waitForFunction(
    (text) => document.body.innerText.includes(text),
    { timeout: 10000 },
    message
  );
  await page.waitForFunction(
    () => document.body.innerText.includes('upload-smoke.txt') && document.querySelector('.link-preview'),
    { timeout: 10000 }
  );

  await page.click('[data-testid="search-button"]');
  await page.waitForSelector('.utility-panel.open', { timeout: 5000 });
  await page.screenshot({ path: path.join(screenshotDir, 'desktop-app.png'), fullPage: true });

  await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(screenshotDir, 'mobile-app.png'), fullPage: true });

  console.log(
    JSON.stringify(
      {
        ok: true,
        screenshots: [
          path.join(screenshotDir, 'desktop-app.png'),
          path.join(screenshotDir, 'mobile-app.png')
        ],
        channelName,
        message
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
