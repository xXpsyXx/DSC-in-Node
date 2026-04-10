#!/usr/bin/env node

const Service = require('node-windows').Service;
const path = require('path');

// Create a new service object
const svc = new Service({
  name: 'DSC-Signer',
  script: path.join(__dirname, 'release', 'dsc-signer-win.exe'),
  executable: path.join(__dirname, 'release', 'dsc-signer-win.exe')
});

// Listen for the "uninstall" event which fires if the uninstallation was successful
svc.on('uninstall', function() {
  console.log('✅ Service uninstalled successfully!');
  console.log('📋 Service Name: DSC-Signer has been removed from Windows Services');
});

// Listen for the "error" event
svc.on('error', function(err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

console.log('🔧 Uninstalling DSC-Signer service...\n');

// Uninstall the service
svc.uninstall();
