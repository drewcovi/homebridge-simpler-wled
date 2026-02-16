#!/usr/bin/env node

/**
 * Test script to diagnose WLED discovery issues
 */

const { WLEDDiscoveryService } = require('./dist/discoveryService');
const axios = require('axios');

// Create a simple logger
const logger = {
  info: (...args) => console.log('\x1b[32m[INFO]\x1b[0m', ...args),
  warn: (...args) => console.log('\x1b[33m[WARN]\x1b[0m', ...args),
  error: (...args) => console.log('\x1b[31m[ERROR]\x1b[0m', ...args),
  debug: (...args) => console.log('\x1b[36m[DEBUG]\x1b[0m', ...args),
};

console.log('\x1b[1m\nWLED Discovery Test\x1b[0m');
console.log('===================\n');

// Test 1: Check if we can scan the local network for common WLED ports
console.log('Test 1: Network scan for WLED devices...');
console.log('(Scanning common IP ranges on port 80)\n');

async function testDirectConnection(ip) {
  try {
    const response = await axios.get(`http://${ip}/json/info`, { timeout: 2000 });
    if (response.data && response.data.ver) {
      console.log(`\x1b[32m✓ Found WLED device at ${ip}\x1b[0m`);
      console.log(`  Name: ${response.data.name || 'Unknown'}`);
      console.log(`  Version: ${response.data.ver}`);
      console.log(`  MAC: ${response.data.mac || 'Unknown'}`);
      console.log(`  LEDs: ${response.data.leds?.count || 0}`);
      return true;
    }
  } catch (error) {
    // Silently skip non-WLED devices
  }
  return false;
}

async function scanNetwork() {
  // Get local IP to determine subnet
  const os = require('os');
  const interfaces = os.networkInterfaces();
  let baseIP = '10.0.1'; // Default guess

  // Try to find the active network interface
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const parts = iface.address.split('.');
        baseIP = `${parts[0]}.${parts[1]}.${parts[2]}`;
        console.log(`\x1b[36mDetected network: ${baseIP}.0/24\x1b[0m\n`);
        break;
      }
    }
  }

  console.log(`Scanning ${baseIP}.1-254 for WLED devices...`);
  console.log('(This may take a minute)\n');

  const promises = [];
  for (let i = 1; i <= 254; i++) {
    const ip = `${baseIP}.${i}`;
    promises.push(testDirectConnection(ip));
  }

  const results = await Promise.all(promises);
  const foundCount = results.filter(r => r).length;

  if (foundCount === 0) {
    console.log('\x1b[33m\n⚠ No WLED devices found via direct scan\x1b[0m');
  } else {
    console.log(`\x1b[32m\n✓ Found ${foundCount} WLED device(s) via direct scan\x1b[0m`);
  }
}

// Test 2: Discovery service
async function testDiscoveryService() {
  console.log('\n\nTest 2: Discovery Service (mDNS + SSDP + UDP)...\n');

  const discovery = new WLEDDiscoveryService(logger);

  discovery.addDiscoveryListener((devices) => {
    if (devices.length > 0) {
      console.log(`\x1b[32m\n✓ Discovery found ${devices.length} device(s):\x1b[0m`);
      devices.forEach(device => {
        console.log(`  - ${device.name} at ${device.host}:${device.port} (via ${device.discoveryMethod})`);
        if (device.info) {
          console.log(`    Version: ${device.info.version}, MAC: ${device.info.macAddress}, LEDs: ${device.info.ledCount}`);
        }
      });
    }
  });

  discovery.startDiscovery();

  // Wait for discovery to complete (longer timeout for synchronous processing)
  console.log('Waiting 70 seconds for discovery to complete...');
  console.log('(Each device is checked synchronously with 20s timeout + 2s delay)');
  await new Promise(resolve => setTimeout(resolve, 70000));

  const devices = discovery.getDiscoveredDevices();
  if (devices.length === 0) {
    console.log('\x1b[33m\n⚠ Discovery service found no devices\x1b[0m');
    console.log('\nPossible reasons:');
    console.log('  1. No WLED devices on the network');
    console.log('  2. WLED devices may not have mDNS enabled');
    console.log('  3. WLED devices may not respond to SSDP');
    console.log('  4. Firewall may be blocking multicast/broadcast traffic');
    console.log('  5. Devices are on a different subnet/VLAN');
    console.log('\nNote: UDP discovery requires WLED devices with UDP sync enabled');
  }

  discovery.stopDiscovery();
}

// Run tests
(async () => {
  try {
    await scanNetwork();
    await testDiscoveryService();

    console.log('\n\nTest complete!\n');
    console.log('If devices were found via direct scan but not via discovery,');
    console.log('you can manually add them in the Homebridge config.\n');

    process.exit(0);
  } catch (error) {
    console.error('Test error:', error);
    process.exit(1);
  }
})();
