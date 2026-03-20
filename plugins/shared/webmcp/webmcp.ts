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
export function webmcpHeadTags(): string {
  return `<meta name="model-context" content="supported">
<meta name="webmcp-version" content="1.0">
<script src="/webmcp-tools.js" defer></script>`;
}
