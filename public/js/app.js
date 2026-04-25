const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const logsEl = $('#logs');
const certNameEl = $('#certName');
const serialEl = $('#serial');
const validityEl = $('#validity');
const driverPathEl = $('#driverPath');
const statusLabelEl = $('#statusLabel');
const statusIndicatorEl = $('#statusIndicator');
const responsePopup = $('#responsePopup');
const responseContent = $('#responseContent');
const responseClose = $('#responseClose');

const pinModal = $('#pinModal');
const pinInput = $('#pinInput');
const confirmModal = $('#confirmModal');
const confirmModalSubtitle = $('#confirmModalSubtitle');
const confirmClearBtn = $('#confirmClear');
const cancelClearBtn = $('#cancelClear');

const showModal = () => { pinModal.style.display = 'flex'; pinInput.value = ''; pinInput.focus(); };
const hideModal = () => { pinModal.style.display = 'none'; };

const showConfirmModal = (subtitle) => {
  if (!confirmModal) return;
  confirmModal.style.display = 'flex';
  if (confirmModalSubtitle) confirmModalSubtitle.textContent = subtitle || 'Are you sure?';
  try { confirmClearBtn?.focus(); } catch (e) {}
};

const hideConfirmModal = () => { if (confirmModal) confirmModal.style.display = 'none'; };

let responseTimer = null;
function showResponse(message, type = 'info', autoCloseMs = 5000) {
  // UI alerts disabled globally. Keep a console trace for debugging.
  if (typeof message !== 'undefined' && message !== null) {
    console.info('[response disabled]', type, message);
  }
  // Intentionally do not update DOM to show popups.
}
function closeResponse() {
  if (responseTimer) clearTimeout(responseTimer);
  if (responsePopup) responsePopup.style.display = 'none';
}
responseClose?.addEventListener('click', closeResponse);

// Parse timestamps robustly: accept ISO or the server's formatted IST string
function parseTimestampToMs(s) {
  if (!s) return 0;
  const v = String(s);
  const parsed = Date.parse(v);
  if (!isNaN(parsed)) return parsed;
  // try server format: DD-MM-YYYY HH:MM:SS am/pm IST
  const m = v.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s*(am|pm)/i);
  if (m) {
    const dd = m[1], mm = m[2], yyyy = m[3], hh = m[4], minu = m[5], sec = m[6], ampm = m[7].toLowerCase();
    let hour = parseInt(hh, 10);
    const minute = parseInt(minu, 10);
    const second = parseInt(sec, 10);
    if (ampm === 'pm' && hour !== 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    // build ISO with IST offset so Date.parse can handle timezone correctly
    const iso = `${yyyy}-${mm}-${dd}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}+05:30`;
    const p = Date.parse(iso);
    if (!isNaN(p)) return p;
  }
  return 0;
}

async function formatToIST(dateStr) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const opts = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    };
    return new Intl.DateTimeFormat('en-GB', opts).format(d).replace(',', '');
  } catch (e) {
    return null;
  }
}

async function loadConfig() {
  try {
    const r = await fetch(`${window.apiBase}/admin/config`);
    if (!r.ok) return;
    const j = await r.json();
    const data = j?.data || j || {};
    const pkcs11 = data.pkcs11LibraryPath || data.pkcs11LibraryPathWindows || data.pkcs11LibraryPathLinux || data.pkcs11LibraryPathDarwin || '';
    driverPathEl.value = pkcs11;
  } catch (e) {
    console.warn('loadConfig error', e);
  }
}

async function loadStatus() {
  try {
    const r = await fetch(`${window.apiBase}/admin/status`);
    if (!r.ok) throw new Error('status fetch failed');
    const j = await r.json();
    const d = j?.data || j || {};
    certNameEl.textContent = (d.tokenInfo && d.tokenInfo.label) || '-';
    serialEl.textContent = (d.tokenInfo && d.tokenInfo.serialNumber) || '-';
    validityEl.textContent = d.tokenInfo ? 'present' : '-';
    if (d.tokenDetected) {
      statusLabelEl.textContent = 'Connected';
      statusLabelEl.className = 'panel-status-label green';
      statusIndicatorEl.className = 'panel-indicator-inline green';
    } else {
      statusLabelEl.textContent = 'Disconnected';
      statusLabelEl.className = 'panel-status-label red';
      statusIndicatorEl.className = 'panel-indicator-inline red';
    }
  } catch (e) {
    console.warn('loadStatus error', e);
    statusLabelEl.textContent = 'Unknown';
    statusLabelEl.className = 'panel-status-label blue';
    statusIndicatorEl.className = 'panel-indicator-inline blue';
  }
}

async function loadBackendLogs() {
  try {
    // Add cache-bust to avoid cached responses and force fresh read from server
    const r = await fetch(`${window.apiBase}/admin/logs?_=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    const arr = j?.data || j || [];
    if (!Array.isArray(arr) || arr.length === 0) {
      logsEl.innerHTML = '<div class="no-logs">No logs to display</div>';
      return;
    }
    // Sort by timestamp descending (newest first). Parse timestamps robustly.
    const sorted = arr.slice().sort((a, b) => {
      const ta = parseTimestampToMs(a.rawTimestamp || a.timestamp || '');
      const tb = parseTimestampToMs(b.rawTimestamp || b.timestamp || '');
      return tb - ta;
    });
    logsEl.innerHTML = sorted
      .map((l) => {
        const ts = l.timestamp || l.rawTimestamp || '';
        const text = l.text || '';
        const type = l.type || 'info';
        return `<div class="log-row"><span class="log-dot ${type}"></span><span class="log-ts">${ts}</span><span class="log-text">${text}</span></div>`;
      })
      .join('\n');
  } catch (e) {
    console.warn('loadBackendLogs error', e);
  }
}

async function refreshHealth() {
  try {
    const r = await fetch('/health');
    if (r.ok) {
      statusLabelEl.className = 'panel-status-label green';
      statusIndicatorEl.className = 'panel-indicator-inline green';
    } else {
      statusLabelEl.className = 'panel-status-label red';
      statusIndicatorEl.className = 'panel-indicator-inline red';
    }
  } catch (e) {
    statusLabelEl.className = 'panel-status-label red';
    statusIndicatorEl.className = 'panel-indicator-inline red';
  }
}

async function saveDriverPath() {
  const p = driverPathEl.value;
  if (!p) return showResponse('Driver path cannot be empty', 'error');
  try {
    // If running inside packaged Electron, attempt to persist via IPC first
    if (window.electronAPI && typeof window.electronAPI.saveDriverPath === 'function') {
      try {
        const ipcRes = await window.electronAPI.saveDriverPath(p);
        if (ipcRes && ipcRes.success) {
          console.info('Driver path persisted via Electron main process');
        } else {
          console.warn('Electron main failed to persist driver path', ipcRes);
        }
      } catch (e) {
        console.warn('electronAPI.saveDriverPath error', e);
      }
    }

    // Also call the backend endpoint to keep server-side state in sync
    const r = await fetch(`${window.apiBase}/admin/driver-path`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ driverPath: p, applyTo: 'both' }) });
    const j = await r.json().catch(() => null);
    if (r.ok) {
      showResponse('Saved', 'success');
      loadBackendLogs();
      loadStatus();
    } else {
      showResponse((j && j.error) || 'Save failed', 'error');
    }
  } catch (e) {
    console.error('saveDriverPath error', e);
    showResponse('Save failed', 'error');
  }
}

async function autoDetectToken() {
  try {
    // Call the auto-detect endpoint mounted under `/api`
    const r = await fetch(`${window.apiBase}/auto-detect-token`);
    // Even if the server returns 4xx/5xx, attempt to parse body for message
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      // If server returned an error, surface server message if any
      const msg = j && (j.message || j.error) ? (j.message || j.error) : 'Auto-detect failed';
      showResponse(msg, 'info');
      // Reload logs so any appended server log entries appear
      await loadBackendLogs();
      throw new Error('Auto-detect failed');
    }
    if (j && j.detected) {
      driverPathEl.value = j.driverPath || '';
      showResponse(`Driver detected: ${j.driverName}`, 'success');
    } else {
      showResponse(j.message || 'No device detected', 'info');
    }
    // Small delay to ensure backend has persisted the new log entry
    await new Promise((res) => setTimeout(res, 120));
    await loadBackendLogs();
    return j;
  } catch (e) {
    console.error('autoDetectToken error', e);
    showResponse('Auto-detect failed', 'error');
    // ensure logs are refreshed even on error
    try { await loadBackendLogs(); } catch (_) {}
    throw e;
  }
}

async function onConfirmPinUnlock() {
  const pin = pinInput.value;
  if (!pin) return showResponse('Enter PIN', 'error');
  try {
    const form = new FormData();
    form.append('pin', pin);
    const r = await fetch(`${window.apiBase}/get-cert-details`, { method: 'POST', body: form });
    const j = await r.json();
    if (!r.ok || (j && (j.error || j.message))) {
      const msg = (j && (j.error || j.message)) || 'Failed to unlock';
      showResponse(msg, 'error');
      loadBackendLogs();
      return;
    }
    const data = j?.data || j || j;
    const owner = data.ownerName || data.label || data.subject || data.signerName || '-';
    const serial = data.certSerialNumber || data.serialNumber || data.serial || '-';
    const expiry = data.certExpiryDate || data.expiryDate || data.expiry || '-';
    certNameEl.textContent = owner || '-';
    serialEl.textContent = serial || '-';
    validityEl.textContent = expiry || '-';
    showResponse('Certificate unlocked', 'success');
    hideModal();
    loadBackendLogs();
  } catch (e) {
    console.error('onConfirmPinUnlock error', e);
    showResponse('Failed to retrieve certificate details', 'error');
    loadBackendLogs();
  }
}

// Wire up UI events (safe: only attach when element exists)
$('#unlockBtn')?.addEventListener('click', showModal);
$('#cancelPin')?.addEventListener('click', hideModal);
$('#confirmPin')?.addEventListener('click', onConfirmPinUnlock);
$('#saveDriver')?.addEventListener('click', saveDriverPath);
$('#autoDetect')?.addEventListener('click', autoDetectToken);
$('#clearLogsBtn')?.addEventListener('click', () => showConfirmModal('Clear all logs?'));
cancelClearBtn?.addEventListener('click', hideConfirmModal);
confirmClearBtn?.addEventListener('click', async () => {
  try {
    const r = await fetch(`${window.apiBase}/admin/logs/clear`, { method: 'POST' });
    const j = await r.json().catch(() => null);
    if (r.ok) {
      hideConfirmModal();
      showResponse('Logs cleared', 'success');
      await loadBackendLogs();
    } else {
      showResponse(j?.error || 'Failed to clear logs', 'error');
    }
  } catch (e) {
    console.error('clear logs error', e);
    showResponse('Failed to clear logs', 'error');
  }
});
$('#browseDriver')?.addEventListener('click', () => $('#driverFileInput')?.click());
$('#driverFileInput')?.addEventListener('change', (e) => { const input = e.target; if (input && input.files && input.files[0]) driverPathEl.value = input.files[0].name || ''; });
$('#refreshBtn')?.addEventListener('click', async () => {
  try {
    // Attempt auto-detect first so any new log entries get written
    await autoDetectToken();
  } catch (e) {
    console.warn('autoDetectToken failed during refresh', e);
  }
  await loadStatus();
  await loadBackendLogs();
});

// Initial load and polling
(async function init() {
  await loadConfig();
  await loadStatus();
  await loadBackendLogs();
  setInterval(() => { loadStatus(); loadBackendLogs(); }, 10000);
})();
