import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { WLEDPlatform } from './platform';
import { WLEDDevice } from './wledDevice';

/**
 * WLED Television Accessory
 * This class creates a HomeKit Television service to control WLED presets
 */
export class WLEDTelevisionAccessory {
  private tvService: Service;
  private tvSpeakerService: Service;
  private inputServices: Map<string, Service> = new Map();
  
  // Preset ID to input source ID mapping
  private presetInputMap: Map<number, number> = new Map();
  private inputPresetMap: Map<number, number> = new Map();
  
  // State tracking
  private activeIdentifier = 1;
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
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'TV-Controller-1');

    // Create the TV service
    this.tvService = this.accessory.getService(this.platform.Service.Television) ||
      this.accessory.addService(this.platform.Service.Television);

    // Set required Television characteristics
    this.tvService
      .setCharacteristic(this.platform.Characteristic.ConfiguredName, `${accessory.context.device.name} Presets`)
      .setCharacteristic(this.platform.Characteristic.SleepDiscoveryMode, this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

    // Register required event handlers
    this.tvService.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(this.getActive.bind(this))
      .onSet(this.setActive.bind(this));

    this.tvService.getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .onGet(this.getActiveIdentifier.bind(this))
      .onSet(this.setActiveIdentifier.bind(this));

    // Add TV Speaker service to enable volume controls
    this.tvSpeakerService = this.accessory.getService(this.platform.Service.TelevisionSpeaker) ||
      this.accessory.addService(this.platform.Service.TelevisionSpeaker);

    // Set required TelevisionSpeaker characteristics
    this.tvSpeakerService
      .setCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.ACTIVE)
      .setCharacteristic(this.platform.Characteristic.VolumeControlType, this.platform.Characteristic.VolumeControlType.ABSOLUTE);

    // Register volume control handlers
    this.tvSpeakerService.getCharacteristic(this.platform.Characteristic.VolumeSelector)
      .onSet(this.setVolumeSelector.bind(this));

    this.tvSpeakerService.getCharacteristic(this.platform.Characteristic.Volume)
      .onGet(this.getVolume.bind(this))
      .onSet(this.setVolume.bind(this));

    // Link the speaker service to the TV service
    this.tvService.addLinkedService(this.tvSpeakerService);

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
      this.updateInputSources(presets);
      
      // Get the current preset ID
      this.currentPresetId = this.wledDevice.getActivePresetId();
      
      // If a preset is active, update the active identifier
      if (this.currentPresetId >= 0 && this.presetInputMap.has(this.currentPresetId)) {
        this.activeIdentifier = this.presetInputMap.get(this.currentPresetId) || 1;
        this.tvService.updateCharacteristic(
          this.platform.Characteristic.ActiveIdentifier,
          this.activeIdentifier
        );
      }
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
      const serviceId = `input-${presetId}`;
      
      // Map preset ID to input source ID and vice versa
      this.presetInputMap.set(presetId, inputId);
      this.inputPresetMap.set(inputId, presetId);
      
      // Remove from the existingInputServiceKeys set so we know not to remove it
      existingInputServiceKeys.delete(serviceId);
      
      // Check if we already have this input source service
      let inputService = this.inputServices.get(serviceId);
      
      if (!inputService) {
        // Create a new input source service
        inputService = this.accessory.addService(
          this.platform.Service.InputSource,
          serviceId,
          preset.name
        );
        
        // Add this input to our map
        this.inputServices.set(serviceId, inputService);
        
        // Link this service to the TV service
        this.tvService.addLinkedService(inputService);
      }
      
      // Set characteristics for this input source
      inputService
        .setCharacteristic(this.platform.Characteristic.Identifier, inputId)
        .setCharacteristic(this.platform.Characteristic.ConfiguredName, preset.name)
        .setCharacteristic(this.platform.Characteristic.IsConfigured, this.platform.Characteristic.IsConfigured.CONFIGURED)
        .setCharacteristic(this.platform.Characteristic.InputSourceType, this.platform.Characteristic.InputSourceType.APPLICATION)
        .setCharacteristic(this.platform.Characteristic.CurrentVisibilityState, this.platform.Characteristic.CurrentVisibilityState.SHOWN);
    }
    
    // Remove any input services that are no longer in the presets
    for (const serviceId of existingInputServiceKeys) {
      const service = this.inputServices.get(serviceId);
      if (service) {
        this.accessory.removeService(service);
        this.inputServices.delete(serviceId);
      }
    }
    
    // Update the maximum number of input sources for this TV
    if (nextInputId > 1) {
      // Only if we have at least one preset
      const maxPresets = nextInputId - 1;
      this.tvService.getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
        .setProps({
          maxValue: maxPresets,
          minValue: 1,
        });
    }
  }

  /**
   * Handle requests to get the current value of the "Active" characteristic
   */
  async getActive(): Promise<CharacteristicValue> {
    const state = this.wledDevice.getState();
    return state.on
      ? this.platform.Characteristic.Active.ACTIVE
      : this.platform.Characteristic.Active.INACTIVE;
  }

  /**
   * Handle requests to set the "Active" characteristic
   */
  async setActive(value: CharacteristicValue): Promise<void> {
    const newValue = value as number;
    const isActive = newValue === this.platform.Characteristic.Active.ACTIVE;
    
    await this.wledDevice.setPower(isActive);
    
    // If turning on and we have a valid activeIdentifier, activate the corresponding preset
    if (isActive && this.inputPresetMap.has(this.activeIdentifier)) {
      const presetId = this.inputPresetMap.get(this.activeIdentifier);
      if (presetId !== undefined && presetId !== this.currentPresetId) {
        await this.wledDevice.activatePreset(presetId);
        this.currentPresetId = presetId;
      }
    }
  }

  /**
   * Handle requests to get the current value of the "ActiveIdentifier" characteristic
   */
  async getActiveIdentifier(): Promise<CharacteristicValue> {
    const presetId = this.wledDevice.getActivePresetId();
    
    if (presetId >= 0 && this.presetInputMap.has(presetId)) {
      this.activeIdentifier = this.presetInputMap.get(presetId) || 1;
    }
    
    return this.activeIdentifier;
  }

  /**
   * Handle requests to set the "ActiveIdentifier" characteristic
   */
  async setActiveIdentifier(value: CharacteristicValue): Promise<void> {
    const inputId = value as number;
    
    if (this.inputPresetMap.has(inputId)) {
      const presetId = this.inputPresetMap.get(inputId);
      if (presetId !== undefined && presetId !== this.currentPresetId) {
        this.activeIdentifier = inputId;
        this.currentPresetId = presetId;
        await this.wledDevice.activatePreset(presetId);
      }
    }
  }

  /**
   * Handle requests to get the current value of the "Volume" characteristic
   */
  async getVolume(): Promise<CharacteristicValue> {
    const state = this.wledDevice.getState();
    return state.brightness;
  }

  /**
   * Handle requests to set the "Volume" characteristic
   */
  async setVolume(value: CharacteristicValue): Promise<void> {
    const brightness = value as number;
    await this.wledDevice.setBrightness(brightness);
  }

  /**
   * Handle requests to set the "VolumeSelector" characteristic
   */
  async setVolumeSelector(value: CharacteristicValue): Promise<void> {
    const state = this.wledDevice.getState();
    const currentBrightness = state.brightness;
    
    // VolumeSelector: INCREMENT = 0, DECREMENT = 1
    if (value === this.platform.Characteristic.VolumeSelector.INCREMENT) {
      // Increase by 10%
      const newBrightness = Math.min(100, currentBrightness + 10);
      await this.wledDevice.setBrightness(newBrightness);
    } else {
      // Decrease by 10%
      const newBrightness = Math.max(0, currentBrightness - 10);
      await this.wledDevice.setBrightness(newBrightness);
    }
  }
}