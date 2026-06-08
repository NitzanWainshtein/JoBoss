// ── Icon Dev Server ───────────────────────────────────────────────────────────
// Run: node icon-dev-server.js
// Then open: http://localhost:5173/icon-tool.html
// Moving a slider → updates iconSizes.js → Vite hot-reloads the app instantly

const http = require('http');
const fs   = require('fs');
const path = require('path');

const ICON_SIZES_PATH = path.join(__dirname, 'frontend', 'src', 'iconSizes.js');
const PORT = 3333;

function updateIconSize(key, value) {
  let content = fs.readFileSync(ICON_SIZES_PATH, 'utf8');
  const regex = new RegExp(`(\\s+${key}:\\s*)\\d+`);
  if (!regex.test(content)) {
    console.error(`Key not found: ${key}`);
    return false;
  }
  content = content.replace(regex, `$1${value}`);
  fs.writeFileSync(ICON_SIZES_PATH, content, 'utf8');
  console.log(`✅  ${key} → ${value}px`);
  return true;
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'POST' && req.url === '/update') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { key, value } = JSON.parse(body);
        const ok = updateIconSize(key, value);
        res.writeHead(ok ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok }));
      } catch (e) {
        res.writeHead(400); res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n🎨  Icon Dev Server running on http://localhost:${PORT}`);
  console.log(`    Open http://localhost:5173/icon-tool.html and move sliders\n`);
});
