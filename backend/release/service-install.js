#!/usr/bin/env node

const Service = require('node-windows').Service;
const path = require('path');

// Create a new service object
const svc = new Service({
  name: 'DSC-Signer',
  description: 'PDF Digital Signature Service with Hypersecu USB Token',
  script: path.join(__dirname, 'release', 'dsc-signer-win.exe'),
  executable: path.join(__dirname, 'release', 'dsc-signer-win.exe'),
  env: {
    name: 'NODE_ENV',
    value: 'production',
  },
  wait: 2,
  grow: '.5',
  maxRestarts: 5,
  maxFailures: 5,
  windowsVerboseLoggingMode: false,
});

// Listen for the "install" event, which fires if the installation was successful
svc.on('install', function () {
  console.log('✅ Service installed successfully!');
  console.log('📋 Service Name: DSC-Signer');
  console.log('📍 Executable: ' + svc.executable);
  console.log('\n💡 Management:');
  console.log('   Start service: net start DSC-Signer');
  console.log('   Stop service:  net stop DSC-Signer');
  console.log('   Uninstall:     node service-uninstall.js');
  svc.start();
});

// Listen for the "alreadyinstalled" event, which fires if this service is already installed.
svc.on('alreadyinstalled', function () {
  console.log('⚠️  Service is already installed.');
});

// Listen for the "error" event
svc.on('error', function (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

console.log('🔧 Installing DSC-Signer service...\n');

// Install the service
svc.install();
