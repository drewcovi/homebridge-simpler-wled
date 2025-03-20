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
- Automatic discovery and configuration
- Real-time updates via WebSockets for responsive control
- Fallback to polling for backwards compatibility

## Installation

1. Install Homebridge if you haven't already using the [official instructions](https://github.com/homebridge/homebridge/wiki).
2. Install this plugin: `npm install -g homebridge-wled-ts`
3. Update your Homebridge configuration to add WLED devices (see Configuration below).
4. Restart Homebridge.

## Configuration

Add the following to the `platforms` section of your Homebridge `config.json`:

```json
{
  "platform": "WLED",
  "name": "WLED",
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

### Configuration Options

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

## Troubleshooting

### Device Not Responding

- Ensure your WLED device is on the same network as your Homebridge server
- Verify that you can access the WLED web interface at `http://<your-device-ip>`
- Check that the correct IP address and port are configured

### HomeKit Not Updating

- Increase the `pollInterval` to get more frequent updates
- Restart the WLED device and Homebridge

### Performance Issues

- If you have many WLED devices or segments, increase the `pollInterval` to reduce network traffic

## Development

1. Clone this repository
2. Install dependencies: `npm install`
3. Build the plugin: `npm run build`
4. Link to your local Homebridge installation for testing: `npm link`

## License

MIT