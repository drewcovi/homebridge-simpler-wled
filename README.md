# Homebridge WLED

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
- Automatic discovery and configuration of WLED devices on your network
- Real-time updates via WebSockets for responsive control
- Fallback to polling for backwards compatibility

## Installation

1. Install Homebridge if you haven't already using the [official instructions](https://github.com/homebridge/homebridge/wiki).
2. Install this plugin: `npm install -g homebridge-wled-ts`
3. Configure the plugin using one of the methods below.
4. Restart Homebridge.

## Configuration

### Using Homebridge Config UI X

If you're using [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x), you can configure this plugin directly through the web interface:

1. Navigate to the Plugins tab
2. Find the WLED plugin and click Settings
3. **Use the Discovery UI** to find WLED devices on your network:
   - Click "Start Discovery" to scan for devices
   - View device details (IP, version, MAC address, LED count)
   - Click "Add to Configuration" to automatically add devices
4. Configure your settings:
   - Enable/disable auto-discovery
   - Set default configuration for discovered devices
   - Manually add devices with custom settings
5. Click Save to apply your changes

See [UI_DISCOVERY_GUIDE.md](./UI_DISCOVERY_GUIDE.md) for detailed information about the discovery interface.

### Manual Configuration

#### Automatic Discovery

The plugin will automatically discover WLED devices on your network. Simply add the platform to your config:

```json
{
  "platform": "WLED",
  "name": "WLED",
  "autoDiscover": true
}
```

### Manual Configuration

If you need more control or have WLED devices that can't be discovered automatically, you can manually configure them:

```json
{
  "platform": "WLED",
  "name": "WLED",
  "autoDiscover": true,
  "defaultUseSegments": false,
  "defaultUsePresetService": true,
  "defaultUseWebSockets": true,
  "defaultPollInterval": 10,
  "devices": [
    {
      "name": "Living Room LEDs",
      "host": "192.168.1.100",
      "port": 80,
      "useSegments": false,
      "pollInterval": 10
    },
    {
      "name": "Bedroom LEDs",
      "host": "192.168.1.101",
      "useSegments": true
    }
  ]
}
```

### Platform Configuration Options

The platform supports the following options:

| Property | Description | Default | Required |
|----------|-------------|---------|----------|
| `name` | Name of the platform in HomeKit | `"WLED"` | Yes |
| `autoDiscover` | Enable automatic discovery of WLED devices | `true` | No |
| `defaultUseSegments` | Expose LED segments for auto-discovered devices | `false` | No |
| `defaultUsePresetService` | Add preset controls for auto-discovered devices | `true` | No |
| `defaultUseWebSockets` | Use WebSockets for auto-discovered devices | `true` | No |
| `defaultPollInterval` | Default polling interval for auto-discovered devices | `10` | No |

### Device Configuration Options

Each device in the `devices` array can have the following properties:

| Property | Description | Default | Required |
|----------|-------------|---------|----------|
| `name` | Name of the device in HomeKit | - | Yes |
| `host` | IP address or hostname of the WLED device | - | Yes |
| `port` | HTTP port of the WLED device | 80 | No |
| `useSegments` | Expose each LED segment as a separate accessory | false | No |
| `usePresetService` | Add preset selector controls | true | No |
| `useWebSockets` | Use WebSockets for real-time updates (requires WLED v0.13+) | true | No |
| `pollInterval` | How often to poll for state updates (in seconds) | 10 | No |

## Using Segments

WLED allows you to divide your LED strip into multiple segments that can be controlled individually. When you set `useSegments` to `true`, each segment will appear as a separate light in HomeKit.

This is useful for:
- LED strips that wrap around different areas
- Creating different zones in a room
- Complex lighting setups

## Using the Preset Service

By default, this plugin creates a Preset accessory for each WLED device. This provides a convenient way to switch between WLED presets directly from HomeKit.

Features of the Preset service:
- Each WLED preset appears as a switch in HomeKit
- Turning on a preset switch activates that preset on your WLED device
- The main light service provides power and brightness control
- Easily organize presets in the Home app or Control Center
- Control presets directly through Siri

The preset service reads presets directly from your WLED device and updates automatically when presets are added, modified or removed on the WLED device.

If you don't want to use this feature, you can disable it by setting `usePresetService` to `false` in your device configuration.

## WebSocket Support

This plugin uses WebSockets to provide real-time updates from your WLED devices. This offers several benefits:

- Instant state updates when changes are made outside of HomeKit
- Reduced network traffic compared to polling
- Lower latency for a more responsive experience
- Less CPU and memory usage on your server

WebSockets require WLED version 0.13 or newer. If you're using an older version of WLED, the plugin will automatically fall back to polling. You can also disable WebSockets manually by setting `useWebSockets` to `false` in your device configuration.

## Discovery Methods

The plugin uses multiple methods to discover WLED devices on your network:

1. **mDNS (Bonjour)** - Discovers WLED devices that advertise themselves using the mDNS protocol
2. **SSDP (UPnP)** - Discovers WLED devices that respond to Simple Service Discovery Protocol queries
3. **Manual configuration** - For devices that cannot be discovered automatically

The automatic discovery process runs when Homebridge starts and periodically afterward to find new devices.

## Troubleshooting

### Automatic Discovery Not Working

- Ensure your WLED devices are on the same network as your Homebridge server
- Check that your network allows mDNS and SSDP traffic (some routers block this)
- Update your WLED firmware to the latest version
- Try adding the device manually using its IP address

### Device Not Responding

- Ensure your WLED device is on the same network as your Homebridge server
- Verify that you can access the WLED web interface at `http://<your-device-ip>`
- Check that the correct IP address and port are configured
- If using DHCP, consider setting a static IP for your WLED device

### HomeKit Not Updating

- Enable WebSockets if you're using WLED v0.13 or newer
- Decrease the `pollInterval` to get more frequent updates
- Restart the WLED device and Homebridge

### Performance Issues

- If you have many WLED devices or segments, increase the `pollInterval` to reduce network traffic
- Use WebSockets instead of polling when possible
- Disable automatic discovery if you're not adding new devices regularly

## Development

1. Clone this repository
2. Install dependencies: `npm install`
3. Build the plugin: `npm run build`
4. Link to your local Homebridge installation for testing: `npm link`

## License

MIT