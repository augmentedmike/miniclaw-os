export const WIDGET_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Book a Consultation</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; }
    .container { max-width: 640px; margin: 0 auto; padding: 2rem 1rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .subtitle { color: #888; margin-bottom: 2rem; }
    .price { color: #10b981; font-weight: 600; }
    .calendar { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: 1.5rem; }
    .cal-header { text-align: center; font-size: 0.75rem; color: #888; padding: 0.5rem 0; }
    .cal-day { text-align: center; padding: 0.5rem; border-radius: 6px; cursor: pointer; font-size: 0.875rem; background: #1a1a1a; border: 1px solid #333; }
    .cal-day:hover { border-color: #10b981; }
    .cal-day.available { background: #1a2e1a; border-color: #10b981; }
    .cal-day.selected { background: #10b981; color: #000; font-weight: 600; }
    .cal-day.empty { visibility: hidden; }
    .cal-day.unavailable { opacity: 0.3; cursor: not-allowed; }
    .times { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
    .time-btn { padding: 0.5rem 1rem; border-radius: 6px; background: #1a1a1a; border: 1px solid #333; color: #e5e5e5; cursor: pointer; font-size: 0.875rem; }
    .time-btn:hover { border-color: #10b981; }
    .time-btn.selected { background: #10b981; color: #000; font-weight: 600; }
    .time-btn:disabled { opacity: 0.3; cursor: not-allowed; }
    .form { display: flex; flex-direction: column; gap: 1rem; }
    .form input, .form textarea { background: #1a1a1a; border: 1px solid #333; color: #e5e5e5; padding: 0.75rem; border-radius: 6px; font-size: 0.875rem; }
    .form input:focus, .form textarea:focus { outline: none; border-color: #10b981; }
    .form textarea { resize: vertical; min-height: 80px; }
    .submit-btn { background: #10b981; color: #000; border: none; padding: 0.75rem; border-radius: 6px; font-size: 1rem; font-weight: 600; cursor: pointer; }
    .submit-btn:hover { background: #059669; }
    .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .nav button { background: none; border: 1px solid #333; color: #e5e5e5; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; }
    .nav button:hover { border-color: #10b981; }
    .month-label { font-weight: 600; }
    .hidden { display: none; }
    .success { text-align: center; padding: 2rem; }
    .success h2 { color: #10b981; margin-bottom: 1rem; }
    .error { color: #ef4444; font-size: 0.875rem; margin-top: 0.5rem; }
    .loading { text-align: center; padding: 2rem; color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Book a Consultation</h1>
    <p class="subtitle"><span class="price" id="price"></span> &middot; <span id="duration"></span> minutes</p>

    <div id="loading" class="loading">Loading available times...</div>

    <div id="booking-ui" class="hidden">
      <div class="nav">
        <button onclick="prevMonth()">&larr; Prev</button>
        <span class="month-label" id="month-label"></span>
        <button onclick="nextMonth()">Next &rarr;</button>
      </div>
      <div class="calendar" id="calendar"></div>
      <div class="times" id="times"></div>

      <form class="form" id="booking-form" onsubmit="submitBooking(event)"
            toolname="book-consultation"
            tooldescription="Book a paid consultation with Mike O'Neal. Select a date/time and provide your details.">
        <input type="text" name="name" placeholder="Your name" aria-label="Your full name" required />
        <input type="email" name="email" placeholder="Your email" aria-label="Your email address" required />
        <input type="text" name="interest" placeholder="What would you like to discuss?" aria-label="Topic of interest" />
        <textarea name="notes" placeholder="Any additional notes..." aria-label="Additional notes"></textarea>
        <div id="form-error" class="error hidden"></div>
        <button type="submit" class="submit-btn" id="submit-btn">Book Now</button>
      </form>
    </div>

    <div id="success" class="hidden success">
      <h2>Booking Confirmed!</h2>
      <p>Check your email for confirmation details.</p>
      <p id="success-details"></p>
    </div>
  </div>

  <script>
    const API = window.location.origin;
    let config = {};
    let slots = [];
    let currentMonth = new Date();
    let selectedDate = null;
    let selectedTime = null;

    async function init() {
      try {
        const [cfgRes, slotsRes] = await Promise.all([
          fetch(API + '/api/config').then(r => r.json()),
          fetch(API + '/api/slots').then(r => r.json()),
        ]);
        config = cfgRes;
        slots = slotsRes.slots;

        document.getElementById('price').textContent = '$' + (config.priceCents / 100).toFixed(2);
        document.getElementById('duration').textContent = config.durationMinutes;
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('booking-ui').classList.remove('hidden');
        renderCalendar();
      } catch (e) {
        document.getElementById('loading').textContent = 'Failed to load booking data.';
      }
    }

    function renderCalendar() {
      const cal = document.getElementById('calendar');
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();
      document.getElementById('month-label').textContent =
        new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      const headers = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      let html = headers.map(h => '<div class="cal-header">' + h + '</div>').join('');

      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        const daySlots = slots.filter(s => s.time.startsWith(dateStr) && s.available);
        const isSelected = selectedDate === dateStr;
        const cls = daySlots.length ? (isSelected ? 'selected' : 'available') : 'unavailable';
        const click = daySlots.length ? ' onclick="selectDate(\\'' + dateStr + '\\')"' : '';
        html += '<div class="cal-day ' + cls + '"' + click + '>' + d + '</div>';
      }

      cal.innerHTML = html;
    }

    function selectDate(dateStr) {
      selectedDate = dateStr;
      selectedTime = null;
      renderCalendar();
      renderTimes();
    }

    function renderTimes() {
      const container = document.getElementById('times');
      if (!selectedDate) { container.innerHTML = ''; return; }
      const daySlots = slots.filter(s => s.time.startsWith(selectedDate));
      container.innerHTML = daySlots.map(s => {
        const t = new Date(s.time);
        const label = t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const sel = selectedTime === s.time ? ' selected' : '';
        const dis = !s.available ? ' disabled' : '';
        return '<button type="button" class="time-btn' + sel + '"' + dis +
          ' onclick="selectTime(\\'' + s.time + '\\')">' + label + '</button>';
      }).join('');
    }

    function selectTime(time) {
      selectedTime = time;
      renderTimes();
    }

    function prevMonth() {
      currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1);
      renderCalendar();
    }

    function nextMonth() {
      currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1);
      renderCalendar();
    }

    async function submitBooking(e) {
      e.preventDefault();
      const form = document.getElementById('booking-form');
      const errEl = document.getElementById('form-error');
      errEl.classList.add('hidden');

      if (!selectedTime) {
        errEl.textContent = 'Please select a date and time.';
        errEl.classList.remove('hidden');
        return;
      }

      const btn = document.getElementById('submit-btn');
      btn.disabled = true;
      btn.textContent = 'Booking...';

      try {
        const data = {
          name: form.name.value,
          email: form.email.value,
          interest: form.interest.value,
          scheduled_time: selectedTime,
          notes: form.notes.value,
        };
        const res = await fetch(API + '/api/appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Booking failed');

        const t = new Date(selectedTime);
        document.getElementById('success-details').textContent =
          t.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) +
          ' at ' + t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        document.getElementById('booking-ui').classList.add('hidden');
        document.getElementById('success').classList.remove('hidden');
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Book Now';
      }
    }

    // --- WebMCP: Register booking tool via navigator.modelContext (Chrome 146+) ---
    (function() {
      if (typeof navigator !== 'undefined' && navigator.modelContext && typeof navigator.modelContext.registerTool === 'function') {
        navigator.modelContext.registerTool({
          name: 'book-consultation',
          description: "Book a paid consultation with Mike O'Neal. Provide name, email, topic of interest, and optional notes. The agent must also select an available date/time slot.",
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Full name of the person booking' },
              email: { type: 'string', format: 'email', description: 'Email address for confirmation' },
              interest: { type: 'string', description: 'Topic or subject to discuss' },
              notes: { type: 'string', description: 'Any additional notes or context' }
            },
            required: ['name', 'email']
          },
          execute: function(params) {
            var form = document.getElementById('booking-form');
            if (!form) return { content: [{ type: 'text', text: 'Booking form not available.' }] };
            Object.keys(params).forEach(function(key) {
              var field = form.querySelector('[name="' + key + '"]');
              if (field) {
                field.value = params[key];
                field.dispatchEvent(new Event('input', { bubbles: true }));
              }
            });
            return {
              content: [{
                type: 'text',
                text: 'Form fields populated. Please select an available date and time slot, then submit.'
              }]
            };
          }
        });
        console.log('[WebMCP] Registered tool: book-consultation');
      }
    })();

    init();
  </script>
</body>
</html>`;
