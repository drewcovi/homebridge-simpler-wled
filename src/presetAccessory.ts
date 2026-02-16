import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { WLEDPlatform } from './platform';
import { WLEDDevice } from './wledDevice';

/**
 * WLED Preset Accessory
 * This class creates HomeKit services to control WLED presets directly
 */
export class WLEDPresetAccessory {
  private lightService: Service;
  private inputSelectorService: Service;
  private inputServices: Map<string, Service> = new Map();
  
  // Preset ID to input source ID mapping
  private presetInputMap: Map<number, number> = new Map();
  private inputPresetMap: Map<number, number> = new Map();
  
  // State tracking
  private activeInput = 1;
  private currentPresetId = -1;

  // Preset listener
  private presetListener = (presets: Record<string, { name: string; data: any }>) => {
    this.updateInputSources(presets);
  }

  constructor(
    private readonly platform: WLEDPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly wledDevice: WLEDDevice,
  ) {
    // Set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'WLED')
      .setCharacteristic(this.platform.Characteristic.Model, 'WLED Preset Controller')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Preset-Controller-1');

    // Create the main lightbulb service (for power and brightness)
    this.lightService = this.accessory.getService(this.platform.Service.Lightbulb) || 
      this.accessory.addService(this.platform.Service.Lightbulb);

    // Set required Lightbulb characteristics
    this.lightService
      .setCharacteristic(this.platform.Characteristic.Name, `${accessory.context.device.name}`);

    // Register required event handlers
    this.lightService.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.getOn.bind(this))
      .onSet(this.setOn.bind(this));

    this.lightService.getCharacteristic(this.platform.Characteristic.Brightness)
      .onGet(this.getBrightness.bind(this))
      .onSet(this.setBrightness.bind(this));

    // Create input selector switch service
    this.inputSelectorService = this.accessory.getService('Preset Selector') ||
      this.accessory.addService(this.platform.Service.Switch, 'Preset Selector', 'preset-selector');
    
    this.inputSelectorService
      .setCharacteristic(this.platform.Characteristic.Name, 'Preset Selector');

    // Register for preset updates
    this.wledDevice.addPresetListener(this.presetListener);

    // Initialize presets
    this.initializePresets();
  }

  /**
   * Initialize presets by fetching them from the device
   */
  private async initializePresets(): Promise<void> {
    try {
      const presets = await this.wledDevice.getPresets();

      if (Object.keys(presets).length === 0) {
        this.platform.log.warn('No presets configured on WLED device');
        return;
      }

      this.updateInputSources(presets);

      // Get the current preset ID
      this.currentPresetId = this.wledDevice.getActivePresetId();
    } catch (error) {
      this.platform.log.error('Failed to initialize presets:', error);
    }
  }

  /**
   * Update input sources based on available presets
   */
  private updateInputSources(presets: Record<string, { name: string; data: any }>): void {
    // Clear existing mappings
    this.presetInputMap.clear();
    this.inputPresetMap.clear();
    
    // Keep track of existing services to remove any that are no longer needed
    const existingInputServiceKeys = new Set(this.inputServices.keys());
    
    // Track the next input identifier to use
    let nextInputId = 1;
    
    // Create input source for each preset
    for (const [presetIdStr, preset] of Object.entries(presets)) {
      const presetId = parseInt(presetIdStr, 10);
      if (isNaN(presetId)) {
        continue; // Skip non-numeric preset IDs
      }
      
      const inputId = nextInputId++;
      const serviceId = `preset-${presetId}`;
      
      // Map preset ID to input source ID and vice versa
      this.presetInputMap.set(presetId, inputId);
      this.inputPresetMap.set(inputId, presetId);
      
      // Remove from the existingInputServiceKeys set so we know not to remove it
      existingInputServiceKeys.delete(serviceId);
      
      // Check if we already have this switch service
      let inputService = this.inputServices.get(serviceId);
      
      if (!inputService) {
        // Create a new switch service for this preset
        inputService = this.accessory.addService(
          this.platform.Service.Switch,
          preset.name,
          serviceId
        );
        
        // Add event handlers for this switch
        inputService.getCharacteristic(this.platform.Characteristic.On)
          .onGet(() => this.getPresetActive(presetId))
          .onSet((value) => this.setPresetActive(presetId, value as boolean));
        
        // Add this input to our map
        this.inputServices.set(serviceId, inputService);
      }
      
      // Update the name if it has changed
      inputService.updateCharacteristic(this.platform.Characteristic.Name, preset.name);
    }
    
    // Remove any input services that are no longer in the presets
    for (const serviceId of existingInputServiceKeys) {
      const service = this.inputServices.get(serviceId);
      if (service) {
        this.accessory.removeService(service);
        this.inputServices.delete(serviceId);
      }
    }
  }

  /**
   * Check if a specific preset is active
   */
  async getPresetActive(presetId: number): Promise<boolean> {
    const activePresetId = this.wledDevice.getActivePresetId();
    return activePresetId === presetId;
  }

  /**
   * Activate or deactivate a specific preset
   */
  async setPresetActive(presetId: number, active: boolean): Promise<void> {
    if (active) {
      // Activate this preset
      await this.wledDevice.activatePreset(presetId);
      this.currentPresetId = presetId;
      
      // Update all other preset switches to show they're inactive
      for (const [serviceId, service] of this.inputServices.entries()) {
        const thisPresetId = parseInt(serviceId.replace('preset-', ''), 10);
        if (thisPresetId !== presetId) {
          service.updateCharacteristic(this.platform.Characteristic.On, false);
        }
      }
    } else {
      // Ignore attempts to deactivate a preset directly
      // Instead, we'll reset the switch state back to on
      if (this.currentPresetId === presetId) {
        setTimeout(() => {
          const service = this.inputServices.get(`preset-${presetId}`);
          if (service) {
            service.updateCharacteristic(this.platform.Characteristic.On, true);
          }
        }, 100);
      }
    }
  }

  /**
   * Handle requests to get the current value of the "On" characteristic
   */
  async getOn(): Promise<CharacteristicValue> {
    const state = this.wledDevice.getState();
    return state.on;
  }

  /**
   * Handle requests to set the "On" characteristic
   */
  async setOn(value: CharacteristicValue): Promise<void> {
    const isOn = value as boolean;
    await this.wledDevice.setPower(isOn);
  }

  /**
   * Handle requests to get the current value of the "Brightness" characteristic
   */
  async getBrightness(): Promise<CharacteristicValue> {
    const state = this.wledDevice.getState();
    return state.brightness;
  }

  /**
   * Handle requests to set the "Brightness" characteristic
   */
  async setBrightness(value: CharacteristicValue): Promise<void> {
    const brightness = value as number;
    await this.wledDevice.setBrightness(brightness);
  }
}