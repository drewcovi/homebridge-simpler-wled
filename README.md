# Simpler WLED for Homebridge

A Homebridge plugin for controlling WLED-powered LED strips through HomeKit.

## What is WLED?

[WLED](https://kno.wled.ge/) is an open-source firmware for ESP8266 and ESP32 microcontrollers that allows you to control NeoPixel (WS2812B) and other LED strips over WiFi. It provides a user-friendly web interface and extensive API for controlling your LEDs.

## Features

- Control WLED devices through HomeKit
- On/Off control
- Brightness control
- Color (RGB/HSV) control
- Support for WLED segments as individual accessories
- Integrated preset selector for easy access to saved presets
- Individual switch controls for each WLED preset
- **Interactive Discovery UI** - Scan your network for WLED devices and add them with one click
- Manual configuration for advanced setups
- Real-time updates via WebSockets for responsive control
- Fallback to polling for backwards compatibility

## Installation

### Prerequisites

- [Homebridge](https://github.com/homebridge/homebridge/wiki) v1.3.0 or higher
- Node.js v14.0.0 or higher
- WLED firmware v0.13+ (recommended for WebSocket support)

### Installation Steps

1. **Install Homebridge** if you haven't already using the [official instructions](https://github.com/homebridge/homebridge/wiki)
2. **Install Homebridge Config UI X** (if not already installed) - highly recommended for the interactive discovery UI
3. **Install this plugin** using one of these methods:
   - Via Homebridge Config UI X: Search for "Simpler WLED" in the Plugins tab and click Install
   - Via npm: `npm install -g homebridge-simpler-wled`
4. **Configure the plugin** using the methods described below
5. **Restart Homebridge**

## Configuration

### Quick Start with Discovery UI (Recommended)

If you're using [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x), the easiest way to set up your WLED devices is through the interactive discovery interface:

1. Navigate to the **Plugins** tab in Homebridge Config UI X
2. Find **Simpler WLED** and click **Settings**
3. **Use the Discovery UI** to find WLED devices on your network:
   - Click "Start Discovery" to scan for devices
   - View device details (IP, version, MAC address, LED count)
   - Click "Add to Configuration" to automatically add devices
4. Configure default settings for your devices (optional)
5. Click **Save** to apply your changes
6. Restart Homebridge

See [UI_DISCOVERY_GUIDE.md](./UI_DISCOVERY_GUIDE.md) for detailed information about the discovery interface.

### Manual Configuration

You can also manually configure devices by editing your Homebridge `config.json` file directly. Here's a complete example with all available options:

#### Minimal Configuration

The simplest configuration - just add devices manually:

```json
{
  "platform": "WLED",
  "name": "WLED",
  "manualDevicesSection": {
    "devices": [
      {
        "name": "Living Room LEDs",
        "host": "192.168.1.100"
      }
    ]
  }
}
```

#### Full Configuration Example

Complete configuration showing all available options:

```json
{
  "platform": "Simpler WLED",
  "name": "Simpler WLED",
  "logLevel": "info",
  "defaultPollInterval": 10,
  "defaultSettingsSection": {
    "defaultUseSegments": false,
    "defaultUsePresetService": true,
    "defaultUseWebSockets": true,
    "defaultPollInterval": 10
  },
  "manualDevicesSection": {
    "devices": [
      {
        "name": "Living Room LEDs",
        "host": "192.168.1.100",
        "port": 80,
        "enabled": true,
        "deviceSettings": {
          "useSegments": false,
          "usePresetService": true,
          "useWebSockets": true,
          "pollInterval": 10,
          "enabledPresets": ["1", "2", "3"]
        }
      },
      {
        "name": "Bedroom LEDs",
        "host": "wled-bedroom.local",
        "deviceSettings": {
          "useSegments": true,
          "usePresetService": true
        }
      }
    ]
  }
}
```

### Platform Configuration Options

These settings apply to the entire platform:

| Property | Type | Description | Default | Required |
|----------|------|-------------|---------|----------|
| `platform` | string | Must be `"WLED"` | - | **Yes** |
| `name` | string | Name of the platform in HomeKit | `"WLED"` | **Yes** |
| `logLevel` | string | Logging level: `"error"`, `"warn"`, `"info"`, or `"debug"` | `"info"` | No |
| `defaultPollInterval` | integer | Global default polling interval (seconds) when WebSockets unavailable | `10` | No |

### Default Settings Section

Settings in `defaultSettingsSection` apply to devices added through the Discovery UI:

| Property | Type | Description | Default | Required |
|----------|------|-------------|---------|----------|
| `defaultUseSegments` | boolean | Expose LED segments for discovered devices | `false` | No |
| `defaultUsePresetService` | boolean | Add preset controls for discovered devices | `true` | No |
| `defaultUseWebSockets` | boolean | Use WebSockets for discovered devices | `true` | No |
| `defaultPollInterval` | integer | Polling interval for discovered devices (seconds) | `10` | No |

### Manual Device Configuration

Devices in `manualDevicesSection.devices` array support these properties:

| Property | Type | Description | Default | Required |
|----------|------|-------------|---------|----------|
| `name` | string | Display name for the device in HomeKit | - | **Yes** |
| `host` | string | IP address or hostname of the WLED device | - | **Yes** |
| `port` | integer | HTTP port of the WLED device | `80` | No |
| `enabled` | boolean | Enable/disable device without removing from config | `true` | No |

#### Device Settings

Settings in `deviceSettings` object control individual device behavior:

| Property | Type | Description | Default | Required |
|----------|------|-------------|---------|----------|
| `useSegments` | boolean | Expose each LED segment as a separate accessory | `false` | No |
| `usePresetService` | boolean | Add preset selector controls | `true` | No |
| `useWebSockets` | boolean | Use WebSockets for real-time updates (requires WLED v0.13+) | `true` | No |
| `pollInterval` | integer | How often to poll for state updates (seconds) | `10` | No |
| `enabledPresets` | array | Array of preset IDs to expose (e.g., `["1", "2", "3"]`). Configure via UI. | `[]` | No |

## Feature Details

### LED Segments

WLED allows you to divide your LED strip into multiple segments that can be controlled individually. When you set `useSegments` to `true` in your device settings, each segment will appear as a separate light accessory in HomeKit.

**Configuration:**
```json
{
  "deviceSettings": {
    "useSegments": true
  }
}
```

**Use cases:**
- LED strips that wrap around different areas of a room
- Creating different lighting zones
- Complex multi-segment lighting setups
- Independent control of each segment's color and brightness

**Note:** Segments must be configured in your WLED device first. The plugin will automatically detect and expose all configured segments.

### Preset Controls

By default, this plugin creates preset controls for each WLED device, allowing you to switch between your saved WLED presets directly from HomeKit.

**Features:**
- Preset selector appears as an input source selector in HomeKit (similar to TV inputs)
- Each WLED preset appears as a selectable input
- Easily switch presets through the Home app, Control Center, or Siri
- Presets are automatically synchronized from your WLED device
- Option to filter which presets are shown using the `enabledPresets` array

**Configuration - Show All Presets:**
```json
{
  "deviceSettings": {
    "usePresetService": true
  }
}
```

**Configuration - Show Specific Presets Only:**
```json
{
  "deviceSettings": {
    "usePresetService": true,
    "enabledPresets": ["1", "2", "5"]
  }
}
```

**Tip:** Use the Discovery UI's preset manager to easily select which presets to enable!

**Disabling Presets:**
If you don't want preset controls, set `usePresetService` to `false`:
```json
{
  "deviceSettings": {
    "usePresetService": false
  }
}

### WebSocket Support

This plugin uses WebSockets (when enabled) to provide real-time updates from your WLED devices.

**Benefits:**
- Instant state updates when changes are made outside of HomeKit
- Reduced network traffic compared to polling
- Lower latency for a more responsive experience
- Less CPU and memory usage on your Homebridge server

**Requirements:**
- WLED firmware v0.13 or newer
- WebSocket support must be enabled in your WLED device settings

**Configuration:**
WebSockets are enabled by default. To disable:
```json
{
  "deviceSettings": {
    "useWebSockets": false,
    "pollInterval": 5
  }
}
```

**Fallback Behavior:**
If WebSockets are unavailable or disabled, the plugin automatically falls back to HTTP polling using the configured `pollInterval`.

### Discovery Methods

The plugin offers two ways to find WLED devices on your network:

#### 1. Interactive Discovery UI (Recommended)

Use the Custom Plugin UI in Homebridge Config UI X to manually trigger discovery scans:
- On-demand scanning - only runs when you click "Start Discovery"
- Real-time results showing device details
- One-click device addition to configuration
- No continuous background scanning to reduce network load

**Discovery protocols used:**
- **mDNS (Bonjour)** - Discovers WLED devices advertising via mDNS
- **SSDP (UPnP)** - Discovers WLED devices responding to SSDP queries

#### 2. Manual Configuration

For devices that can't be discovered automatically, or if you prefer explicit configuration:
- Add devices directly to `config.json`
- Works for devices on different subnets or VLANs
- Useful for devices with mDNS/SSDP disabled
- Recommended for static, permanent installations

## Troubleshooting

### Discovery Not Finding Devices

**Problem:** Discovery UI doesn't find your WLED devices

**Solutions:**
- Ensure your WLED devices are on the same network/subnet as your Homebridge server
- Check that your network allows mDNS and SSDP traffic (some routers/firewalls block multicast)
- Update your WLED firmware to the latest version
- Verify WLED web interface is accessible at `http://<device-ip>`
- Try adding the device manually using its IP address in the configuration

### Device Not Responding in HomeKit

**Problem:** Device appears in HomeKit but doesn't respond to commands

**Solutions:**
- Verify you can access the WLED web interface at `http://<device-ip>`
- Check that the IP address and port are correctly configured
- Ensure your WLED device is powered on and connected to WiFi
- If using DHCP, consider setting a static IP reservation for your WLED device
- Check Homebridge logs for error messages (`logLevel: "debug"` for detailed info)
- Restart both the WLED device and Homebridge

### HomeKit Not Showing Real-time Updates

**Problem:** Changes made in WLED web interface don't appear immediately in HomeKit

**Solutions:**
- Enable WebSockets if you're using WLED v0.13 or newer:
  ```json
  { "deviceSettings": { "useWebSockets": true } }
  ```
- If WebSockets aren't working, decrease the `pollInterval` for more frequent updates:
  ```json
  { "deviceSettings": { "pollInterval": 5 } }
  ```
- Verify WebSocket support is enabled in your WLED device settings
- Check network firewall isn't blocking WebSocket connections
- Restart the WLED device and Homebridge

### Presets Not Appearing or Updating

**Problem:** WLED presets don't show up or aren't updating in HomeKit

**Solutions:**
- Ensure `usePresetService` is set to `true` (it's enabled by default)
- Create presets in your WLED device first (they must exist to be discovered)
- If using `enabledPresets`, verify the preset IDs are correct (e.g., `["1", "2", "3"]`)
- Restart Homebridge to refresh preset list
- Check that presets have names in WLED (unnamed presets may not appear correctly)

### Segments Not Appearing

**Problem:** LED segments configured in WLED don't show up as separate accessories

**Solutions:**
- Enable segments in device configuration:
  ```json
  { "deviceSettings": { "useSegments": true } }
  ```
- Verify segments are properly configured in your WLED device
- Restart Homebridge after enabling segments
- Check Homebridge logs for any errors

### Performance Issues

**Problem:** Homebridge running slowly or consuming excessive resources

**Solutions:**
- If you have many WLED devices or segments, increase the `pollInterval` to reduce network traffic:
  ```json
  { "defaultPollInterval": 30 }
  ```
- Enable WebSockets instead of polling when possible (reduces overhead)
- Disable segments if you don't need individual segment control
- Limit the number of enabled presets using `enabledPresets` array

### Plugin Not Appearing in Config UI X

**Problem:** Can't find the plugin or Custom UI in Homebridge Config UI X

**Solutions:**
- Ensure plugin is properly installed: `npm list -g homebridge-simpler-wled`
- Restart Homebridge Config UI X
- Clear browser cache and reload the page
- Check that Homebridge Config UI X is up to date
- Verify plugin installed correctly: check for errors in Homebridge logs

### Getting Debug Information

Enable debug logging to troubleshoot issues:

```json
{
  "platform": "WLED",
  "logLevel": "debug"
}
```

Then check Homebridge logs for detailed information about plugin operations.

## Development

### Setup

1. **Clone this repository:**
   ```bash
   git clone https://github.com/drewcovi/homebridge-simpler-wled.git
   cd homebridge-simpler-wled
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the plugin:**
   ```bash
   npm run build
   ```

4. **Link to your local Homebridge installation for testing:**
   ```bash
   npm link
   ```

5. **Watch for changes during development:**
   ```bash
   npm run watch
   ```

### Available Scripts

- `npm run build` - Clean, lint, test, and build the plugin and UI
- `npm run watch` - Build and watch for file changes
- `npm run clean` - Remove build artifacts
- `npm run lint` - Run ESLint on TypeScript files
- `npm test` - Run all tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:verbose` - Run tests with verbose output
- `npm run test:unit` - Run unit tests only

### Project Structure

- `src/` - TypeScript source files
  - `platform.ts` - Main platform implementation
  - `platformAccessory.ts` - Accessory handler
  - `wledDevice.ts` - WLED device communication
  - `discoveryService.ts` - mDNS and SSDP discovery
  - `settings.ts` - Plugin constants
- `homebridge-ui/` - Custom UI for Homebridge Config UI X
- `tests/` - Unit tests
- `config.schema.json` - Configuration schema for Homebridge Config UI X

### Testing

The plugin includes comprehensive unit tests. Run them with:

```bash
npm test
```

For continuous testing during development:

```bash
npm run test:watch
```

### Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## Support

- **Issues:** Report bugs or request features on [GitHub Issues](https://github.com/drewcovi/homebridge-simpler-wled/issues)
- **WLED Documentation:** [WLED Knowledge Base](https://kno.wled.ge/)
- **Homebridge Documentation:** [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki)

## License

MIT

## Credits

Developed by Drew Covi

Special thanks to the [WLED project](https://github.com/Aircoookie/WLED) for creating an amazing LED controller firmware.