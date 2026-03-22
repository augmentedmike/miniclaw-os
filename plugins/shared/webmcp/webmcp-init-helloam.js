/**
 * WebMCP initialization for helloam.bot
 * Include after webmcp-tools.js
 *
 * Supports both DOMContentLoaded and async loading (Next.js afterInteractive).
 * Graceful fallback: tools are stored locally even on non-WebMCP browsers,
 * enabling future agent discovery without breaking the page.
 */
(function () {
  function doInit() {
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
            var chatToggle = document.querySelector('#chat-toggle, .chat-widget-toggle, [data-chat-open]');
            if (chatToggle) chatToggle.click();

            var chatInput = document.querySelector('#chat-input, .chat-input, [data-chat-input]');
            if (chatInput) {
              chatInput.value = params.message;
              chatInput.dispatchEvent(new Event('input', { bubbles: true }));
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
              if (typeof form.requestSubmit === 'function') { form.requestSubmit(); }
              else { form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true })); }
              return { content: [{ type: 'text', text: 'Contact message sent.' }] };
            }
            return { content: [{ type: 'text', text: 'Contact form not found on this page.' }] };
          }
        },
        {
          name: 'join_helloam_mailing_list',
          description: 'Subscribe to the helloam.bot mailing list for launch updates.',
          inputSchema: {
            type: 'object',
            properties: {
              email: { type: 'string', format: 'email', description: 'Email address to subscribe' }
            },
            required: ['email']
          },
          execute: function (params) {
            // Navigate to waitlist section
            window.location.hash = '#waitlist';
            var form = document.querySelector('#waitlist form, form[toolname="join-waitlist"], [data-waitlist-form]');
            if (form) {
              var emailField = form.querySelector('input[type="email"], input[name="email"]');
              if (emailField) {
                emailField.value = params.email;
                emailField.dispatchEvent(new Event('input', { bubbles: true }));
              }
              if (typeof form.requestSubmit === 'function') { form.requestSubmit(); }
              else { form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true })); }
              return { content: [{ type: 'text', text: 'Subscribed to helloam.bot mailing list.' }] };
            }
            return { content: [{ type: 'text', text: 'Navigated to waitlist section. Please enter your email to subscribe.' }] };
          }
        },
        {
          name: 'preorder_helloam_device',
          description: 'Pre-order the Am device with a deposit via Stripe.',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Your full name for the pre-order' },
              email: { type: 'string', format: 'email', description: 'Email for order confirmation' }
            },
            required: ['email']
          },
          execute: function (params) {
            window.location.hash = '#device';
            var orderBtn = document.querySelector('#device [data-preorder], #device button, a[href*="stripe"], [data-checkout]');
            if (orderBtn) {
              orderBtn.click();
              return { content: [{ type: 'text', text: 'Pre-order initiated. Redirecting to Stripe checkout.' }] };
            }
            return { content: [{ type: 'text', text: 'Navigated to device section. Click the pre-order button to proceed.' }] };
          }
        },
        {
          name: 'pilot_program_apply',
          description: 'Apply for the helloam Pilot Program for early hardware access.',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Your full name' },
              email: { type: 'string', format: 'email', description: 'Your email address' },
              reason: { type: 'string', description: 'Why you want to join the pilot program' }
            },
            required: ['name', 'email']
          },
          execute: function (params) {
            window.location.hash = '#pilot';
            var form = document.querySelector('#pilot form, form[toolname="pilot-apply"], [data-pilot-form]');
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
              return { content: [{ type: 'text', text: 'Pilot program application submitted.' }] };
            }
            return { content: [{ type: 'text', text: 'Navigated to pilot program section. Please complete the application form.' }] };
          }
        },
        {
          name: 'book_helloam_session',
          description: 'Book a 30-minute live session with the founder.',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Your full name' },
              email: { type: 'string', format: 'email', description: 'Your email address' },
              date: { type: 'string', description: 'Preferred date (YYYY-MM-DD)' }
            },
            required: ['name', 'email']
          },
          execute: function (params) {
            window.location.hash = '#support';
            var form = document.querySelector('#support form, form[toolname="book-session"], [data-booking-form]');
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
              return { content: [{ type: 'text', text: 'Session booking submitted.' }] };
            }
            return { content: [{ type: 'text', text: 'Navigated to support section. Please complete the booking form.' }] };
          }
        }
      ]
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', doInit);
  } else {
    doInit();
  }
})();
