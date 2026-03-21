/**
 * webmcp-chat.js — WebMCP imperative registration for the MiniClaw chat widget.
 *
 * Include this script on any page that embeds the mc-web-chat widget.
 * It registers a 'chat-with-ai' tool via navigator.modelContext so
 * AI agents (Chrome 146+) can initiate chat sessions programmatically.
 *
 * Usage:
 *   <script src="/webmcp-chat.js" data-ws-url="wss://chat.miniclaw.bot"></script>
 */
(function () {
  'use strict';

  if (typeof navigator === 'undefined' || !navigator.modelContext ||
      typeof navigator.modelContext.registerTool !== 'function') {
    console.log('[WebMCP-Chat] navigator.modelContext not available — skipping registration');
    return;
  }

  // Determine WebSocket URL from script data attribute or default
  var scriptEl = document.currentScript;
  var wsUrl = (scriptEl && scriptEl.getAttribute('data-ws-url')) || 'wss://chat.miniclaw.bot';

  navigator.modelContext.registerTool({
    name: 'chat-with-ai',
    description: "Start a chat session with Mike O'Neal's AI assistant. Send a message and receive an AI-powered response about MiniClaw, consulting, projects, or general inquiries.",
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'The message to send to the AI assistant'
        }
      },
      required: ['message']
    },
    execute: function (params) {
      return new Promise(function (resolve) {
        var ws = new WebSocket(wsUrl);
        var sessionId = null;
        var timeout = setTimeout(function () {
          ws.close();
          resolve({
            content: [{ type: 'text', text: 'Chat request timed out after 30 seconds.' }]
          });
        }, 30000);

        ws.onopen = function () {
          ws.send(JSON.stringify({ type: 'join' }));
        };

        ws.onmessage = function (ev) {
          try {
            var data = JSON.parse(ev.data);

            if (data.type === 'joined') {
              sessionId = data.sessionId;
              ws.send(JSON.stringify({
                type: 'chat',
                content: params.message
              }));
            }

            if (data.type === 'result' && data.text) {
              clearTimeout(timeout);
              ws.close();
              resolve({
                content: [{
                  type: 'text',
                  text: data.text
                }]
              });
            }
          } catch (e) {
            // Ignore parse errors on partial messages
          }
        };

        ws.onerror = function () {
          clearTimeout(timeout);
          resolve({
            content: [{ type: 'text', text: 'Failed to connect to chat service.' }]
          });
        };
      });
    }
  });

  console.log('[WebMCP-Chat] Registered tool: chat-with-ai');
})();
