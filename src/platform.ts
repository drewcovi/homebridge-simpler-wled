import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { WLEDAccessory } from './platformAccessory';
import { WLEDSegmentAccessory } from './segmentAccessory';
import { WLEDTelevisionAccessory } from './televisionAccessory';
import { WLEDDevice } from './wledDevice';

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

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
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
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {
    const devices = this.config.devices || [];

    // loop over the discovered devices and register each one if it has not already been registered
    for (const device of devices) {
      // generate a unique id for the accessory based on the provided device info
      const uuid = this.api.hap.uuid.generate(device.host);

      // check that the device has all required fields
      if (!device.name || !device.host) {
        this.log.error('Device missing required fields (name and host):', device);
        continue;
      }

      // create the WLED device instance
      const wledDevice = new WLEDDevice(
        this.log,
        device.host,
        device.port || 80,
        device.pollInterval || 10,
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
        if (device.useSegments) {
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
        
        // Create television accessory for preset control if enabled
        if (device.useTelevisionService !== false) { // Default to true if not specified
          const tvUuid = this.api.hap.uuid.generate(`${device.host}-tv`);
          const tvName = `${device.name} Presets`;
          
          const existingTvAccessory = this.accessories.find(accessory => accessory.UUID === tvUuid);

          if (existingTvAccessory) {
            this.log.info('Restoring existing TV accessory from cache:', existingTvAccessory.displayName);
            new WLEDTelevisionAccessory(this, existingTvAccessory, wledDevice);
            this.api.updatePlatformAccessories([existingTvAccessory]);
          } else {
            this.log.info('Adding new TV accessory for presets:', tvName);
            const tvAccessory = new this.api.platformAccessory(tvName, tvUuid);
            tvAccessory.context.device = device;
            tvAccessory.category = this.api.hap.Categories.TELEVISION;
            
            new WLEDTelevisionAccessory(this, tvAccessory, wledDevice);
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [tvAccessory]);
          }
        }
      }
    }

    // Remove accessories that are no longer configured
    for (const accessory of this.accessories) {
      const device = accessory.context.device;
      
      // Check if the accessory's device is still configured
      const isConfigured = devices.some(configuredDevice => 
        this.api.hap.uuid.generate(configuredDevice.host) === accessory.UUID || 
        (accessory.context.segmentIndex !== undefined && 
          this.api.hap.uuid.generate(`${configuredDevice.host}-segment-${accessory.context.segmentIndex}`) === accessory.UUID) ||
        this.api.hap.uuid.generate(`${configuredDevice.host}-tv`) === accessory.UUID
      );

      if (!isConfigured) {
        this.log.info('Removing existing accessory from cache:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
}