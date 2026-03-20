/**
 * test-webmcp-live.cjs — Verify WebMCP on live running servers.
 * Tests against the actual deployed services (ports 4220, 4222, 4223).
 * Usage: NODE_PATH=$(npm root -g) node test-webmcp-live.cjs
 */

const { chromium } = require('playwright');

const DOMAINS = [
  { name: 'miniclaw.bot', url: 'http://localhost:4220/board', minTools: 4, expectTools: ['send-message', 'view-portfolio'], hasForm: false },
  { name: 'augmentedmike.com', url: 'http://localhost:4222/', minTools: 2, expectTools: ['request-demo', 'send-message'], hasForm: false },
  { name: 'helloam.bot', url: 'http://localhost:4223/', minTools: 2, expectTools: ['send-message'], hasForm: true },
];

async function runTests() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  } catch (err) {
    console.log('Playwright/Chromium not available — skipping live tests.');
    process.exit(0);
  }

  const results = { passed: 0, failed: 0 };
  function check(name, ok) {
    if (ok) { results.passed++; console.log(`  \u2713 ${name}`); }
    else { results.failed++; console.log(`  \u2717 ${name}`); }
  }

  for (const domain of DOMAINS) {
    console.log(`\n=== Live: ${domain.name} (${domain.url}) ===`);
    const page = await browser.newPage();
    try {
      await page.goto(domain.url, { waitUntil: 'networkidle', timeout: 15000 });

      // Check meta tag in rendered page
      const meta = await page.evaluate(() => {
        const m = document.querySelector('meta[name="model-context"]');
        return m ? m.getAttribute('content') : null;
      });
      check(`model-context meta present`, meta === 'supported');

      // Check WebMCP global and tools
      const webmcp = await page.evaluate(() => {
        if (typeof WebMCP === 'undefined') return null;
        const tools = WebMCP.getTools();
        return { toolCount: tools.length, names: tools.map(t => t.name) };
      });
      check(`WebMCP global defined`, webmcp !== null);
      check(`${webmcp?.toolCount || 0} tools registered (expected >= ${domain.minTools})`, webmcp && webmcp.toolCount >= domain.minTools);

      for (const tool of domain.expectTools) {
        check(`has tool '${tool}'`, webmcp && webmcp.names.includes(tool));
      }

      // Check declarative form discovery (only on pages that have forms)
      if (domain.hasForm !== false) {
        const declForm = await page.evaluate(() => {
          const f = document.querySelector('form[toolname]');
          return f ? f.getAttribute('toolname') : null;
        });
        check(`declarative form discovered`, declForm !== null);
      }

      // Check .well-known manifest accessible
      const manifestUrl = domain.url.replace(/\/[^/]*$/, '') + '/.well-known/webmcp.json';
      const manifestPage = await browser.newPage();
      const resp = await manifestPage.goto(manifestUrl.replace('/board', ''), { timeout: 5000 });
      check(`.well-known/webmcp.json accessible (${resp?.status()})`, resp && resp.status() === 200);
      await manifestPage.close();

    } catch (err) {
      check(`page loaded without error`, false);
      console.log(`    Error: ${err.message}`);
    }
    await page.close();
  }

  await browser.close();

  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log(`  PASSED: ${results.passed}`);
  console.log(`  FAILED: ${results.failed}`);
  console.log(`  TOTAL:  ${results.passed + results.failed}`);
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

  process.exit(results.failed > 0 ? 1 : 0);
}

runTests().catch(err => { console.error('Fatal:', err); process.exit(1); });
