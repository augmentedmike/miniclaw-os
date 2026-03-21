/**
 * WebMCP initialization for augmentedmike.com
 * Include after webmcp-tools.js
 */
document.addEventListener('DOMContentLoaded', function () {
  if (typeof WebMCP === 'undefined') return;

  WebMCP.init({
    site: 'augmentedmike.com',
    tools: [
      {
        name: 'request-demo',
        description: 'Request a demo of AugmentedMike AI consulting services. Schedule a walkthrough of AI automation capabilities.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Your name' },
            email: { type: 'string', format: 'email', description: 'Your email address' },
            company: { type: 'string', description: 'Your company or organization' },
            use_case: { type: 'string', description: 'Describe your AI automation use case or interest' }
          },
          required: ['name', 'email']
        },
        execute: function (params) {
          var form = document.querySelector('form[toolname="request-demo"]') ||
                     document.querySelector('#demo-form') ||
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
            return { content: [{ type: 'text', text: 'Demo request submitted.' }] };
          }
          return { content: [{ type: 'text', text: 'Demo request form not found on this page.' }] };
        }
      },
      {
        name: 'send-message',
        description: 'Send a message to Mike O\'Neal via the contact form on augmentedmike.com.',
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
            return { content: [{ type: 'text', text: 'Message sent successfully.' }] };
          }
          return { content: [{ type: 'text', text: 'Contact form not found on this page.' }] };
        }
      }
    ]
  });
});
