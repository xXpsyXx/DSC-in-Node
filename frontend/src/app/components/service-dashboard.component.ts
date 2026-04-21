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
  tokenConnected = signal(true);
  certName = signal('John Doe');
  serial = signal('1234-5678-90AB-CDEF');
  validityDate = signal('2024-12-31');
  lastAction = signal('Signed PDF successfully.');

  logs = signal<Array<{ type: string; text: string }>>([
    { type: 'info', text: 'Las signed PDF successfully.' },
    { type: 'error', text: 'Signed PDF successfully.' },
    { type: 'success', text: 'Dooks to deean signatures success...' },
    { type: 'info', text: 'Signed PDF successfully.' },
    { type: 'error', text: 'Raverplated hzt operation...' },
  ]);

  driverPath = signal('');
  port = signal('2000');
  portMasked = signal(true);
  saving = signal(false);
  saveMessage = signal('');

  constructor(private dscService: DscService) {}

  ngOnInit(): void {
    this.loadConfig();
    this.loadStatus();
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
        const pkcs11 = data.pkcs11LibraryPath || data.pkcs11LibraryPathWindows || data.pkcs11LibraryPathLinux || data.pkcs11LibraryPathDarwin || '';
        this.driverPath.set(pkcs11);
        if (data.port) this.port.set(String(data.port));
      },
      error: (err) => {
        console.error('Failed to load agent config', err);
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
            data.logs.map((l: any) => ({ type: l.type || 'info', text: l.text || '' })),
          );
        }
        if (data.driverPath) this.driverPath.set(data.driverPath);
        if (data.tokenDetected) this.tokenConnected.set(true);
        else this.tokenConnected.set(false);

        if (data.tokenInfo) {
          const t = data.tokenInfo;
          if (t.label) this.certName.set(t.label);
          if (t.serialNumber) this.serial.set(t.serialNumber);
        }
        if (data.agentTime) {
          // Optionally show or use agentTime
        }
        this.serviceRunning.set(Boolean(data.serviceRunning));
      },
      error: (err) => {
        console.error('Failed to load agent status', err);
      },
    });
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
      },
      error: (err) => {
        console.error('Failed to save driver path', err);
        this.saving.set(false);
        this.saveMessage.set('Failed to save');
      },
    });
  }
}
