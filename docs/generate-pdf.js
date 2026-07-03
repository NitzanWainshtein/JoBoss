/**
 * Generates USE_CASES_UML.pdf from USE_CASES_UML.html
 * Run: node docs/generate-pdf.js
 */

const puppeteer = require('puppeteer');
const path      = require('path');

(async () => {
  const htmlPath = path.resolve(__dirname, 'USE_CASES_UML.html');
  const pdfPath  = path.resolve(__dirname, 'USE_CASES_UML.pdf');

  console.log('🚀 Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  // A3 viewport so diagrams have plenty of room to render at full width
  await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });

  console.log('📄 Loading HTML...');
  await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, {
    waitUntil: 'networkidle0',
    timeout: 60000,
  });

  // Wait for Mermaid to finish rendering all diagrams
  console.log('⏳ Waiting for Mermaid diagrams to render...');
  await page.waitForFunction(
    () => document.querySelectorAll('.mermaid svg').length > 0,
    { timeout: 30000 }
  );
  // Extra buffer — Mermaid renders diagrams progressively
  await new Promise(r => setTimeout(r, 4000));

  const diagramCount = await page.evaluate(
    () => document.querySelectorAll('.mermaid svg').length
  );
  console.log(`✅ ${diagramCount} diagrams rendered`);

  // Inject print-specific overrides to make diagrams readable
  await page.addStyleTag({ content: `
    /* Force every diagram SVG to be large and readable */
    .mermaid svg {
      min-width: 900px !important;
      max-width: 100% !important;
      height: auto !important;
      font-size: 13px !important;
    }
    /* Each feature card starts on its own page */
    .feature-card {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    /* Section headers never orphaned */
    .section-header {
      page-break-after: avoid;
      break-after: avoid;
    }
    /* Cover fills its own page */
    .cover {
      page-break-after: always;
      break-after: always;
    }
    /* Widen the main container for PDF */
    .container {
      max-width: 100% !important;
      padding: 20px 40px !important;
    }
    .mermaid-wrap {
      overflow: visible !important;
    }
  `});

  console.log('🖨️  Generating PDF (A3 landscape)...');
  await page.pdf({
    path: pdfPath,
    format: 'A3',
    landscape: true,
    printBackground: true,
    margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="font-size:9px; color:#aaa; width:100%; text-align:center; font-family:sans-serif;">
        JoBoss — Use Cases &amp; UML Sequence Diagrams
      </div>`,
    footerTemplate: `
      <div style="font-size:9px; color:#aaa; width:100%; text-align:center; font-family:sans-serif;">
        Page <span class="pageNumber"></span> of <span class="totalPages"></span>
      </div>`,
  });

  await browser.close();

  console.log(`\n✅ Done!  →  ${pdfPath}\n`);
})();
