/**
 * WebMCP initialization for helloam.bot
 * Include after webmcp-tools.js
 */
document.addEventListener('DOMContentLoaded', function () {
  if (typeof WebMCP === 'undefined') return;

  WebMCP.init({
    site: 'helloam.bot',
    tools: [
      {
        name: 'chat-with-am',
        description: 'Start a conversation with Am, the AI assistant at helloam.bot. Ask questions about services, capabilities, or get help.',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'The message or question to ask Am'
            }
          },
          required: ['message']
        },
        execute: function (params) {
          // Activate the chat widget if present
          var chatToggle = document.querySelector('#chat-toggle, .chat-widget-toggle, [data-chat-open]');
          if (chatToggle) chatToggle.click();

          var chatInput = document.querySelector('#chat-input, .chat-input, [data-chat-input]');
          if (chatInput) {
            chatInput.value = params.message;
            chatInput.dispatchEvent(new Event('input', { bubbles: true }));
            // Try to submit
            var sendBtn = document.querySelector('#chat-send, .chat-send, [data-chat-send]');
            if (sendBtn) sendBtn.click();
            return { content: [{ type: 'text', text: 'Message sent to Am chat widget.' }] };
          }
          return { content: [{ type: 'text', text: 'Chat widget not found on this page. Visit helloam.bot to chat.' }] };
        }
      },
      {
        name: 'send-message',
        description: 'Send a contact message via helloam.bot.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Your name' },
            email: { type: 'string', format: 'email', description: 'Your email address' },
            message: { type: 'string', description: 'Your message' }
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
            return { content: [{ type: 'text', text: 'Contact message sent.' }] };
          }
          return { content: [{ type: 'text', text: 'Contact form not found on this page.' }] };
        }
      }
    ]
  });
});
