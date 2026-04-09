import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';
import { scrapingRateLimiter } from '../utils/rate-limiter.js';

// Register stealth plugin — patches navigator.webdriver, plugins length,
// languages, Chrome runtime, etc. to defeat headless detection.
puppeteer.use(StealthPlugin());

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
        '--disable-extensions',
        '--disable-blink-features=AutomationControlled', // defeats navigator.webdriver
      ],
    });
  }
  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

export interface PuppeteerPageContent {
  html: string;
  text: string;
  url: string;
}

export async function fetchWithPuppeteer(
  url: string,
  timeout: number = 30000
): Promise<PuppeteerPageContent | null> {
  await scrapingRateLimiter.waitForSlot();

  const browser = await getBrowser();
  let page: Page | null = null;

  try {
    page = await browser.newPage();

    await page.setViewport({ width: 1280, height: 800 });

    // Patch navigator properties that betray headless Chrome even with stealth plugin
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      // Make plugins non-empty so it looks like a real browser
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    });

    // Block unnecessary resources for faster loading
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Use domcontentloaded instead of networkidle2:
    // networkidle2 waits for ≤2 in-flight requests for 500ms, which chat widgets
    // and analytics beacons prevent — causing the full timeout to elapse every time.
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout,
    });

    // Give lazy-loaded content a moment to render after initial DOM parse
    await Promise.race([
      page.waitForSelector('body', { timeout: 5000 }),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);

    const html = await page.content();
    const text = await page.evaluate(
      () => document.body?.innerText || ''
    );

    return { html, text, url };
  } catch {
    return null;
  } finally {
    if (page) await page.close();
  }
}