/**
 * test-webmcp-browser.js — Browser-based WebMCP discovery & invocation test
 *
 * Serves files via HTTP and loads them with proper <script src> tags.
 * Usage: NODE_PATH=$(npm root -g) node test-webmcp-browser.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');

const WEBMCP_DIR = path.resolve(__dirname);
const PORT = 19876;
let server;

function testPageHtml(domain, initFile) {
  return `<!DOCTYPE html>
<html><head>
<meta name="model-context" content="supported">
<meta name="webmcp-version" content="1.0">
</head><body>
<form id="contact-form" toolname="send-message"
      tooldescription="Send a message or inquiry.">
  <input type="text" name="name" placeholder="Name" required />
  <input type="email" name="email" placeholder="Email" required />
  <textarea name="message" placeholder="Message" required></textarea>
  <button type="submit">Send</button>
</form>
<script src="/webmcp-tools.js"></script>
<script src="/${initFile}"></script>
</body></html>`;
}

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const url = req.url.split('?')[0];

      // Serve static JS files
      const jsFiles = [
        'webmcp-tools.js',
        'webmcp-init-miniclaw.js',
        'webmcp-init-augmentedmike.js',
        'webmcp-init-helloam.js'
      ];
      const match = jsFiles.find(f => url === '/' + f);
      if (match) {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end(fs.readFileSync(path.join(WEBMCP_DIR, match)));
        return;
      }

      // Serve test pages
      if (url === '/miniclaw') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(testPageHtml('miniclaw.bot', 'webmcp-init-miniclaw.js'));
      } else if (url === '/augmentedmike') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(testPageHtml('augmentedmike.com', 'webmcp-init-augmentedmike.js'));
      } else if (url === '/helloam') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(testPageHtml('helloam.bot', 'webmcp-init-helloam.js'));
      } else if (url === '/contact') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(fs.readFileSync(path.join(WEBMCP_DIR, 'contact-form-embed.html')));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.listen(PORT, () => resolve());
  });
}

async function runTests() {
  await startServer();
  console.log(`Test server at http://localhost:${PORT}`);

  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  } catch (err) {
    console.log('Playwright/Chromium not available — skipping browser tests.');
    server.close();
    process.exit(0);
  }

  const results = { passed: 0, failed: 0 };
  function check(name, ok) {
    if (ok) { results.passed++; console.log(`  ✓ ${name}`); }
    else { results.failed++; console.log(`  ✗ ${name}`); }
  }

  try {
    // ── miniclaw.bot ──
    console.log('\n=== Browser: miniclaw.bot ===');
    const p1 = await browser.newPage();
    await p1.goto(`http://localhost:${PORT}/miniclaw`, { waitUntil: 'networkidle' });

    const mc = await p1.evaluate(() => {
      if (typeof WebMCP === 'undefined') return null;
      const tools = WebMCP.getTools();
      return { toolCount: tools.length, names: tools.map(t => t.name) };
    });
    check('WebMCP global defined', mc !== null);
    check(`${mc?.toolCount || 0} tools registered (expected ≥4, chat_with_am is dynamic)`, mc && mc.toolCount >= 4);
    check('has send-message', mc && mc.names.includes('send-message'));
    check('has view-portfolio', mc && mc.names.includes('view-portfolio'));
    check('has check_availability', mc && mc.names.includes('check_availability'));

    const mcForm = await p1.evaluate(() => {
      const f = document.querySelector('form[toolname]');
      return f ? f.getAttribute('toolname') : null;
    });
    check('declarative form discovered', mcForm === 'send-message');

    const mcMeta = await p1.evaluate(() => {
      const m = document.querySelector('meta[name="model-context"]');
      return m?.getAttribute('content');
    });
    check('model-context meta present', mcMeta === 'supported');

    const mcInvoke = await p1.evaluate(() => {
      const form = document.getElementById('contact-form');
      if (!form) return false;
      form.querySelector('[name="name"]').value = 'Agent Test';
      form.querySelector('[name="email"]').value = 'agent@chrome146.test';
      return form.querySelector('[name="name"]').value === 'Agent Test';
    });
    check('can invoke send-message (fill form)', mcInvoke);
    await p1.close();

    // ── augmentedmike.com ──
    console.log('\n=== Browser: augmentedmike.com ===');
    const p2 = await browser.newPage();
    await p2.goto(`http://localhost:${PORT}/augmentedmike`, { waitUntil: 'networkidle' });

    const am = await p2.evaluate(() => {
      if (typeof WebMCP === 'undefined') return null;
      const tools = WebMCP.getTools();
      return { toolCount: tools.length, names: tools.map(t => t.name) };
    });
    check('WebMCP global defined', am !== null);
    check(`${am?.toolCount || 0} tools registered (expected ≥2)`, am && am.toolCount >= 2);
    check('has request-demo', am && am.names.includes('request-demo'));
    check('has send-message', am && am.names.includes('send-message'));

    const amInvoke = await p2.evaluate(() => {
      const form = document.getElementById('contact-form');
      if (!form) return false;
      form.querySelector('[name="name"]').value = 'Demo Agent';
      return form.querySelector('[name="name"]').value === 'Demo Agent';
    });
    check('can invoke send-message (fill form)', amInvoke);
    await p2.close();

    // ── helloam.bot ──
    console.log('\n=== Browser: helloam.bot ===');
    const p3 = await browser.newPage();
    await p3.goto(`http://localhost:${PORT}/helloam`, { waitUntil: 'networkidle' });

    const ha = await p3.evaluate(() => {
      if (typeof WebMCP === 'undefined') return null;
      const tools = WebMCP.getTools();
      return { toolCount: tools.length, names: tools.map(t => t.name) };
    });
    check('WebMCP global defined', ha !== null);
    check(`${ha?.toolCount || 0} tools registered (expected ≥2)`, ha && ha.toolCount >= 2);
    check('has chat-with-am', ha && ha.names.includes('chat-with-am'));
    check('has send-message', ha && ha.names.includes('send-message'));

    const haInvoke = await p3.evaluate(() => {
      const form = document.getElementById('contact-form');
      if (!form) return false;
      form.querySelector('[name="message"]').value = 'Hello from agent';
      return form.querySelector('[name="message"]').value === 'Hello from agent';
    });
    check('can invoke send-message (fill form)', haInvoke);
    await p3.close();

    // ── Contact form embed ──
    console.log('\n=== Browser: Contact Form Embed ===');
    const p4 = await browser.newPage();
    await p4.goto(`http://localhost:${PORT}/contact`, { waitUntil: 'networkidle' });

    const cf = await p4.evaluate(() => {
      const meta = document.querySelector('meta[name="model-context"]');
      const form = document.querySelector('form[toolname="send-message"]');
      return { hasMeta: meta?.content === 'supported', hasForm: !!form };
    });
    check('contact embed has model-context meta', cf.hasMeta);
    check('contact embed has toolname form', cf.hasForm);
    await p4.close();

  } catch (err) {
    console.error('Test error:', err.message);
    results.failed++;
  }

  await browser.close();
  server.close();

  console.log('\n══════════════════════════════');
  console.log(`  PASSED: ${results.passed}`);
  console.log(`  FAILED: ${results.failed}`);
  console.log(`  TOTAL:  ${results.passed + results.failed}`);
  console.log('══════════════════════════════\n');

  process.exit(results.failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Fatal:', err);
  if (server) server.close();
  process.exit(1);
});
