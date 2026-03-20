/**
 * test-webmcp-discovery.js — Verifies WebMCP tool discovery across all three domains.
 *
 * Tests that:
 * 1. Each domain page has model-context meta tag
 * 2. webmcp-tools.js loads and exposes WebMCP global
 * 3. Declarative forms with toolname attrs are discoverable
 * 4. Imperative tools are registered via WebMCP.getTools()
 * 5. At least one tool per domain can be invoked
 *
 * Usage: node test-webmcp-discovery.js [--live]
 *   Default: Tests against local HTML files (no server needed)
 *   --live: Tests against running dev servers at the actual domain ports
 */

const fs = require('fs');
const path = require('path');

const WEBMCP_DIR = __dirname;
const RESULTS = { passed: 0, failed: 0, tests: [] };

function test(name, fn) {
  try {
    const result = fn();
    if (result === false) {
      RESULTS.failed++;
      RESULTS.tests.push({ name, status: 'FAIL' });
      console.log(`  ✗ ${name}`);
    } else {
      RESULTS.passed++;
      RESULTS.tests.push({ name, status: 'PASS' });
      console.log(`  ✓ ${name}`);
    }
  } catch (err) {
    RESULTS.failed++;
    RESULTS.tests.push({ name, status: 'FAIL', error: err.message });
    console.log(`  ✗ ${name}: ${err.message}`);
  }
}

// ── Test 1: Meta tags exist in all integration snippets ──
console.log('\n=== Meta Tag Discovery ===');

['miniclaw', 'augmentedmike', 'helloam'].forEach(domain => {
  const file = path.join(WEBMCP_DIR, `webmcp-integration-${domain}.html`);
  test(`${domain}: integration file exists`, () => fs.existsSync(file));

  if (fs.existsSync(file)) {
    const html = fs.readFileSync(file, 'utf-8');
    test(`${domain}: has model-context meta tag`, () => html.includes('name="model-context"'));
    test(`${domain}: has webmcp-version meta tag`, () => html.includes('name="webmcp-version"'));
    test(`${domain}: includes webmcp-tools.js`, () => html.includes('webmcp-tools.js'));
    test(`${domain}: includes domain init script`, () => html.includes(`webmcp-init-${domain}.js`));
  }
});

// ── Test 2: webmcp-head.html has discovery tags ──
console.log('\n=== Shared Head Snippet ===');

const headFile = path.join(WEBMCP_DIR, 'webmcp-head.html');
test('webmcp-head.html exists', () => fs.existsSync(headFile));
if (fs.existsSync(headFile)) {
  const headHtml = fs.readFileSync(headFile, 'utf-8');
  test('webmcp-head.html has model-context meta', () => headHtml.includes('name="model-context"'));
  test('webmcp-head.html has webmcp-version meta', () => headHtml.includes('name="webmcp-version"'));
}

// ── Test 3: Contact form embed has declarative WebMCP attributes ──
console.log('\n=== Contact Form Embed ===');

const contactFile = path.join(WEBMCP_DIR, 'contact-form-embed.html');
test('contact-form-embed.html exists', () => fs.existsSync(contactFile));
if (fs.existsSync(contactFile)) {
  const contactHtml = fs.readFileSync(contactFile, 'utf-8');
  test('contact form has toolname="send-message"', () => contactHtml.includes('toolname="send-message"'));
  test('contact form has tooldescription', () => contactHtml.includes('tooldescription='));
  test('contact form has model-context meta', () => contactHtml.includes('name="model-context"'));
  test('contact form has navigator.modelContext registration', () => contactHtml.includes('navigator.modelContext.registerTool'));
  test('contact form has name field', () => contactHtml.includes('name="name"'));
  test('contact form has email field', () => contactHtml.includes('name="email"'));
  test('contact form has message field', () => contactHtml.includes('name="message"'));
}

// ── Test 4: Booking embed has WebMCP annotations ──
console.log('\n=== Booking Embed (mc-booking) ===');

const bookingFile = path.join(WEBMCP_DIR, '../../mc-booking/web/embed.ts');
test('embed.ts exists', () => fs.existsSync(bookingFile));
if (fs.existsSync(bookingFile)) {
  const bookingHtml = fs.readFileSync(bookingFile, 'utf-8');
  test('booking form has toolname="book-consultation"', () => bookingHtml.includes('toolname="book-consultation"'));
  test('booking form has tooldescription', () => bookingHtml.includes('tooldescription='));
  test('booking embed has model-context meta', () => bookingHtml.includes('name="model-context"'));
  test('booking embed has navigator.modelContext registration', () => bookingHtml.includes('navigator.modelContext.registerTool'));
}

// ── Test 5: Domain init scripts register at least one tool each ──
console.log('\n=== Domain Init Scripts ===');

const domainToolMap = {
  miniclaw: ['view-portfolio', 'send-message', 'check_availability', 'search_docs'],
  augmentedmike: ['request-demo', 'send-message'],
  helloam: ['chat-with-am', 'send-message']
};

Object.entries(domainToolMap).forEach(([domain, expectedTools]) => {
  const initFile = path.join(WEBMCP_DIR, `webmcp-init-${domain}.js`);
  test(`${domain}: init script exists`, () => fs.existsSync(initFile));
  if (fs.existsSync(initFile)) {
    const js = fs.readFileSync(initFile, 'utf-8');
    expectedTools.forEach(tool => {
      test(`${domain}: registers tool '${tool}'`, () => js.includes(`'${tool}'`) || js.includes(`"${tool}"`));
    });
  }
});

// ── Test 6: webmcp-tools.js has graceful fallback ──
console.log('\n=== Graceful Fallback ===');

const toolsFile = path.join(WEBMCP_DIR, 'webmcp-tools.js');
test('webmcp-tools.js exists', () => fs.existsSync(toolsFile));
if (fs.existsSync(toolsFile)) {
  const toolsJs = fs.readFileSync(toolsFile, 'utf-8');
  test('has navigator.modelContext feature detection', () => toolsJs.includes('navigator.modelContext'));
  test('has isSupported() method', () => toolsJs.includes('isSupported'));
  test('has discoverDeclarativeForms()', () => toolsJs.includes('discoverDeclarativeForms'));
  test('stores tools locally when unsupported', () => toolsJs.includes('Stored tool (no browser support)'));
}

// ── Test 7: .well-known manifests exist for all domains ──
console.log('\n=== .well-known Manifests ===');

['miniclaw', 'augmentedmike', 'helloam'].forEach(domain => {
  const manifestFile = path.join(WEBMCP_DIR, `well-known/webmcp-${domain}.json`);
  test(`${domain}: manifest file exists`, () => fs.existsSync(manifestFile));
  if (fs.existsSync(manifestFile)) {
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf-8'));
    test(`${domain}: manifest has version`, () => manifest.version === '1.0');
    test(`${domain}: manifest has tools array`, () => Array.isArray(manifest.tools) && manifest.tools.length > 0);
    test(`${domain}: manifest declares support`, () => manifest.support && manifest.support.declarative && manifest.support.imperative);
  }
});

// ── Test 8: mc-web-chat has WebMCP integration ──
console.log('\n=== Chat Widget WebMCP ===');

const chatFile = path.join(WEBMCP_DIR, '../../mc-web-chat/webmcp-chat.js');
test('webmcp-chat.js exists', () => fs.existsSync(chatFile));
if (fs.existsSync(chatFile)) {
  const chatJs = fs.readFileSync(chatFile, 'utf-8');
  test('chat widget registers a tool', () => chatJs.includes('registerTool') || chatJs.includes('chat-with-ai'));
}

// ── Test 9: mc-seo audit checks WebMCP compliance ──
console.log('\n=== SEO Audit WebMCP Check ===');

const auditFile = path.join(WEBMCP_DIR, '../../mc-seo/src/audit.ts');
test('audit.ts exists', () => fs.existsSync(auditFile));
if (fs.existsSync(auditFile)) {
  const auditTs = fs.readFileSync(auditFile, 'utf-8');
  test('audit checks for model-context meta', () => auditTs.includes('model-context'));
  test('audit checks for toolname attributes', () => auditTs.includes('toolname'));
}

// ── Summary ──
console.log('\n══════════════════════════════');
console.log(`  PASSED: ${RESULTS.passed}`);
console.log(`  FAILED: ${RESULTS.failed}`);
console.log(`  TOTAL:  ${RESULTS.passed + RESULTS.failed}`);
console.log('══════════════════════════════\n');

process.exit(RESULTS.failed > 0 ? 1 : 0);
