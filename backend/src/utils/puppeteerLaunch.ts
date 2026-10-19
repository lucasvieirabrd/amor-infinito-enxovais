import puppeteer, { Browser } from 'puppeteer';

const CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-first-run',
  '--no-zygote',
  '--single-process',
];

export async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    args: CHROMIUM_ARGS,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
  });
}
