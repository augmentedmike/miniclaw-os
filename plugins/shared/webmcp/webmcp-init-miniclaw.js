/**
 * WebMCP initialization for miniclaw.bot
 * Include after webmcp-tools.js
 *
 * Supports both DOMContentLoaded and async loading (Next.js afterInteractive).
 *
 * Registers tools:
 *   - view-portfolio (imperative, always)
 *   - send-message (imperative, always)
 *   - check_availability (imperative, fetches /api/slots)
 *   - chat_with_am (imperative, dynamic - registered when WS connected, unregistered on disconnect)
 *   - search_docs (imperative, queries docs endpoint)
 *
 * Declarative: The booking form in embed.ts has toolname="book-consultation"
 * and is auto-discovered by webmcp-tools.js discoverDeclarativeForms().
 */
(function () {
  function doInit() {
    if (typeof WebMCP === 'undefined') return;

    WebMCP.init({
      site: 'miniclaw.bot',
      tools: [
        {
          name: 'view-portfolio',
          description: 'View the MiniClaw project portfolio \u2014 AI-native tools, plugins, and automations built by Mike O\'Neal.',
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
              if (typeof form.requestSubmit === 'function') { form.requestSubmit(); }
              else { form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true })); }
              return { content: [{ type: 'text', text: 'Message submitted successfully.' }] };
            }
            return { content: [{ type: 'text', text: 'Contact form not found on this page.' }] };
          }
        },
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
        {
          name: 'search_docs',
          description: 'Search MiniClaw documentation. Find information about plugins, APIs, setup guides, and architecture.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query \u2014 keywords or topic to find in documentation'
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

    // Chat with Am (Dynamic Registration)
    (function () {
      if (typeof WebMCP === 'undefined' || !WebMCP.isSupported()) return;

      var chatToolRegistered = false;
      var chatWs = null;
      var pendingRequests = new Map();
      var requestCounter = 0;

      function registerChatTool() {
        if (chatToolRegistered) return;
        chatToolRegistered = true;

        WebMCP.registerTool({
          name: 'chat_with_am',
          description: 'Send a message to Am, the AI assistant. Returns Am\'s response.',
          inputSchema: {
            type: 'object',
            properties: {
              message: { type: 'string', description: 'The message or question to send to Am' }
            },
            required: ['message']
          },
          execute: function (params) {
            return new Promise(function (resolve) {
              if (!chatWs || chatWs.readyState !== WebSocket.OPEN) {
                resolve({ content: [{ type: 'text', text: 'Chat is not currently connected.' }] });
                return;
              }
              var reqId = 'req_' + (++requestCounter);
              var timer = setTimeout(function () {
                if (pendingRequests.has(reqId)) {
                  pendingRequests.delete(reqId);
                  resolve({ content: [{ type: 'text', text: 'Chat response timed out after 60 seconds.' }] });
                }
              }, 60000);
              pendingRequests.set(reqId, { resolve: resolve, timer: timer });
              chatWs.send(JSON.stringify({ type: 'chat', content: params.message, requestId: reqId }));
            });
          }
        });
      }

      function unregisterChatTool() {
        if (!chatToolRegistered) return;
        chatToolRegistered = false;
        WebMCP.unregisterTool('chat_with_am');
      }

      function handleChatMessage(event) {
        try {
          var data = JSON.parse(event.data);
          if (data.type === 'result') {
            var reqId = data.requestId;
            if (reqId && pendingRequests.has(reqId)) {
              var entry = pendingRequests.get(reqId);
              pendingRequests.delete(reqId);
              clearTimeout(entry.timer);
              entry.resolve({ content: [{ type: 'text', text: data.text || 'Am responded.' }] });
            } else if (pendingRequests.size > 0) {
              var firstKey = pendingRequests.keys().next().value;
              var firstEntry = pendingRequests.get(firstKey);
              pendingRequests.delete(firstKey);
              clearTimeout(firstEntry.timer);
              firstEntry.resolve({ content: [{ type: 'text', text: data.text || 'Am responded.' }] });
            }
          }
        } catch (e) { /* ignore */ }
      }

      function connectChat(wsUrl) {
        chatWs = new WebSocket(wsUrl);
        chatWs.addEventListener('open', function () {
          chatWs.send(JSON.stringify({ type: 'join' }));
          registerChatTool();
        });
        chatWs.addEventListener('message', handleChatMessage);
        chatWs.addEventListener('close', function () { chatWs = null; unregisterChatTool(); });
        chatWs.addEventListener('error', function () { chatWs = null; unregisterChatTool(); });
      }

      function observeChat() {
        var chatWidget = document.querySelector('#chat-widget, [data-chat-ws], [data-ws-url]');
        if (chatWidget) {
          var wsUrl = chatWidget.dataset.wsUrl || chatWidget.dataset.chatWs;
          if (wsUrl) { connectChat(wsUrl); return; }
        }
        var observer = new MutationObserver(function (mutations) {
          for (var i = 0; i < mutations.length; i++) {
            var nodes = mutations[i].addedNodes;
            for (var j = 0; j < nodes.length; j++) {
              var node = nodes[j];
              if (node.nodeType === 1) {
                var el = node.querySelector ? node.querySelector('[data-ws-url], [data-chat-ws]') : null;
                if (!el && node.dataset && (node.dataset.wsUrl || node.dataset.chatWs)) el = node;
                if (el) {
                  var url = el.dataset.wsUrl || el.dataset.chatWs;
                  if (url) { observer.disconnect(); connectChat(url); return; }
                }
              }
            }
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(function () { observer.disconnect(); }, 30000);
      }

      observeChat();
    })();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', doInit);
  } else {
    doInit();
  }
})();
