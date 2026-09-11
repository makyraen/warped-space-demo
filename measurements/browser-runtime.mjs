import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const playwright = require(process.env.WARPED_PLAYWRIGHT || 'playwright');
export const { chromium, firefox, webkit } = playwright;
