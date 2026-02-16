import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { WLEDAccessory } from './platformAccessory';
import { WLEDDevice } from './wledDevice';
import { WLEDDiscoveryService, DiscoveredWLEDDevice } from './discoveryService';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class WLEDPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];
  public readonly wledDevices: Map<string, WLEDDevice> = new Map();
  
  // discovery service
  private discoveryService: WLEDDiscoveryService;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;
    
    // Initialize the discovery service
    this.discoveryService = new WLEDDiscoveryService(this.log);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      
      // Register for discovery events (needed for UI-triggered discovery)
      this.discoveryService.addDiscoveryListener(this.handleDiscoveredDevices.bind(this));

      // Note: Automatic discovery is disabled. Discovery is only triggered via the Custom UI.
      // This prevents unnecessary network scanning on every Homebridge restart.

      // Process manually configured devices
      this.discoverDevices();
    });
  }
  
  /**
   * Extract a friendly display name from the hostname
   */
  private getDisplayNameFromHost(host: string, fallbackName: string): string {
    // Remove .local suffix
    let name = host.replace(/\.local$/i, '');

    // If it's an IP address, use the fallback name
    if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) {
      return fallbackName;
    }

    // Convert hostname to title case (e.g., "holiday-lights" -> "Holiday Lights")
    return name
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Handle newly discovered WLED devices
   */
  private handleDiscoveredDevices(devices: DiscoveredWLEDDevice[]): void {
    this.log.info(`Discovered ${devices.length} WLED devices on the network`);

    // Log all discovered devices for debugging
    for (const device of devices) {
      this.log.debug(`Discovery found: ${device.name} at ${device.host}:${device.port} (ID: ${device.id}, Method: ${device.discoveryMethod})`);
    }

    // Process each discovered device
    for (const device of devices) {
      // Skip if this device is already manually configured
      const manualDevices = this.config.devices || [];
      const isManuallyConfigured = manualDevices.some((d: any) =>
        d.host === device.host || (d.name && d.name === device.name)
      );

      if (isManuallyConfigured) {
        this.log.info(`Skipping discovered device ${device.name} at ${device.host} - already manually configured`);
        continue;
      }

      // Generate UUID for this device based on host
      const uuid = this.api.hap.uuid.generate(device.host);
      this.log.debug(`Generated UUID ${uuid} for device ${device.name} (host: ${device.host})`);

      // Check if we already know about this device
      if (this.wledDevices.has(uuid)) {
        this.log.info(`Skipping discovered device ${device.name} at ${device.host} - accessory already exists with this UUID`);
        continue;
      }

      // Generate a display name from the hostname
      const displayName = this.getDisplayNameFromHost(device.host, device.name);

      this.log.info(`Adding discovered WLED device: ${displayName} at ${device.host}:${device.port}`);

      // Get settings from either nested or flat config structure
      const defaultSettings = this.config.defaultSettingsSection || {};
      const defaultPollInterval = defaultSettings.defaultPollInterval !== undefined
        ? defaultSettings.defaultPollInterval
        : this.config.defaultPollInterval || 10;
      const defaultUseWebSockets = defaultSettings.defaultUseWebSockets !== undefined
        ? defaultSettings.defaultUseWebSockets
        : this.config.defaultUseWebSockets !== false;

      // Create the WLED device instance
      const wledDevice = new WLEDDevice(
        this.log,
        device.host,
        device.port,
        defaultPollInterval,
        defaultUseWebSockets,
      );

      this.wledDevices.set(uuid, wledDevice);

      // See if an accessory with the same uuid has already been registered and restored
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        // The accessory already exists
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // Update name to match hostname
        if (existingAccessory.displayName !== displayName) {
          existingAccessory.displayName = displayName;
        }

        // Create the accessory handler
        new WLEDAccessory(this, existingAccessory, wledDevice);

        // Update accessory cache
        this.api.updatePlatformAccessories([existingAccessory]);
      } else {
        // Create a new accessory
        this.log.info('Adding new accessory:', displayName);

        const accessory = new this.api.platformAccessory(displayName, uuid);

        // Store device info in the context
        accessory.context.device = {
          name: displayName,
          host: device.host,
          port: device.port,
        };

        // Create the accessory handler
        new WLEDAccessory(this, accessory, wledDevice);

        // Register the accessory
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }


  /**
   * Process manually configured devices
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {
    // Get devices list from either nested or flat config structure
    const devices = this.config.manualDevicesSection?.devices || this.config.devices || [];

    // loop over the configured devices and register each one if it has not already been registered
    for (const device of devices) {
      // generate a unique id for the accessory based on the provided device info
      const uuid = this.api.hap.uuid.generate(device.host);

      // check that the device has all required fields
      if (!device.name || !device.host) {
        this.log.error('Device missing required fields (name and host):', device);
        continue;
      }

      // Skip disabled devices
      if (device.enabled === false) {
        this.log.info(`Skipping disabled device: ${device.name}`);

        // If this device was previously registered, unregister it
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
        if (existingAccessory) {
          this.log.info(`Unregistering disabled device: ${device.name}`);
          this.api.unregisterPlatformAccessories('homebridge-wled-ts', 'WLEDTS', [existingAccessory]);
        }

        continue;
      }

      // Handle nested device settings if present
      const deviceSettings = device.deviceSettings || device;
      
      // create the WLED device instance
      const wledDevice = new WLEDDevice(
        this.log,
        device.host,
        device.port || 80,
        deviceSettings.pollInterval || 10,
        deviceSettings.useWebSockets !== false, // Default to true if not specified
      );

      this.wledDevices.set(uuid, wledDevice);

      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        // the accessory already exists
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // create the accessory handler for the restored accessory
        new WLEDAccessory(this, existingAccessory, wledDevice);

        // update accessory cache with any changes to the accessory details and information
        this.api.updatePlatformAccessories([existingAccessory]);
      } else {
        // the accessory does not yet exist, so we need to create it
        this.log.info('Adding new accessory:', device.name);

        // create a new accessory
        const accessory = new this.api.platformAccessory(device.name, uuid, this.api.hap.Categories.TELEVISION);

        // store a copy of the device object in the `accessory.context`
        accessory.context.device = device;

        // create the accessory handler for the newly create accessory
        new WLEDAccessory(this, accessory, wledDevice);

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

    // Check which accessories are no longer in the config and should be removed
    for (const accessory of this.accessories) {
      const device = accessory.context.device;
      if (!device) {
        continue;
      }

      // Check if the accessory's device is still configured
      const isConfigured = devices.some((configuredDevice: any) =>
        this.api.hap.uuid.generate(configuredDevice.host) === accessory.UUID
      );

      if (!isConfigured) {
        this.log.info('Removing existing accessory from cache:', accessory.displayName);

        // Clean up the WLED device instance
        const deviceUuid = accessory.UUID;
        if (this.wledDevices.has(deviceUuid)) {
          const wledDevice = this.wledDevices.get(deviceUuid);
          if (wledDevice) {
            wledDevice.cleanup();
          }
          this.wledDevices.delete(deviceUuid);
        }

        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
}