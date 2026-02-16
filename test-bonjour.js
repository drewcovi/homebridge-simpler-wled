#!/usr/bin/env node

const { Bonjour } = require('bonjour-service');

console.log('Testing bonjour-service library...\n');

const bonjour = new Bonjour();

// Try to find _wled._tcp services
console.log('Browsing for _wled._tcp services...');
const wledBrowser = bonjour.find({ type: '_wled._tcp' });

wledBrowser.on('up', (service) => {
  console.log('✓ Found _wled._tcp service:', service.name, 'at', service.host + ':' + service.port);
});

// Try to find _http._tcp services
setTimeout(() => {
  console.log('\nBrowsing for _http._tcp services...');
  const httpBrowser = bonjour.find({ type: '_http._tcp' });

  httpBrowser.on('up', (service) => {
    console.log('✓ Found _http._tcp service:', service.name, 'at', service.host + ':' + service.port);
  });

  setTimeout(() => {
    httpBrowser.stop();
  }, 10000);
}, 1000);

// Stop after 12 seconds
setTimeout(() => {
  console.log('\nTest complete.');
  wledBrowser.stop();
  bonjour.destroy();
  process.exit(0);
}, 12000);
