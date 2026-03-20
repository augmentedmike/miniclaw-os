/**
 * WebMCP initialization for miniclaw.bot
 * Include after webmcp-tools.js
 *
 * Registers tools:
 *   - view-portfolio (imperative, always)
 *   - send-message (imperative, always)
 *   - check_availability (imperative, fetches /api/slots)
 *   - chat_with_am (imperative, dynamic — registered when WS connected, unregistered on disconnect)
 *   - search_docs (imperative, queries docs endpoint)
 *
 * Declarative: The booking form in embed.ts has toolname="book-consultation"
 * and is auto-discovered by webmcp-tools.js discoverDeclarativeForms().
 */
document.addEventListener('DOMContentLoaded', function () {
  if (typeof WebMCP === 'undefined') return;

  WebMCP.init({
    site: 'miniclaw.bot',
    tools: [
      // ── Portfolio Navigation ──
      {
        name: 'view-portfolio',
        description: 'View the MiniClaw project portfolio — AI-native tools, plugins, and automations built by Mike O\'Neal.',
        inputSchema: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'Filter by category: plugins, automations, ai-tools, all',
              enum: ['plugins', 'automations', 'ai-tools', 'all']
            }
          }
        },
        execute: function (params) {
          var category = params.category || 'all';
          window.location.hash = '#portfolio' + (category !== 'all' ? '?cat=' + category : '');
          return {
            content: [{ type: 'text', text: 'Navigated to portfolio' + (category !== 'all' ? ' (' + category + ')' : '') + '.' }]
          };
        }
      },

      // ── Contact Form ──
      {
        name: 'send-message',
        description: 'Send a message or inquiry to the MiniClaw team via the contact form.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Your name' },
            email: { type: 'string', format: 'email', description: 'Your email address' },
            message: { type: 'string', description: 'Your message or inquiry' }
          },
          required: ['name', 'email', 'message']
        },
        execute: function (params) {
          var form = document.querySelector('form[toolname="send-message"]') ||
                     document.querySelector('#contact-form');
          if (form) {
            Object.keys(params).forEach(function (key) {
              var field = form.querySelector('[name="' + key + '"]');
              if (field) {
                field.value = params[key];
                field.dispatchEvent(new Event('input', { bubbles: true }));
              }
            });
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            return { content: [{ type: 'text', text: 'Message submitted successfully.' }] };
          }
          return { content: [{ type: 'text', text: 'Contact form not found on this page.' }] };
        }
      },

      // ── Check Availability (Booking Slots) ──
      {
        name: 'check_availability',
        description: 'Check available consultation time slots. Returns dates and times that are open for booking.',
        inputSchema: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'Optional ISO date (YYYY-MM-DD) to filter slots. If omitted, returns all available slots.'
            }
          }
        },
        execute: function (params) {
          var origin = window.location.origin;
          return fetch(origin + '/api/slots')
            .then(function (res) { return res.json(); })
            .then(function (data) {
              var slots = (data.slots || []).filter(function (s) { return s.available; });
              if (params.date) {
                slots = slots.filter(function (s) { return s.time && s.time.startsWith(params.date); });
              }
              var formatted = slots.map(function (s) {
                var d = new Date(s.time);
                return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
                       ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
              });
              if (formatted.length === 0) {
                return { content: [{ type: 'text', text: 'No available slots' + (params.date ? ' on ' + params.date : '') + '.' }] };
              }
              return {
                content: [{
                  type: 'text',
                  text: 'Available slots' + (params.date ? ' on ' + params.date : '') + ':\n' + formatted.join('\n')
                }]
              };
            })
            .catch(function (err) {
              return { content: [{ type: 'text', text: 'Failed to fetch availability: ' + err.message }] };
            });
        }
      },

      // ── Search Docs ──
      {
        name: 'search_docs',
        description: 'Search MiniClaw documentation. Find information about plugins, APIs, setup guides, and architecture.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query — keywords or topic to find in documentation'
            },
            tag: {
              type: 'string',
              description: 'Optional tag filter (e.g. "plugin", "api", "guide")'
            }
          },
          required: ['query']
        },
        execute: function (params) {
          var origin = window.location.origin;
          var url = origin + '/api/docs/search?q=' + encodeURIComponent(params.query);
          if (params.tag) url += '&tag=' + encodeURIComponent(params.tag);
          return fetch(url)
            .then(function (res) { return res.json(); })
            .then(function (data) {
              var results = data.results || data.documents || data.items || [];
              if (results.length === 0) {
                return { content: [{ type: 'text', text: 'No documentation found for "' + params.query + '".' }] };
              }
              var formatted = results.map(function (doc) {
                return '- ' + (doc.name || doc.title || 'Untitled') +
                       (doc.id ? ' (id: ' + doc.id + ')' : '') +
                       (doc.summary ? ': ' + doc.summary : '');
              }).join('\n');
              return {
                content: [{
                  type: 'text',
                  text: 'Documentation results for "' + params.query + '":\n' + formatted
                }]
              };
            })
            .catch(function (err) {
              return { content: [{ type: 'text', text: 'Docs search failed: ' + err.message }] };
            });
        }
      }
    ]
  });

  // ── Chat with Am (Dynamic Registration) ──
  // Only register when WebSocket chat is connected; unregister on disconnect.
  (function () {
    if (typeof WebMCP === 'undefined' || !WebMCP.isSupported()) return;

    var chatToolRegistered = false;
    var chatWs = null;
    var pendingResolve = null;

    function registerChatTool() {
      if (chatToolRegistered) return;
      chatToolRegistered = true;

      WebMCP.registerTool({
        name: 'chat_with_am',
        description: 'Send a message to Am, the AI assistant. Engages in real-time conversation via the site\'s WebSocket chat. Returns Am\'s response.',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'The message or question to send to Am'
            }
          },
          required: ['message']
        },
        execute: function (params) {
          return new Promise(function (resolve) {
            if (!chatWs || chatWs.readyState !== WebSocket.OPEN) {
              resolve({ content: [{ type: 'text', text: 'Chat is not currently connected. Please try again in a moment.' }] });
              return;
            }

            // Set up a one-time listener for the response
            pendingResolve = resolve;

            chatWs.send(JSON.stringify({
              type: 'chat',
              content: params.message
            }));

            // Timeout after 60 seconds
            setTimeout(function () {
              if (pendingResolve === resolve) {
                pendingResolve = null;
                resolve({ content: [{ type: 'text', text: 'Chat response timed out after 60 seconds.' }] });
              }
            }, 60000);
          });
        }
      });
    }

    function unregisterChatTool() {
      if (!chatToolRegistered) return;
      chatToolRegistered = false;
      WebMCP.unregisterTool('chat_with_am');
    }

    // Observe WebSocket connections — hook into the existing chat widget
    // The chat widget creates a WebSocket; we intercept it to track connection state.
    function observeChat() {
      // Method 1: Check for existing chat widget WebSocket reference
      var chatWidget = document.querySelector('#chat-widget, [data-chat-ws]');
      if (chatWidget && chatWidget.dataset.wsUrl) {
        connectChat(chatWidget.dataset.wsUrl);
        return;
      }

      // Method 2: Intercept WebSocket constructor to detect chat connections
      var OrigWebSocket = window.WebSocket;
      window.WebSocket = function (url, protocols) {
        var ws = protocols ? new OrigWebSocket(url, protocols) : new OrigWebSocket(url);
        // Detect chat WebSocket by URL pattern
        if (url && (url.indexOf('/ws') !== -1 || url.indexOf('chat') !== -1 || url.indexOf('4230') !== -1)) {
          chatWs = ws;
          ws.addEventListener('open', function () {
            // Send join message
            ws.send(JSON.stringify({ type: 'join' }));
            registerChatTool();
          });
          ws.addEventListener('message', function (event) {
            try {
              var data = JSON.parse(event.data);
              if (data.type === 'result' && pendingResolve) {
                var resolve = pendingResolve;
                pendingResolve = null;
                resolve({ content: [{ type: 'text', text: data.text || 'Am responded.' }] });
              }
            } catch (e) { /* ignore parse errors */ }
          });
          ws.addEventListener('close', function () {
            chatWs = null;
            unregisterChatTool();
          });
          ws.addEventListener('error', function () {
            chatWs = null;
            unregisterChatTool();
          });
        }
        return ws;
      };
      window.WebSocket.prototype = OrigWebSocket.prototype;
      window.WebSocket.CONNECTING = OrigWebSocket.CONNECTING;
      window.WebSocket.OPEN = OrigWebSocket.OPEN;
      window.WebSocket.CLOSING = OrigWebSocket.CLOSING;
      window.WebSocket.CLOSED = OrigWebSocket.CLOSED;
    }

    function connectChat(wsUrl) {
      chatWs = new WebSocket(wsUrl);
      chatWs.addEventListener('open', function () {
        chatWs.send(JSON.stringify({ type: 'join' }));
        registerChatTool();
      });
      chatWs.addEventListener('message', function (event) {
        try {
          var data = JSON.parse(event.data);
          if (data.type === 'result' && pendingResolve) {
            var resolve = pendingResolve;
            pendingResolve = null;
            resolve({ content: [{ type: 'text', text: data.text || 'Am responded.' }] });
          }
        } catch (e) { /* ignore */ }
      });
      chatWs.addEventListener('close', function () { chatWs = null; unregisterChatTool(); });
      chatWs.addEventListener('error', function () { chatWs = null; unregisterChatTool(); });
    }

    observeChat();
  })();
});
