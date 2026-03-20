/**
 * WebMCP initialization for helloam.bot
 * Include after webmcp-tools.js
 *
 * Tools registered:
 *   - join_helloam_mailing_list (declarative — auto-discovered from form[toolname])
 *   - preorder_helloam_device (imperative — Stripe redirect checkout)
 *   - pilot_program_apply (imperative — opens contact modal flow)
 *   - book_helloam_session (imperative — session checkout via Stripe)
 *   - check_helloam_availability (imperative — queries booking /api/slots)
 *   - contact_helloam (imperative — contact form submission)
 */
document.addEventListener('DOMContentLoaded', function () {
  if (typeof WebMCP === 'undefined') return;

  WebMCP.init({
    site: 'helloam.bot',
    tools: [
      // --- Pre-Order (imperative — Stripe redirect, not a plain form) ---
      {
        name: 'preorder_helloam_device',
        description: 'Pre-order the Am device with a 50% deposit via Stripe. Requires name, email, and shipping address. Redirects to Stripe checkout.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Full name of the buyer' },
            email: { type: 'string', format: 'email', description: 'Email address for order confirmation' },
            color: { type: 'string', description: 'Device skin color (e.g. "obsidian", "arctic", "sage")' },
            mode: { type: 'string', description: '"single" or "rack"', enum: ['single', 'rack'] },
            qty: { type: 'number', description: 'Quantity (1 for single, 2-6 for rack)' },
            address_line1: { type: 'string', description: 'Street address' },
            address_city: { type: 'string', description: 'City' },
            address_state: { type: 'string', description: 'State' },
            address_zip: { type: 'string', description: 'ZIP code' }
          },
          required: ['name', 'email']
        },
        execute: function (params) {
          // Scroll to device section
          var deviceSection = document.getElementById('device');
          if (deviceSection) deviceSection.scrollIntoView({ behavior: 'smooth' });

          // Try to find and click the Pre-Order Now button to open the checkout modal
          var preorderBtn = document.querySelector('#device button[class*="cursor-pointer"]');
          if (!preorderBtn) {
            // Fallback: look for any button containing "Pre-Order"
            var buttons = document.querySelectorAll('#device button');
            for (var i = 0; i < buttons.length; i++) {
              if (buttons[i].textContent && buttons[i].textContent.indexOf('Pre-Order') !== -1) {
                preorderBtn = buttons[i];
                break;
              }
            }
          }

          if (preorderBtn) {
            preorderBtn.click();

            // Fill checkout modal fields after a short delay for React to render
            setTimeout(function () {
              var inputs = document.querySelectorAll('.fixed input');
              inputs.forEach(function (input) {
                var placeholder = (input.getAttribute('placeholder') || '').toLowerCase();
                var val = null;
                if (placeholder.indexOf('name') !== -1 && params.name) val = params.name;
                else if (placeholder.indexOf('email') !== -1 && params.email) val = params.email;
                else if (placeholder.indexOf('street') !== -1 && params.address_line1) val = params.address_line1;
                else if (placeholder.indexOf('city') !== -1 && params.address_city) val = params.address_city;
                else if (placeholder.indexOf('state') !== -1 && params.address_state) val = params.address_state;
                else if (placeholder.indexOf('zip') !== -1 && params.address_zip) val = params.address_zip;

                if (val !== null) {
                  var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                  nativeInputValueSetter.call(input, val);
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                }
              });

              return {
                content: [{ type: 'text', text: 'Pre-order checkout modal opened and fields populated. User must click "Pay Deposit" to complete via Stripe.' }]
              };
            }, 500);
          }

          return {
            content: [{ type: 'text', text: 'Navigated to device section. Pre-order form should be visible at #device on helloam.bot.' }]
          };
        }
      },

      // --- Pilot Program Application (imperative — contact modal) ---
      {
        name: 'pilot_program_apply',
        description: 'Apply for the helloam.bot Pilot Program. Requires name, email, and a message about who you are and how you plan to use Am.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Applicant full name' },
            email: { type: 'string', format: 'email', description: 'Applicant email address' },
            message: { type: 'string', description: 'Why you want to join the pilot program and how you plan to use Am' }
          },
          required: ['name', 'email', 'message']
        },
        execute: function (params) {
          // Scroll to pilot section
          var pilotSection = document.getElementById('pilot');
          if (pilotSection) pilotSection.scrollIntoView({ behavior: 'smooth' });

          // Click the "Apply for Pilot Access" button to open contact modal
          var applyBtn = null;
          var buttons = document.querySelectorAll('#pilot button');
          for (var i = 0; i < buttons.length; i++) {
            if (buttons[i].textContent && buttons[i].textContent.indexOf('Apply') !== -1) {
              applyBtn = buttons[i];
              break;
            }
          }

          if (applyBtn) {
            applyBtn.click();

            // Fill contact modal fields after React renders
            setTimeout(function () {
              var modal = document.querySelector('.fixed[class*="z-"]');
              if (!modal) return;
              var inputs = modal.querySelectorAll('input, textarea');
              inputs.forEach(function (input) {
                var placeholder = (input.getAttribute('placeholder') || '').toLowerCase();
                var val = null;
                if (placeholder.indexOf('name') !== -1 && params.name) val = params.name;
                else if (placeholder.indexOf('email') !== -1 && params.email) val = params.email;
                else if (placeholder.indexOf('mind') !== -1 && params.message) val = params.message;

                if (val !== null) {
                  var setter = input.tagName === 'TEXTAREA'
                    ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
                    : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                  setter.call(input, val);
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                }
              });
            }, 500);

            return {
              content: [{ type: 'text', text: 'Pilot program application modal opened and fields populated. Category set to "Pilot Program".' }]
            };
          }

          // Fallback: submit via /api/contact directly
          return fetch('/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: params.name,
              email: params.email,
              message: params.message,
              category: 'Pilot Program'
            })
          }).then(function (res) { return res.json(); })
            .then(function (data) {
              return {
                content: [{ type: 'text', text: data.success ? 'Pilot program application submitted successfully.' : 'Submission failed: ' + (data.error || 'Unknown error') }]
              };
            });
        }
      },

      // --- Book a Session (imperative — Stripe payment) ---
      {
        name: 'book_helloam_session',
        description: 'Book a 30-minute live session with the helloam founder. Requires name and email. Payment via Stripe.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Full name of the person booking' },
            email: { type: 'string', format: 'email', description: 'Email address for confirmation' }
          },
          required: ['name', 'email']
        },
        execute: function (params) {
          // Scroll to support section
          var supportSection = document.getElementById('support');
          if (supportSection) supportSection.scrollIntoView({ behavior: 'smooth' });

          // Click "Book a Session" button
          var bookBtn = null;
          var buttons = document.querySelectorAll('#support button');
          for (var i = 0; i < buttons.length; i++) {
            if (buttons[i].textContent && buttons[i].textContent.indexOf('Book a Session') !== -1) {
              bookBtn = buttons[i];
              break;
            }
          }

          if (bookBtn) {
            bookBtn.click();

            // Fill session checkout modal fields after React renders
            setTimeout(function () {
              var modal = document.querySelector('.fixed[class*="z-"]');
              if (!modal) return;
              var inputs = modal.querySelectorAll('input');
              inputs.forEach(function (input) {
                var placeholder = (input.getAttribute('placeholder') || '').toLowerCase();
                var val = null;
                if (placeholder.indexOf('name') !== -1 && params.name) val = params.name;
                else if (placeholder.indexOf('email') !== -1 && params.email) val = params.email;

                if (val !== null) {
                  var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                  nativeInputValueSetter.call(input, val);
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                }
              });
            }, 500);

            return {
              content: [{ type: 'text', text: 'Session booking modal opened and fields populated. User must click "Continue to Payment" to proceed via Stripe.' }]
            };
          }

          return {
            content: [{ type: 'text', text: 'Session booking button not found. Navigate to helloam.bot#support to book.' }]
          };
        }
      },

      // --- Check Availability (imperative — API call) ---
      {
        name: 'check_helloam_availability',
        description: 'Check available booking slots for helloam sessions. Optionally filter by date.',
        inputSchema: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'ISO date (YYYY-MM-DD) to check availability for. If omitted, returns all upcoming available slots.' }
          }
        },
        execute: function (params) {
          return fetch('/api/slots')
            .then(function (res) { return res.json(); })
            .then(function (data) {
              var slots = (data.slots || []).filter(function (s) { return s.available; });
              if (params.date) {
                slots = slots.filter(function (s) { return s.time && s.time.startsWith(params.date); });
              }
              if (slots.length === 0) {
                return {
                  content: [{ type: 'text', text: params.date ? 'No available slots on ' + params.date + '.' : 'No available slots found.' }]
                };
              }
              var formatted = slots.slice(0, 20).map(function (s) {
                var d = new Date(s.time);
                return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
                  ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
              }).join('\n');
              return {
                content: [{ type: 'text', text: 'Available slots (' + slots.length + '):\n' + formatted }]
              };
            })
            .catch(function () {
              return {
                content: [{ type: 'text', text: 'Could not fetch availability. The booking API may not be running.' }]
              };
            });
        }
      },

      // --- Contact (imperative — contact form/API) ---
      {
        name: 'contact_helloam',
        description: 'Send a contact message to the helloam team. Requires name, email, and message.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Your name' },
            email: { type: 'string', format: 'email', description: 'Your email address' },
            message: { type: 'string', description: 'Your message' },
            category: { type: 'string', description: 'Message category (General, Support, Pilot Program)', enum: ['General', 'Support', 'Pilot Program'] }
          },
          required: ['name', 'email', 'message']
        },
        execute: function (params) {
          return fetch('/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: params.name,
              email: params.email,
              message: params.message,
              category: params.category || 'General'
            })
          }).then(function (res) { return res.json(); })
            .then(function (data) {
              return {
                content: [{ type: 'text', text: data.success ? 'Message sent successfully. The team will respond within 24 hours.' : 'Failed to send: ' + (data.error || 'Unknown error') }]
              };
            })
            .catch(function () {
              return {
                content: [{ type: 'text', text: 'Network error. Could not reach the contact API.' }]
              };
            });
        }
      }
    ]
  });

  // The join_helloam_mailing_list tool is registered declaratively via
  // toolname="join_helloam_mailing_list" on the waitlist <form> element.
  // webmcp-tools.js auto-discovers it via discoverDeclarativeForms().
});
