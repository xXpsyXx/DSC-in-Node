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

const showModal = () => { pinModal.style.display = 'flex'; pinInput.value = ''; pinInput.focus(); };
const hideModal = () => { pinModal.style.display = 'none'; };

let responseTimer = null;
function showResponse(message, type = 'info', autoCloseMs = 5000) {
  responseContent.textContent = message;
  responsePopup.className = `response-popup ${type}`;
  responsePopup.style.display = 'block';
  if (responseTimer) clearTimeout(responseTimer);
  if (autoCloseMs && autoCloseMs > 0) responseTimer = setTimeout(() => (responsePopup.style.display = 'none'), autoCloseMs);
}
function closeResponse() {
  if (responseTimer) clearTimeout(responseTimer);
  responsePopup.style.display = 'none';
}
responseClose.addEventListener('click', closeResponse);

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
    const r = await fetch(`${window.apiBase}/admin/logs`);
    if (!r.ok) return;
    const j = await r.json();
    const arr = j?.data || j || [];
    if (!Array.isArray(arr) || arr.length === 0) {
      logsEl.innerHTML = '<div class="no-logs">No logs to display</div>';
      return;
    }
    logsEl.innerHTML = arr
      .map(
        (l) =>
          `<div class="log-row"><span class="log-dot ${l.type}"></span><span class="log-ts">${l.timestamp || ''}</span><span class="log-text">${l.text || ''}</span></div>`,
      )
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
    const r = await fetch(`${window.apiBase}/admin/driver-path`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ driverPath: p, applyTo: 'both' }) });
    const j = await r.json();
    if (r.ok) {
      showResponse('Saved', 'success');
      loadBackendLogs();
      loadStatus();
    } else {
      showResponse(j.error || 'Save failed', 'error');
    }
  } catch (e) {
    console.error('saveDriverPath error', e);
    showResponse('Save failed', 'error');
  }
}

async function autoDetectToken() {
  try {
    const r = await fetch(`${window.apiBase}/sign/auto-detect-token`);
    if (!r.ok) throw new Error('Auto-detect failed');
    const j = await r.json();
    if (j && j.detected) {
      driverPathEl.value = j.driverPath || '';
      showResponse(`Driver detected: ${j.driverName}`, 'success');
    } else {
      showResponse(j.message || 'No device detected', 'info');
    }
    loadBackendLogs();
  } catch (e) {
    console.error('autoDetectToken error', e);
    showResponse('Auto-detect failed', 'error');
  }
}

async function onConfirmPinUnlock() {
  const pin = pinInput.value;
  if (!pin) return showResponse('Enter PIN', 'error');
  try {
    const form = new FormData();
    form.append('pin', pin);
    const r = await fetch(`${window.apiBase}/sign/get-cert-details`, { method: 'POST', body: form });
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

// Wire up UI events
$('#unlockBtn').addEventListener('click', showModal);
$('#cancelPin').addEventListener('click', hideModal);
$('#confirmPin').addEventListener('click', onConfirmPinUnlock);
$('#saveDriver').addEventListener('click', saveDriverPath);
$('#autoDetect').addEventListener('click', autoDetectToken);
$('#browseDriver').addEventListener('click', () => $('#driverFileInput').click());
$('#driverFileInput').addEventListener('change', (e) => { const input = e.target; if (input && input.files && input.files[0]) driverPathEl.value = input.files[0].name || ''; });
$('#refreshBtn').addEventListener('click', () => { loadStatus(); loadBackendLogs(); refreshHealth(); });

// Initial load and polling
(async function init() {
  await loadConfig();
  await loadStatus();
  await loadBackendLogs();
  refreshHealth();
  setInterval(() => { loadStatus(); loadBackendLogs(); }, 3000);
})();
