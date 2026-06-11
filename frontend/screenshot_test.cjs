const { chromium } = require('C:\\Users\\NITZAN\\AppData\\Local\\npm-cache\\_npx\\e41f203b7505f1fb\\node_modules\\playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:3333');
  await page.waitForTimeout(2000);

  await page.fill('input[type="email"], input[placeholder*="אימייל"]', 'jobo@premium.co.il');
  await page.fill('input[type="password"], input[placeholder*="סיסמ"]', 'bossJOB12@');
  await page.click('button[type="submit"], button:has-text("התחבר")');
  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'C:\\Users\\NITZAN\\AppData\\Local\\Temp\\after_login.png' });

  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'C:\\Users\\NITZAN\\AppData\\Local\\Temp\\swipe_before.png' });

  // Click center of card area
  await page.mouse.click(195, 400);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'C:\\Users\\NITZAN\\AppData\\Local\\Temp\\swipe_after.png' });

  await browser.close();
  console.log('done');
})();
