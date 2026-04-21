import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DscService } from '../services/dsc.service';

@Component({
  selector: 'app-service-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './service-dashboard.component.html',
  styleUrl: './service-dashboard.component.css',
})
export class ServiceDashboardComponent implements OnInit {
  serviceRunning = signal(true);
  tokenConnected = signal(false);
  certName = signal('-');
  serial = signal('-');
  validityDate = signal('-');
  lastAction = signal('Signed PDF successfully.');

  // Logs are loaded from the backend; include timestamp provided by server.
  logs = signal<Array<{ type: string; text: string; timestamp?: string }>>([]);

  driverPath = signal('');
  port = signal('2000');
  portMasked = signal(true);
  saving = signal(false);
  saveMessage = signal('');

  // Unlock / PIN modal state
  showPinDialog = signal(false);
  isUnlocking = signal(false);
  pin = '';
  certDetails = signal<any | null>(null);
  // Transient response popup
  responseVisible = signal(false);
  responseMessage = signal('');
  responseType = signal<'info' | 'success' | 'error'>('info');
  private responseTimer: any = null;
  // Prevent repeated auto-detect spam
  tokenDetecting = signal(false);
  // Backend health status: 'green' = OK, 'red' = unreachable/error, 'blue' = unknown/idle
  backendStatus = signal<'green' | 'red' | 'blue'>('blue');

  constructor(private dscService: DscService) {}

  ngOnInit(): void {
    this.loadConfig();
    this.loadStatus();
    this.loadBackendLogs();
    // Initial health check
    this.refreshHealth();
  }

  refreshHealth(): void {
    // Optimistic: show blue while checking
    this.backendStatus.set('blue');
    this.dscService.healthCheck().subscribe({
      next: () => {
        this.backendStatus.set('green');
      },
      error: (err) => {
        console.error('Health check failed', err);
        this.backendStatus.set('red');
        this.showResponse('Backend unreachable', 'error', 4000);
      },
    });
  }

  private loadBackendLogs(): void {
    this.dscService.getBackendLogs().subscribe({
      next: (res: any) => {
        const data = res?.data || res;
        if (Array.isArray(data)) {
          this.logs.set(
            data.map((l: any) => ({ type: l.type || 'info', text: l.text || '', timestamp: l.timestamp || '' })),
          );
        }
      },
      error: (err) => {
        console.error('Failed to load backend logs', err);
      },
    });
  }

  togglePortMasked(): void {
    this.portMasked.set(!this.portMasked());
  }

  getDisplayedPort(): string {
    return this.portMasked() ? '••••' : this.port();
  }

  private loadConfig(): void {
    this.dscService.getAgentConfig().subscribe({
      next: (res: any) => {
        const data = res?.data || res;
        if (!data) return;
        // Prefer generic path, fall back to platform-specific
        const pkcs11 =
          data.pkcs11LibraryPath ||
          data.pkcs11LibraryPathWindows ||
          data.pkcs11LibraryPathLinux ||
          data.pkcs11LibraryPathDarwin ||
          '';
        this.driverPath.set(pkcs11);
        if (data.port) this.port.set(String(data.port));
      },
      error: (err) => {
        console.error('Failed to load agent config', err);
        this.showResponse('Failed to load agent config', 'error');
      },
    });
  }

  private loadStatus(): void {
    this.dscService.getAgentStatus().subscribe({
      next: (res: any) => {
        const data = res?.data || res;
        if (!data) return;
        if (data.lastAction) this.lastAction.set(data.lastAction);
        if (data.logs && Array.isArray(data.logs)) {
          this.logs.set(
            data.logs.map((l: any) => ({ type: l.type || 'info', text: l.text || '', timestamp: l.timestamp || '' })),
          );
        }
        if (data.driverPath) this.driverPath.set(data.driverPath);
        if (data.tokenDetected) this.tokenConnected.set(true);
        else this.tokenConnected.set(false);

        if (data.tokenInfo) {
          const t = data.tokenInfo;
          // Do not show certificate details by default - user must unlock with PIN
          // Populate some agent-detected metadata only if explicitly present
          if (t.label) this.certName.set('-');
          if (t.serialNumber) this.serial.set('-');
        }
        if (data.agentTime) {
          // Optionally show or use agentTime
        }
        this.serviceRunning.set(Boolean(data.serviceRunning));
      },
      error: (err) => {
        console.error('Failed to load agent status', err);
        this.showResponse('Failed to load agent status', 'error');
      },
    });
  }

  openUnlockDialog(): void {
    this.pin = '';
    this.showPinDialog.set(true);
  }

  async onConfirmPinUnlock(): Promise<void> {
    if (!String(this.pin || '').trim()) {
      this.saveMessage.set('PIN is required');
      return;
    }

    this.isUnlocking.set(true);
    this.saveMessage.set('');
    this.dscService.getCertDetails(this.pin).subscribe({
      next: (resp: any) => {
        const data = resp?.data || resp || {};
        // Some backend endpoints return { error: 'message' } with HTTP 200.
        // Treat those as errors and surface via the response popup.
        const apiError =
          (resp && typeof resp === 'object' && (resp.error || resp.message)) ||
          (resp?.data && (resp.data.error || resp.data.message));
        if (apiError) {
          const msg = (apiError && typeof apiError === 'string' ? apiError : JSON.stringify(apiError));
          this.saveMessage.set(msg || 'Failed to retrieve certificate details');
          this.isUnlocking.set(false);
          this.showResponse(msg || 'Failed to retrieve certificate details', 'error');
          // Refresh backend logs after a server-side error event
          this.loadBackendLogs();
          return;
        }
        // Normalize fields
        const owner = data.ownerName || data.label || data.subject || data.signerName || '-';
        const serial = data.certSerialNumber || data.serialNumber || data.serial || '-';
        const expiry = data.certExpiryDate || data.expiryDate || data.expiry || '-';

        this.certDetails.set(data);
        this.certName.set(owner || '-');
        this.serial.set(serial || '-');
        this.validityDate.set(expiry || '-');
        // Update activity and refresh backend logs
        const nowStr = this.formatToIST(new Date().toISOString()) || new Date().toLocaleString();
        this.lastAction.set(`Unlocked certificate (${nowStr})`);
        this.loadBackendLogs();
        this.isUnlocking.set(false);
        this.showPinDialog.set(false);
        this.pin = '';
        this.showResponse('Certificate unlocked', 'success');
      },
      error: (err) => {
        console.error('getCertDetails failed', err);
        this.saveMessage.set('Failed to retrieve certificate details');
        this.showResponse('Failed to retrieve certificate details', 'error');
        this.isUnlocking.set(false);
        // Refresh backend logs after an error
        this.loadBackendLogs();
      },
    });
  }

  isValidityExpired(): boolean {
    const raw = this.validityDate();
    if (!raw || raw === '-' || typeof raw !== 'string') return false;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return false;
    // Compare in UTC: if expiry time <= now => expired
    return d.getTime() <= Date.now();
  }

  clearCert(): void {
    this.certDetails.set(null);
    this.certName.set('-');
    this.serial.set('-');
    this.validityDate.set('-');
  }

  saveDriverPath(): void {
    const pathValue = this.driverPath();
    if (!pathValue) {
      this.saveMessage.set('Driver path cannot be empty');
      return;
    }

    this.saving.set(true);
    this.saveMessage.set('');
    this.dscService.updateDriverPath(pathValue, 'platform').subscribe({
      next: (resp) => {
        this.saving.set(false);
        this.saveMessage.set('Saved');
        this.showResponse('Saved', 'success');
        // Driver path update may produce a backend log — refresh
        this.loadBackendLogs();
      },
      error: (err) => {
        console.error('Failed to save driver path', err);
        this.saving.set(false);
        this.saveMessage.set('Failed to save');
        this.showResponse('Failed to save', 'error');
        this.loadBackendLogs();
      },
    });
  }

  /**
   * Return the validity date formatted and converted to IST (Asia/Kolkata).
   */
  getFormattedValidityDate(): string {
    const raw = this.validityDate();
    if (!raw || raw === '-' || typeof raw !== 'string') return '-';
    const formatted = this.formatToIST(raw);
    return formatted ?? raw;
  }

  private formatToIST(dateStr: string): string | null {
    try {
      // Try parsing ISO date
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return null;

      // Use Intl to format in Asia/Kolkata timezone
      const opts: Intl.DateTimeFormatOptions = {
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

  statusLabel(): string {
    return this.tokenConnected() ? 'Connected' : 'Disconnected';
  }

  autoDetectToken(): void {
    // Prevent spamming the endpoint
    if (this.tokenDetecting()) return;
    this.tokenDetecting.set(true);

    this.dscService.autoDetectToken().subscribe({
      next: (res: any) => {
        if (res && res.detected) {
          this.tokenConnected.set(true);
          if (res.driverPath) this.driverPath.set(res.driverPath);
        } else {
          this.tokenConnected.set(false);
        }
        this.loadBackendLogs();
        // short cooldown to avoid rapid clicks
        setTimeout(() => this.tokenDetecting.set(false), 700);
      },
      error: (err: any) => {
        // 404 from backend indicates no device detected (do not show toast for disconnected)
        if (err && err.status === 404) {
          this.tokenConnected.set(false);
        } else {
          console.error('autoDetectToken failed', err);
          this.showResponse('Auto-detect failed', 'error', 3000);
        }
        this.loadBackendLogs();
        setTimeout(() => this.tokenDetecting.set(false), 700);
      },
    });
  }

  onDriverFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input || !input.files || input.files.length === 0) return;
    const file = input.files[0];
    // Browsers do not expose the full local path for security reasons.
    // Use the filename to help the user, and let backend accept uploads if needed.
    this.driverPath.set(file.name || '');
  }

  showResponse(message: string, type: 'info' | 'success' | 'error' = 'info', autoCloseMs = 6000): void {
    this.responseMessage.set(message);
    this.responseType.set(type);
    this.responseVisible.set(true);
    if (this.responseTimer) clearTimeout(this.responseTimer);
    if (autoCloseMs && autoCloseMs > 0) {
      this.responseTimer = setTimeout(() => this.responseVisible.set(false), autoCloseMs);
    }
    // Do not persist front-end transient popups as server logs.
  }

  closeResponse(): void {
    if (this.responseTimer) clearTimeout(this.responseTimer);
    this.responseVisible.set(false);
  }
}
