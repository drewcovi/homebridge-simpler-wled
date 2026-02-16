# WLED Discovery Guide

## Discovery Methods

This plugin uses two methods to automatically discover WLED devices:

1. **mDNS/Bonjour** - Scans for `_wled._tcp` services and verifies via HTTP API
2. **UDP Broadcast** - Sends discovery packets to port 21324 (WLED sync port)

## Testing Discovery

Run the test script to diagnose discovery issues:

```bash
node test-discovery.js
```

This will:
- Scan your local network for WLED devices
- Test mDNS and UDP discovery
- Show detailed debug output

## Manual Configuration

If auto-discovery doesn't find your devices, you can add them manually:

```json
{
  "name": "WLED",
  "platform": "WLED",
  "discoverySection": {
    "autoDiscover": true
  },
  "manualDevicesSection": {
    "devices": [
      {
        "name": "Living Room LEDs",
        "host": "10.0.1.100",
        "port": 80,
        "deviceSettings": {
          "useSegments": false,
          "usePresetService": true,
          "useWebSockets": true,
          "pollInterval": 10
        }
      }
    ]
  }
}
```

## Troubleshooting

### No devices found

1. **Verify WLED is accessible**:
   ```bash
   curl http://YOUR_WLED_IP/json/info
   ```
   You should see JSON with device info.

2. **Check network connectivity**:
   - Ensure WLED devices are on the same network/subnet
   - Check if VLANs or firewall rules are blocking discovery
   - Verify multicast traffic is allowed for mDNS

3. **Check WLED settings**:
   - Go to WLED Config > WiFi Setup
   - Ensure mDNS is enabled (usually on by default)
   - Note the hostname (e.g., "wled-bedroom")

4. **Restart Homebridge** after making changes:
   ```bash
   sudo hb-service restart
   ```

### Devices found but not working

1. **Check the logs** in Homebridge UI for errors
2. **Verify WLED version** - Requires WLED v0.13+ for WebSockets
3. **Test API access**:
   ```bash
   curl http://YOUR_WLED_IP/json/state
   ```

### macOS Firewall Issues

If you're running Homebridge on macOS, the firewall may block discovery:

1. Go to System Preferences > Security & Privacy > Firewall
2. Click "Firewall Options"
3. Ensure Homebridge/Node.js can accept incoming connections

## WLED Configuration

For best auto-discovery results, configure your WLED device:

1. **WiFi Setup** (Config > WiFi Setup):
   - Set hostname to start with "wled-" (e.g., "wled-bedroom")
   - Enable mDNS (usually enabled by default)

2. **Sync Setup** (Config > Sync Setup):
   - UDP sync can be enabled for faster discovery
   - Use port 21324 (default)

