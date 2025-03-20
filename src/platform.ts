import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { WLEDAccessory } from './platformAccessory';
import { WLEDSegmentAccessory } from './segmentAccessory';
import { WLEDPresetAccessory } from './presetAccessory';
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
      
      // Register for discovery events
      this.discoveryService.addDiscoveryListener(this.handleDiscoveredDevices.bind(this));
      
      // Start automatic discovery if enabled
      // Check if we have the new nested structure or old flat structure
      const autoDiscover = this.config.discoverySection?.autoDiscover !== undefined 
        ? this.config.discoverySection.autoDiscover 
        : this.config.autoDiscover !== false;
        
      if (autoDiscover) {
        this.discoveryService.startDiscovery();
      }
      
      // Process manually configured devices
      this.discoverDevices();
    });
  }
  
  /**
   * Handle newly discovered WLED devices
   */
  private handleDiscoveredDevices(devices: DiscoveredWLEDDevice[]): void {
    this.log.info(`Discovered ${devices.length} WLED devices on the network`);
    
    // Process each discovered device
    for (const device of devices) {
      // Skip if this device is already manually configured
      const manualDevices = this.config.devices || [];
      const isManuallyConfigured = manualDevices.some((d: any) => 
        d.host === device.host || (d.name && d.name === device.name)
      );
      
      if (isManuallyConfigured) {
        this.log.debug(`Skipping discovered device ${device.name} as it's already manually configured`);
        continue;
      }
      
      // Generate UUID for this device
      const uuid = this.api.hap.uuid.generate(device.host);
      
      // Check if we already know about this device
      if (this.wledDevices.has(uuid)) {
        continue;
      }
      
      this.log.info(`Adding discovered WLED device: ${device.name} at ${device.host}:${device.port}`);
      
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
        
        // Update name if it's changed
        if (existingAccessory.displayName !== device.name) {
          existingAccessory.displayName = device.name;
        }
        
        // Create the accessory handler
        new WLEDAccessory(this, existingAccessory, wledDevice);
        
        // Update accessory cache
        this.api.updatePlatformAccessories([existingAccessory]);
      } else {
        // Create a new accessory
        this.log.info('Adding new accessory:', device.name);
        
        const accessory = new this.api.platformAccessory(device.name, uuid);
        
        // Get default settings from either nested or flat config structure
        const defaultSettings = this.config.defaultSettingsSection || {};
        const defaultUseSegments = defaultSettings.defaultUseSegments !== undefined
          ? defaultSettings.defaultUseSegments
          : this.config.defaultUseSegments || false;
        const defaultUsePresetService = defaultSettings.defaultUsePresetService !== undefined
          ? defaultSettings.defaultUsePresetService
          : this.config.defaultUsePresetService !== false;
        const defaultUseWebSockets = defaultSettings.defaultUseWebSockets !== undefined
          ? defaultSettings.defaultUseWebSockets
          : this.config.defaultUseWebSockets !== false;
        const defaultPollInterval = defaultSettings.defaultPollInterval !== undefined
          ? defaultSettings.defaultPollInterval
          : this.config.defaultPollInterval || 10;
        
        // Store device info in the context
        accessory.context.device = {
          name: device.name,
          host: device.host,
          port: device.port,
          // Use default settings for auto-discovered devices
          useSegments: defaultUseSegments,
          usePresetService: defaultUsePresetService,
          useWebSockets: defaultUseWebSockets,
          pollInterval: defaultPollInterval,
        };
        
        // Create the accessory handler
        new WLEDAccessory(this, accessory, wledDevice);
        
        // Register the accessory
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        
        // Create segment accessories if enabled by default
        if (defaultUseSegments) {
          this.createSegmentAccessories(accessory.context.device, wledDevice);
        }
        
        // Create preset accessory if enabled by default
        if (defaultUsePresetService) {
          this.createPresetAccessory(accessory.context.device, wledDevice);
        }
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
   * Helper function to create segment accessories for a device
   */
  private createSegmentAccessories(device: any, wledDevice: WLEDDevice): void {
    wledDevice.getSegments().then(segments => {
      this.log.debug(`Found ${segments.length} segments for device: ${device.name}`);
      
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const segmentUuid = this.api.hap.uuid.generate(`${device.host}-segment-${i}`);
        const segmentName = segment.name || `${device.name} Segment ${i}`;
        
        const existingSegmentAccessory = this.accessories.find(accessory => accessory.UUID === segmentUuid);

        if (existingSegmentAccessory) {
          this.log.info('Restoring existing segment accessory from cache:', existingSegmentAccessory.displayName);
          new WLEDSegmentAccessory(this, existingSegmentAccessory, wledDevice, i);
          this.api.updatePlatformAccessories([existingSegmentAccessory]);
        } else {
          this.log.info('Adding new segment accessory:', segmentName);
          const segmentAccessory = new this.api.platformAccessory(segmentName, segmentUuid);
          segmentAccessory.context.device = device;
          segmentAccessory.context.segmentIndex = i;
          
          new WLEDSegmentAccessory(this, segmentAccessory, wledDevice, i);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [segmentAccessory]);
        }
      }
    }).catch(error => {
      this.log.error(`Failed to get segments for device: ${device.name}`, error);
    });
  }
  
  /**
   * Helper function to create preset accessory for a device
   */
  private createPresetAccessory(device: any, wledDevice: WLEDDevice): void {
    const presetUuid = this.api.hap.uuid.generate(`${device.host}-presets`);
    const presetName = `${device.name} Presets`;
    
    const existingPresetAccessory = this.accessories.find(accessory => accessory.UUID === presetUuid);

    if (existingPresetAccessory) {
      this.log.info('Restoring existing preset accessory from cache:', existingPresetAccessory.displayName);
      new WLEDPresetAccessory(this, existingPresetAccessory, wledDevice);
      this.api.updatePlatformAccessories([existingPresetAccessory]);
    } else {
      this.log.info('Adding new preset accessory:', presetName);
      const presetAccessory = new this.api.platformAccessory(presetName, presetUuid);
      presetAccessory.context.device = device;
      presetAccessory.category = this.api.hap.Categories.SWITCH;
      
      new WLEDPresetAccessory(this, presetAccessory, wledDevice);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [presetAccessory]);
    }
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
        const accessory = new this.api.platformAccessory(device.name, uuid);

        // store a copy of the device object in the `accessory.context`
        accessory.context.device = device;

        // create the accessory handler for the newly create accessory
        new WLEDAccessory(this, accessory, wledDevice);

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);

        // Create segment accessories if enabled
        if (deviceSettings.useSegments) {
          this.createSegmentAccessories(device, wledDevice);
        }
        
        // Create preset accessory for preset control if enabled
        if (deviceSettings.usePresetService !== false) { // Default to true if not specified
          this.createPresetAccessory(device, wledDevice);
        }
      }
    }

    // We don't remove accessories that were auto-discovered but are no longer manually configured,
    // since they might still be available on the network and tracked by the discovery service.
    // The discovery service will handle device removal if they truly disappear from the network.
    
    // Only remove accessories that were manually configured but are no longer in the config
    const manualAccessories = this.accessories.filter(accessory => {
      // Check if this is a manually configured accessory (not auto-discovered)
      // This is a rough heuristic - accessories from config.devices will have been explicitly added
      const device = accessory.context.device;
      if (!device) {
        return false;
      }
      
      // If it's a segment or preset accessory, check if its parent device was manually configured
      if (accessory.context.segmentIndex !== undefined || accessory.UUID.includes('-presets')) {
        const parentHost = device.host;
        return devices.some((configuredDevice: any) => configuredDevice.host === parentHost);
      }
      
      // For main device accessories, check if they were manually configured
      return devices.some((configuredDevice: any) => 
        this.api.hap.uuid.generate(configuredDevice.host) === accessory.UUID
      );
    });
    
    // Check which manual accessories are no longer in the config
    for (const accessory of manualAccessories) {
      const device = accessory.context.device;
      
      // Check if the accessory's device is still configured
      const isConfigured = devices.some((configuredDevice: any) => 
        this.api.hap.uuid.generate(configuredDevice.host) === accessory.UUID || 
        (accessory.context.segmentIndex !== undefined && 
          this.api.hap.uuid.generate(`${configuredDevice.host}-segment-${accessory.context.segmentIndex}`) === accessory.UUID) ||
        this.api.hap.uuid.generate(`${configuredDevice.host}-presets`) === accessory.UUID
      );

      if (!isConfigured) {
        this.log.info('Removing existing accessory from cache:', accessory.displayName);
        
        // If this is a main device, clean up the WLED device instance
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