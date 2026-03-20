# WebMCP Integration Patterns — MiniClaw Reference

This document describes the WebMCP (Web Model Context Protocol) integration patterns
used across MiniClaw sites. Use this as a reference when adding WebMCP to
**augmentedmike.com**, **helloam.bot**, or any new MiniClaw-powered site.

## Overview

WebMCP allows AI agents (via Chrome 146+ with `chrome://flags/#enable-webmcp-testing`)
to discover and invoke tools exposed by web pages. There are two APIs:

| API | When to use | Example |
|---|---|---|
| **Declarative** | Clean HTML forms with `name` attrs on inputs | Booking form, contact form |
| **Imperative** | Dynamic tools, WebSocket chat, API calls | Chat widget, availability checker |

## Architecture

```
shared/webmcp/
  webmcp-tools.js          # Core library — include on all pages
  webmcp.ts                # TypeScript types + server-side helpers
  webmcp-head.html         # Standard <head> snippet for all sites
  webmcp-init-miniclaw.js  # miniclaw.bot tool registrations
  webmcp-init-augmentedmike.js  # augmentedmike.com tool registrations
  webmcp-init-helloam.js   # helloam.bot tool registrations
```

## Quick Start for a New Site

### 1. Add the head tags

Include in every page's `<head>`:

```html
<meta name="model-context" content="supported">
<meta name="webmcp-version" content="1.0">
<script src="/webmcp-tools.js" defer></script>
<script src="/webmcp-init-yoursite.js" defer></script>
```

Or use the TypeScript helper:

```typescript
import { webmcpHeadTags } from 'shared/webmcp/webmcp';
// Returns the meta + script tags as a string
```

### 2. Copy `webmcp-tools.js` to your site's public directory

This is the runtime library. It provides:
- `WebMCP.init({ site, tools })` — initialize with imperative tools
- `WebMCP.registerTool(descriptor)` — register a single tool dynamically
- `WebMCP.unregisterTool(name)` — remove a tool (e.g., when WS disconnects)
- `WebMCP.isSupported()` — feature detection
- Auto-discovery of `<form toolname="...">` elements

### 3. Create your site-specific init file

See `webmcp-init-miniclaw.js` as the reference implementation.

## Pattern: Declarative Form (Static)

Best for: contact forms, booking forms, signup forms.

```html
<form toolname="book-consultation"
      tooldescription="Book a paid consultation. Select date/time, provide name and email.">
  <input type="text" name="name" placeholder="Your name" required />
  <input type="email" name="email" placeholder="Your email" required />
  <textarea name="notes" placeholder="Notes..."></textarea>
  <button type="submit">Book Now</button>
</form>
```

The `webmcp-tools.js` library automatically discovers these forms and registers them
as tools via `navigator.modelContext`. The agent fills fields and submits.

**Requirements:**
- Every input must have a `name` attribute
- Use `required` on mandatory fields
- Add `placeholder` or `aria-label` for field descriptions
- The form's `onsubmit` handler must work when fields are set programmatically

## Pattern: Imperative Tool (API Call)

Best for: tools that call APIs, compute results, or need async behavior.

```javascript
WebMCP.registerTool({
  name: 'check_availability',
  description: 'Check available booking slots.',
  inputSchema: {
    type: 'object',
    properties: {
      date: { type: 'string', description: 'ISO date (YYYY-MM-DD) to check' }
    }
  },
  execute: function(params) {
    return fetch('/api/slots')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        var slots = data.slots.filter(function(s) { return s.available; });
        return {
          content: [{ type: 'text', text: 'Available: ' + slots.length + ' slots' }]
        };
      });
  }
});
```

**Key points:**
- `execute` can return a Promise for async operations
- Always return `{ content: [{ type: 'text', text: '...' }] }` format
- Handle errors gracefully — return error text, don't throw

## Pattern: Dynamic Registration (WebSocket Chat)

Best for: tools that depend on connection state (WebSocket, SSE).

```javascript
// Register only when connected
ws.addEventListener('open', function() {
  WebMCP.registerTool({
    name: 'chat_with_am',
    description: 'Send a message to Am, the AI assistant.',
    inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] },
    execute: function(params) {
      return new Promise(function(resolve) {
        ws.send(JSON.stringify({ type: 'chat', content: params.message }));
        // Listen for response...
        pendingResolve = resolve;
        setTimeout(function() { resolve({ content: [{ type: 'text', text: 'Timeout.' }] }); }, 60000);
      });
    }
  });
});

// Unregister on disconnect
ws.addEventListener('close', function() {
  WebMCP.unregisterTool('chat_with_am');
});
```

**Key points:**
- Register in `open`, unregister in `close`/`error`
- The tool simply doesn't exist when the chat isn't connected
- Use Promise-based execute with a timeout

## Feature Detection

All WebMCP code is a no-op on unsupported browsers. The pattern:

```javascript
// webmcp-tools.js does this internally:
if (!('modelContext' in navigator)) {
  // Tools are stored locally but not registered with the browser
  console.log('[WebMCP] Stored tool (no browser support): ' + name);
}
```

Pages load and function normally without WebMCP. No errors, no broken behavior.

## Testing

1. Open Chrome 146+ (or Canary)
2. Navigate to `chrome://flags/#enable-webmcp-testing` → Enable
3. Install "Model Context Tool Inspector" from Chrome Web Store
4. Open your site — the extension shows all discovered tools
5. Click a tool to see its schema and test execution

## Tools Reference — miniclaw.bot

| Tool | Type | Description |
|---|---|---|
| `book-consultation` | Declarative (form) | Book a consultation — auto-discovered from `<form toolname>` |
| `check_availability` | Imperative | Fetch available time slots from `/api/slots` |
| `chat_with_am` | Imperative (dynamic) | Chat via WebSocket — only available when connected |
| `search_docs` | Imperative | Search documentation via `/api/docs/search` |
| `view-portfolio` | Imperative | Navigate to portfolio section |
| `send-message` | Imperative | Submit the contact form |

## Replication Checklist for New Sites

- [ ] Copy `webmcp-tools.js` to site's `public/` directory
- [ ] Add `webmcp-head.html` content to every page `<head>`
- [ ] Create `webmcp-init-<site>.js` with site-specific tools
- [ ] Add `toolname`/`tooldescription` to any static HTML forms
- [ ] Test with Chrome Model Context Tool Inspector Extension
- [ ] Verify no-op behavior on Safari/Firefox (no errors in console)
