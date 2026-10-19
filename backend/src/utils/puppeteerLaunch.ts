import puppeteer, { Browser } from 'puppeteer';

const CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-first-run',
  '--no-zygote',
  '--single-process',
  '--disable-dbus',
];

export async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: 'shell',
    args: CHROMIUM_ARGS,
  });
}
