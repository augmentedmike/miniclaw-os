/**
 * webmcp.ts — TypeScript interface & helpers for WebMCP integration
 *
 * Provides type definitions and server-side helpers for the WebMCP pattern.
 * Client-side runtime is in webmcp-tools.js (plain JS for browser use).
 *
 * Usage:
 *   import { webmcpFormAttrs, webmcpImperativeScript, type WebMCPToolDescriptor } from 'shared/webmcp/webmcp';
 */

// ── Type Definitions ──

export interface WebMCPToolInput {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  format?: string;
  enum?: string[];
}

export interface WebMCPInputSchema {
  type: 'object';
  properties: Record<string, WebMCPToolInput>;
  required?: string[];
}

export interface WebMCPToolDescriptor {
  name: string;
  description: string;
  inputSchema: WebMCPInputSchema;
  /** Client-side execute callback as a string (for injection into HTML) */
  executeBody?: string;
}

export interface WebMCPInitOptions {
  site: string;
  tools?: WebMCPToolDescriptor[];
}

// ── Declarative Helpers ──

/**
 * Generate HTML attributes for a declarative WebMCP form.
 * Append to your <form> tag.
 *
 * @example
 *   `<form ${webmcpFormAttrs('book_consultation', 'Book a consultation meeting.')}>`
 */
export function webmcpFormAttrs(toolname: string, tooldescription: string): string {
  const escapedDesc = tooldescription.replace(/"/g, '&quot;');
  return `toolname="${toolname}" tooldescription="${escapedDesc}"`;
}

// ── Imperative Script Generator ──

/**
 * Generate a <script> block that registers tools via navigator.modelContext.
 * Include this in your page <head> or before </body>.
 *
 * Feature detection is built in — outputs a no-op on unsupported browsers.
 */
export function webmcpImperativeScript(tools: WebMCPToolDescriptor[]): string {
  const toolDefs = tools.map(t => {
    const schema = JSON.stringify(t.inputSchema, null, 2);
    const execBody = t.executeBody || `return { content: [{ type: 'text', text: 'Tool ${t.name} executed.' }] };`;
    return `    {
      name: ${JSON.stringify(t.name)},
      description: ${JSON.stringify(t.description)},
      inputSchema: ${schema},
      execute: function(params) { ${execBody} }
    }`;
  }).join(',\n');

  return `<script>
(function() {
  if (!('modelContext' in navigator)) return;
  var tools = [
${toolDefs}
  ];
  tools.forEach(function(tool) {
    try { navigator.modelContext.registerTool(tool); } catch(e) { console.warn('[WebMCP] register failed:', tool.name, e); }
  });
})();
</script>`;
}

/**
 * Generate the standard WebMCP <head> tags for a site.
 * Includes meta discovery tags and the webmcp-tools.js script reference.
 */
export function webmcpHeadTags(site?: string): string {
  const siteMeta = site ? `\n<meta name="webmcp-site" content="${site}">` : '';
  const manifest = `\n<link rel="webmcp-manifest" href="/.well-known/webmcp.json">`;
  return `<meta name="model-context" content="supported">
<meta name="webmcp-version" content="1.0">${siteMeta}${manifest}
<script src="/webmcp-tools.js" defer></script>`;
}

/**
 * Generate a contact form with declarative WebMCP annotations.
 * The form includes toolname="send-message" and tooldescription attrs
 * so Chrome 146+ agents can discover it via DOM inspection.
 */
export function webmcpContactForm(opts?: { toolname?: string; tooldescription?: string }): string {
  const name = opts?.toolname || 'send-message';
  const desc = opts?.tooldescription || 'Send a message or inquiry. Provide your name, email, and message.';
  return `<form id="contact-form" ${webmcpFormAttrs(name, desc)}>
  <input type="text" name="name" placeholder="Your name" aria-label="Your name" required />
  <input type="email" name="email" placeholder="Your email" aria-label="Your email address" required />
  <input type="text" name="subject" placeholder="Subject (optional)" aria-label="Message subject" />
  <textarea name="message" placeholder="Your message..." aria-label="Your message" required></textarea>
  <button type="submit">Send Message</button>
</form>`;
}

/**
 * Generate a .well-known/webmcp.json manifest for a site.
 */
export function webmcpManifest(site: string, description: string, tools: { name: string; description: string; path?: string; endpoint?: string; dynamic?: boolean }[]): string {
  return JSON.stringify({
    version: '1.0',
    site,
    description,
    tools: tools.map(t => {
      const entry: Record<string, unknown> = { name: t.name, description: t.description };
      if (t.path) entry.path = t.path;
      if (t.endpoint) entry.endpoint = t.endpoint;
      if (t.dynamic) entry.dynamic = true;
      return entry;
    }),
    support: { declarative: true, imperative: true }
  }, null, 2);
}
