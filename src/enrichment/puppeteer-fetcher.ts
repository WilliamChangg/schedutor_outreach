import puppeteer, { Browser, Page } from 'puppeteer';
import { scrapingRateLimiter } from '../utils/rate-limiter.js';

let browserInstance: Browser | null = null;

/**
 * Get or create the browser singleton (lazy initialization)
 */
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
      ],
    });
  }
  return browserInstance;
}

/**
 * Close the browser instance (call on process exit)
 */
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

/**
 * Fetch a page using Puppeteer for JavaScript-rendered content
 */
export async function fetchWithPuppeteer(
  url: string,
  timeout: number = 30000
): Promise<PuppeteerPageContent | null> {
  // Respect rate limits
  await scrapingRateLimiter.waitForSlot();

  const browser = await getBrowser();
  let page: Page | null = null;

  try {
    page = await browser.newPage();

    // Set reasonable viewport and user agent
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/120.0.0.0 Safari/537.36'
    );

    // Block unnecessary resources for faster loading
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Navigate and wait for content
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout,
    });

    // Wait a bit for any lazy-loaded content
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract content
    const html = await page.content();
    const text = await page.evaluate(() => document.body?.innerText || '');

    return { html, text, url };
  } catch {
    return null;
  } finally {
    if (page) {
      await page.close();
    }
  }
}
