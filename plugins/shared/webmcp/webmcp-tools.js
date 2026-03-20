/**
 * webmcp-tools.js — Shared WebMCP utility for MiniClaw sites
 *
 * Provides both declarative form annotation and imperative
 * navigator.modelContext registration with graceful fallback
 * for browsers without WebMCP support (pre-Chrome 146).
 *
 * Usage:
 *   <script src="/webmcp-tools.js"></script>
 *   <script>
 *     WebMCP.init({ site: 'miniclaw.bot' });
 *   </script>
 *
 * Declarative: Add toolname/tooldescription attributes to <form> elements.
 * Imperative: Call WebMCP.registerTool({ name, description, inputSchema, execute }).
 */
(function (global) {
  'use strict';

  const VERSION = '1.0.0';
  const _registeredTools = new Map();
  let _initialized = false;
  let _supportsWebMCP = false;

  /**
   * Check if the browser supports navigator.modelContext (Chrome 146+)
   */
  function checkSupport() {
    return typeof navigator !== 'undefined' &&
           typeof navigator.modelContext !== 'undefined' &&
           typeof navigator.modelContext.registerTool === 'function';
  }

  /**
   * Auto-discover forms with toolname/tooldescription attributes
   * and register them via the imperative API if available.
   */
  function discoverDeclarativeForms() {
    const forms = document.querySelectorAll('form[toolname]');
    forms.forEach(function (form) {
      const name = form.getAttribute('toolname');
      const description = form.getAttribute('tooldescription') || '';
      if (!name) return;

      // Build inputSchema from form fields
      var properties = {};
      var required = [];
      var inputs = form.querySelectorAll('input[name], textarea[name], select[name]');
      inputs.forEach(function (input) {
        var fieldName = input.getAttribute('name');
        var fieldType = input.getAttribute('type') || 'text';
        var label = input.getAttribute('placeholder') ||
                    input.getAttribute('aria-label') ||
                    (input.labels && input.labels[0] ? input.labels[0].textContent : '') ||
                    fieldName;

        var schema = { type: 'string', description: label };
        if (fieldType === 'email') {
          schema.format = 'email';
        } else if (fieldType === 'number') {
          schema.type = 'number';
        } else if (fieldType === 'url') {
          schema.format = 'uri';
        }

        properties[fieldName] = schema;

        if (input.hasAttribute('required')) {
          required.push(fieldName);
        }
      });

      var toolDescriptor = {
        name: name,
        description: description,
        inputSchema: {
          type: 'object',
          properties: properties,
          required: required
        },
        execute: function (params) {
          // Fill form fields with provided values
          Object.keys(params).forEach(function (key) {
            var field = form.querySelector('[name="' + key + '"]');
            if (field) {
              field.value = params[key];
              field.dispatchEvent(new Event('input', { bubbles: true }));
              field.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });

          // Submit the form (use requestSubmit for proper SubmitEvent dispatch)
          if (typeof form.requestSubmit === 'function') {
            form.requestSubmit();
          } else {
            form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: form.querySelector('button[type="submit"]') }));
          }

          return {
            content: [{
              type: 'text',
              text: 'Form "' + name + '" submitted with provided values.'
            }]
          };
        }
      };

      registerToolInternal(toolDescriptor);
    });
  }

  /**
   * Register a tool with navigator.modelContext if available,
   * otherwise store it locally for potential future use.
   */
  function registerToolInternal(descriptor) {
    _registeredTools.set(descriptor.name, descriptor);

    if (_supportsWebMCP) {
      try {
        navigator.modelContext.registerTool(descriptor);
        console.log('[WebMCP] Registered tool: ' + descriptor.name);
      } catch (err) {
        console.warn('[WebMCP] Failed to register tool "' + descriptor.name + '":', err);
      }
    } else {
      console.log('[WebMCP] Stored tool (no browser support): ' + descriptor.name);
    }
  }

  /**
   * Initialize WebMCP for a site.
   * @param {Object} opts
   * @param {string} opts.site - Domain name (e.g. 'miniclaw.bot')
   * @param {Array}  opts.tools - Optional array of tool descriptors to register immediately
   */
  function init(opts) {
    if (_initialized) return;
    _initialized = true;
    opts = opts || {};

    _supportsWebMCP = checkSupport();

    console.log('[WebMCP] v' + VERSION + ' | site: ' + (opts.site || 'unknown') +
                ' | browser support: ' + _supportsWebMCP);

    // Register any tools passed at init time
    if (opts.tools && Array.isArray(opts.tools)) {
      opts.tools.forEach(function (tool) {
        registerToolInternal(tool);
      });
    }

    // Auto-discover declarative forms once DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', discoverDeclarativeForms);
    } else {
      discoverDeclarativeForms();
    }
  }

  /**
   * Register a single tool imperatively.
   */
  function registerTool(descriptor) {
    if (!descriptor || !descriptor.name) {
      console.warn('[WebMCP] registerTool requires a descriptor with a name');
      return;
    }
    registerToolInternal(descriptor);
  }

  /**
   * Unregister a tool by name.
   */
  function unregisterTool(name) {
    _registeredTools.delete(name);
    if (_supportsWebMCP) {
      try {
        navigator.modelContext.unregisterTool(name);
        console.log('[WebMCP] Unregistered tool: ' + name);
      } catch (err) {
        console.warn('[WebMCP] Failed to unregister tool "' + name + '":', err);
      }
    }
  }

  /**
   * Get all registered tools (for debugging / introspection).
   */
  function getTools() {
    var result = [];
    _registeredTools.forEach(function (tool) {
      result.push({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      });
    });
    return result;
  }

  /**
   * Check if WebMCP is supported in the current browser.
   */
  function isSupported() {
    return _supportsWebMCP;
  }

  // Public API
  var WebMCP = {
    version: VERSION,
    init: init,
    registerTool: registerTool,
    unregisterTool: unregisterTool,
    getTools: getTools,
    isSupported: isSupported,
    discoverForms: discoverDeclarativeForms
  };

  // Expose globally
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebMCP;
  } else {
    global.WebMCP = WebMCP;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
