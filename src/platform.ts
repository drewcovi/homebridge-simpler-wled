import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { WLEDLightAccessory } from './platformAccessory';
import { WLEDPresetsAccessory } from './presetsAccessory';
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

  // keyed by device host
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
    const name = host.replace(/\.local$/i, '');

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
   * Generate the UUID for a device's light accessory
   */
  private lightUuid(host: string): string {
    return this.api.hap.uuid.generate(host + ':light');
  }

  /**
   * Generate the UUID for a device's presets/TV accessory
   */
  private tvUuid(host: string): string {
    return this.api.hap.uuid.generate(host + ':tv');
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

      // Check if we already know about this device (by host)
      if (this.wledDevices.has(device.host)) {
        this.log.info(`Skipping discovered device ${device.name} at ${device.host} - accessory already exists`);
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

      this.wledDevices.set(device.host, wledDevice);

      const lightUuid = this.lightUuid(device.host);
      const tvUuid = this.tvUuid(device.host);
      const deviceContext = { name: displayName, host: device.host, port: device.port };

      // --- Light accessory ---
      const existingLightAccessory = this.accessories.find(a => a.UUID === lightUuid);
      if (existingLightAccessory) {
        this.log.info('Restoring existing light accessory from cache:', existingLightAccessory.displayName);
        existingLightAccessory.context.device = deviceContext;
        new WLEDLightAccessory(this, existingLightAccessory, wledDevice);
        this.api.updatePlatformAccessories([existingLightAccessory]);
      } else {
        this.log.info('Adding new light accessory:', displayName);
        const lightAccessory = new this.api.platformAccessory(displayName, lightUuid);
        lightAccessory.context.device = deviceContext;
        new WLEDLightAccessory(this, lightAccessory, wledDevice);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [lightAccessory]);
      }

      // --- Presets/TV accessory ---
      const tvDisplayName = displayName + ' Presets';
      const existingTVAccessory = this.accessories.find(a => a.UUID === tvUuid);
      if (existingTVAccessory) {
        this.log.info('Restoring existing TV accessory from cache:', existingTVAccessory.displayName);
        existingTVAccessory.context.device = deviceContext;
        new WLEDPresetsAccessory(this, existingTVAccessory, wledDevice);
        this.api.updatePlatformAccessories([existingTVAccessory]);
      } else {
        this.log.info('Adding new TV accessory:', tvDisplayName);
        const tvAccessory = new this.api.platformAccessory(tvDisplayName, tvUuid, this.api.hap.Categories.TELEVISION);
        tvAccessory.context.device = deviceContext;
        new WLEDPresetsAccessory(this, tvAccessory, wledDevice);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [tvAccessory]);
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

    // Warn if no devices are configured
    if (devices.length === 0) {
      this.log.warn('No WLED devices configured. Use the Custom Plugin UI to discover devices or manually add them to your config.');
      // Don't return early - we still need to clean up any old accessories
    }

    // loop over the configured devices and register each one if it has not already been registered
    for (const device of devices) {
      // check that the device has all required fields
      if (!device.name || !device.host) {
        this.log.error('Device missing required fields (name and host):', device);
        continue;
      }

      const lightUuid = this.lightUuid(device.host);
      const tvUuid = this.tvUuid(device.host);

      // Skip disabled devices
      if (device.enabled === false) {
        this.log.info(`Skipping disabled device: ${device.name}`);

        // If these accessories were previously registered, unregister them
        const toRemove = this.accessories.filter(a => a.UUID === lightUuid || a.UUID === tvUuid);
        if (toRemove.length > 0) {
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, toRemove);
        }

        continue;
      }

      // Handle nested device settings if present
      const deviceSettings = device.deviceSettings || device;

      // Generate a display name from the hostname for better legibility
      const displayName = this.getDisplayNameFromHost(device.host, device.name);

      // create the WLED device instance
      const wledDevice = new WLEDDevice(
        this.log,
        device.host,
        device.port || 80,
        deviceSettings.pollInterval || 10,
        deviceSettings.useWebSockets !== false, // Default to true if not specified
      );

      this.wledDevices.set(device.host, wledDevice);

      const deviceContext = { ...device, name: displayName };

      // --- Light accessory ---
      const existingLightAccessory = this.accessories.find(a => a.UUID === lightUuid);
      if (existingLightAccessory) {
        this.log.info('Restoring existing light accessory from cache:', existingLightAccessory.displayName);
        if (existingLightAccessory.displayName !== displayName) {
          this.log.info(`Updating display name from "${existingLightAccessory.displayName}" to "${displayName}"`);
          existingLightAccessory.displayName = displayName;
        }
        existingLightAccessory.context.device = deviceContext;
        new WLEDLightAccessory(this, existingLightAccessory, wledDevice);
        this.api.updatePlatformAccessories([existingLightAccessory]);
      } else {
        this.log.info('Adding new light accessory:', displayName);
        const lightAccessory = new this.api.platformAccessory(displayName, lightUuid);
        lightAccessory.context.device = deviceContext;
        new WLEDLightAccessory(this, lightAccessory, wledDevice);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [lightAccessory]);
      }

      // --- Presets/TV accessory ---
      const tvDisplayName = displayName + ' Presets';
      const existingTVAccessory = this.accessories.find(a => a.UUID === tvUuid);

      // Check if enabledPresets have changed (only applies to TV accessory)
      const oldEnabledPresets = existingTVAccessory?.context.device?.deviceSettings?.enabledPresets || [];
      const newEnabledPresets = device.deviceSettings?.enabledPresets || [];
      const presetsChanged = JSON.stringify([...oldEnabledPresets].sort()) !== JSON.stringify([...newEnabledPresets].sort());

      if (existingTVAccessory) {
        if (presetsChanged) {
          this.log.info(`Enabled presets changed for ${displayName}. Re-registering TV accessory to force Home app refresh...`);
          this.log.debug(`Old presets: ${JSON.stringify(oldEnabledPresets)}`);
          this.log.debug(`New presets: ${JSON.stringify(newEnabledPresets)}`);

          // Unregister the old TV accessory
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingTVAccessory]);

          // Create a new TV accessory with updated presets
          const newTVAccessory = new this.api.platformAccessory(tvDisplayName, tvUuid, this.api.hap.Categories.TELEVISION);
          newTVAccessory.context.device = deviceContext;
          new WLEDPresetsAccessory(this, newTVAccessory, wledDevice);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [newTVAccessory]);

          // Update our accessories cache
          const index = this.accessories.findIndex(a => a.UUID === tvUuid);
          if (index !== -1) {
            this.accessories[index] = newTVAccessory;
          } else {
            this.accessories.push(newTVAccessory);
          }
        } else {
          this.log.info('Restoring existing TV accessory from cache:', existingTVAccessory.displayName);
          existingTVAccessory.context.device = deviceContext;
          new WLEDPresetsAccessory(this, existingTVAccessory, wledDevice);
          this.api.updatePlatformAccessories([existingTVAccessory]);
        }
      } else {
        this.log.info('Adding new TV accessory:', tvDisplayName);
        const tvAccessory = new this.api.platformAccessory(tvDisplayName, tvUuid, this.api.hap.Categories.TELEVISION);
        tvAccessory.context.device = deviceContext;
        new WLEDPresetsAccessory(this, tvAccessory, wledDevice);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [tvAccessory]);
      }
    }

    // Check which accessories are no longer in the config and should be removed
    for (const accessory of this.accessories) {
      const device = accessory.context.device;
      if (!device) {
        continue;
      }

      // Check if the accessory's device is still configured (matches either UUID for the device)
      const isConfigured = devices.some((configuredDevice: any) => {
        const lightUuid = this.lightUuid(configuredDevice.host);
        const tvUuid = this.tvUuid(configuredDevice.host);
        return accessory.UUID === lightUuid || accessory.UUID === tvUuid;
      });

      if (!isConfigured) {
        this.log.info('Removing existing accessory from cache:', accessory.displayName);

        // Clean up the WLED device instance (only once per host)
        const deviceHost = device.host;
        if (deviceHost && this.wledDevices.has(deviceHost)) {
          const wledDevice = this.wledDevices.get(deviceHost);
          if (wledDevice) {
            wledDevice.cleanup();
          }
          this.wledDevices.delete(deviceHost);
        }

        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
}
