/**
 * viewer-html.ts — inline noVNC web viewer page
 *
 * Served at GET /?token=<TOKEN> after token validation.
 * Loads noVNC from CDN (unpkg/jsdelivr) and auto-connects to the local
 * WebSocket proxy endpoint (/websockify).
 */

export function buildViewerHtml(opts: {
  wsPath: string;
  token: string;
  reason: string;
  vncPassword?: string;
}): string {
  const { wsPath, token, reason, vncPassword } = opts;
  // noVNC core from jsdelivr CDN — stable 1.5.0 release
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>AM Human Session — ${escHtml(reason)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#1a1a2e; color:#eee; font-family:sans-serif; display:flex; flex-direction:column; height:100vh; }
  #header { padding:10px 16px; background:#16213e; border-bottom:1px solid #0f3460; display:flex; align-items:center; gap:12px; }
  #header h1 { font-size:14px; font-weight:600; }
  #reason { font-size:12px; color:#a0aec0; flex:1; }
  #status { font-size:12px; padding:4px 10px; border-radius:12px; background:#2d3748; }
  #status.connected { background:#276749; color:#9ae6b4; }
  #status.error { background:#742a2a; color:#fc8181; }
  #screen { flex:1; overflow:hidden; position:relative; }
  #noVNC_canvas { width:100%; height:100%; }
  #overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:16px; background:#1a1a2e; }
  #overlay p { color:#a0aec0; }
  .spinner { width:32px; height:32px; border:3px solid #2d3748; border-top-color:#63b3ed; border-radius:50%; animation:spin 0.8s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  #close-btn { position:fixed; bottom:16px; right:16px; padding:8px 18px; background:#e53e3e; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:14px; }
  #close-btn:hover { background:#c53030; }
</style>
</head>
<body>
<div id="header">
  <h1>AM Human Session</h1>
  <span id="reason">Reason: ${escHtml(reason)}</span>
  <span id="status">Connecting…</span>
</div>
<div id="screen">
  <div id="overlay">
    <div class="spinner"></div>
    <p>Connecting to desktop…</p>
  </div>
</div>
<button id="close-btn" onclick="closeSession()">Done — Resume AM</button>

<script>
function log(level, msg) {
  fetch('/log', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({level, msg: String(msg)}) }).catch(()=>{});
}
window.addEventListener('error', (e) => {
  log('error', 'global-error: ' + e.message + ' ' + e.filename + ':' + e.lineno);
});
window.addEventListener('unhandledrejection', (e) => {
  log('error', 'unhandled-rejection: ' + String(e.reason));
});
log('info', 'page loaded');
</script>
<script type="module">
const status = document.getElementById('status');
const overlay = document.getElementById('overlay');
const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
const wsUrl = wsProto + '://' + location.host + '${wsPath}?token=${token}';
const vncPassword = ${vncPassword ? JSON.stringify(vncPassword) : 'null'};

function log(level, msg) {
  fetch('/log', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({level, msg: String(msg)}) }).catch(()=>{});
}

log('info', 'module script started');

let RFB;
try {
  const mod = await import('/novnc/rfb.js');
  RFB = mod.default;
  log('info', 'rfb.js imported OK, RFB=' + typeof RFB);
} catch(importErr) {
  log('error', 'import failed: ' + importErr.message + ' ' + importErr.stack);
  document.getElementById('status').textContent = 'Error';
  document.getElementById('status').className = 'error';
  document.getElementById('overlay').innerHTML = '<p>Failed to load noVNC: ' + importErr.message + '</p>';
}

if (!RFB) { /* stop here */ }
else {

log('info', 'creating RFB wsUrl=' + wsUrl + ' hasPassword=' + !!vncPassword);
let rfb;
try {
  rfb = new RFB(document.getElementById('screen'), wsUrl);

  rfb.addEventListener('credentialsrequired', () => {
    log('info', 'credentialsrequired fired, sending password=' + !!vncPassword);
    if (vncPassword) {
      rfb.sendCredentials({ password: vncPassword });
    } else {
      const pw = prompt('VNC password:') ?? '';
      rfb.sendCredentials({ password: pw });
    }
  });

  rfb.addEventListener('connect', () => {
    log('info', 'connected!');
    overlay.remove();
    status.textContent = 'Connected';
    status.className = 'connected';
    rfb.scaleViewport = true;
    rfb.resizeSession = true;
    rfb.viewOnly = false;
    rfb.showDotCursor = true;
    rfb.focus();
  });

  rfb.addEventListener('disconnect', (e) => {
    log('warn', 'disconnect clean=' + e.detail.clean + ' reason=' + JSON.stringify(e.detail));
    status.textContent = e.detail.clean ? 'Disconnected' : 'Lost connection';
    status.className = 'error';
    overlay.innerHTML = '<p>' + (e.detail.clean ? 'Session ended.' : 'Connection lost. You can close this tab.') + '</p>';
    overlay.style.display = 'flex';
  });

  rfb.addEventListener('securityfailure', (e) => {
    log('error', 'securityfailure status=' + e.detail.status + ' reason=' + e.detail.reason);
  });
} catch(err) {
  log('error', 'RFB init failed: ' + err.message + ' ' + err.stack);
  status.textContent = 'Error';
  status.className = 'error';
  overlay.innerHTML = '<p>Failed to load VNC client: ' + err.message + '</p>';
}

window.closeSession = function() {
  if (rfb) rfb.disconnect();
  fetch('/session-done?token=${token}', { method: 'POST' }).finally(() => {
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#a0aec0;font-family:sans-serif">Session closed. AM is resuming. You can close this tab.</div>';
  });
};

window.addEventListener('beforeunload', () => {
  navigator.sendBeacon('/session-done?token=${token}');
});
} // end else RFB
</script>
</body>
</html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
