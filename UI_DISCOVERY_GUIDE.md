# WLED Device Discovery UI

This plugin includes a custom UI interface for discovering WLED devices on your network directly from the Homebridge Config UI X.

## Features

- **Automatic Network Discovery**: Scans your network using both mDNS (Bonjour) and SSDP (UPnP) protocols to find WLED devices
- **Real-time Device Information**: Displays device name, IP address, version, MAC address, and LED count
- **One-Click Configuration**: Add discovered devices to your configuration with a single button click
- **Discovery Method Indication**: Shows which protocol was used to discover each device (mDNS, SSDP, or Direct)

## How to Use

### Accessing the Discovery Interface

1. Open Homebridge Config UI X in your web browser
2. Navigate to the **Plugins** tab
3. Find **WLED** in your installed plugins
4. Click on the **Settings** button
5. You'll see a **"WLED Device Discovery"** section at the top of the configuration page

### Discovering Devices

1. Click the **"Start Discovery"** button
2. The plugin will scan your network for 5-10 seconds
3. Discovered devices will appear in cards showing:
   - Device name
   - IP address and port
   - Unique ID
   - WLED version
   - MAC address
   - Number of LEDs
   - Discovery method (mDNS/SSDP/Direct)

### Adding Devices to Configuration

1. Once devices are discovered, each device card will have an **"Add to Configuration"** button
2. Click this button to automatically add the device to your manual device configuration
3. The device will be added with default settings:
   - Segments: Disabled
   - Preset Controls: Enabled
   - WebSockets: Enabled
   - Poll Interval: 10 seconds
4. After adding devices, **restart Homebridge** for the changes to take effect

### Customizing Added Devices

After adding a device through the discovery UI:

1. Scroll down to the **"Manual Device Configuration"** section
2. Find your newly added device
3. Click to expand its settings
4. Customize the device-specific settings:
   - Enable/disable LED segment accessories
   - Configure preset controls
   - Adjust WebSocket settings
   - Change polling interval

## Discovery Methods

The plugin uses multiple discovery protocols to find WLED devices:

### mDNS (Multicast DNS)
- Also known as Bonjour or Zeroconf
- Discovers devices advertising the `_http._tcp` service
- Looks for hostnames starting with "wled-"
- Most reliable for devices on the same subnet

### SSDP (Simple Service Discovery Protocol)
- Also known as UPnP discovery
- Discovers devices responding to UPnP queries
- Can find devices across VLANs in some network configurations
- Looks for devices with "WLED" in the server header

### Direct Connection
- Manually add devices by IP address through the UI
- Useful for devices not discoverable via mDNS or SSDP
- Good for devices on different subnets or with discovery disabled

## Troubleshooting

### No Devices Found

If discovery doesn't find your WLED devices:

1. **Check Network Connection**:
   - Ensure your WLED devices are powered on
   - Verify they're connected to the same network as your Homebridge server
   - Check that mDNS/Bonjour traffic isn't blocked by your router or firewall

2. **Manual Configuration**:
   - If automatic discovery fails, manually add devices in the "Manual Device Configuration" section
   - You'll need the device's IP address and port (default: 80)

3. **Discovery Settings**:
   - Enable "Automatically Discover WLED Devices" in the Discovery Settings section
   - Try running discovery multiple times
   - Some devices may take longer to respond

### Device Already Configured

If you try to add a device that's already in your configuration, you'll see a warning message. The plugin prevents duplicate device entries.

### Discovery Takes Too Long

- Initial discovery scans for about 6 seconds
- The UI will continue polling for up to 30 seconds to catch slower-responding devices
- You can click "Start Discovery" again to trigger a new scan

## Technical Details

### Discovery Process

1. When you click "Start Discovery", the UI server creates a WLEDDiscoveryService instance
2. The service simultaneously:
   - Broadcasts mDNS queries for HTTP services
   - Sends SSDP M-SEARCH requests to the network
3. As devices respond, they're validated by requesting `/json/info` from each device
4. Device information is enriched with firmware version, MAC address, and LED configuration
5. The UI updates in real-time as devices are discovered

### Automatic vs Manual Discovery

- **Automatic Discovery** (enabled by default):
  - Runs on Homebridge startup
  - Continuously discovers new devices
  - Uses default settings for all discovered devices

- **Manual Configuration**:
  - Devices added through the discovery UI are stored in the manual configuration section
  - Allows per-device customization
  - Takes precedence over automatic discovery

## See Also

- [WLED Official Website](https://kno.wled.ge/)
- [WLED GitHub Repository](https://github.com/Aircoookie/WLED)
- [Homebridge Config UI X Documentation](https://github.com/homebridge/homebridge-config-ui-x)
