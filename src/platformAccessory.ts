import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { WLEDPlatform } from './platform';
import { WLEDDevice, WLEDState } from './wledDevice';

/**
 * Unified WLED Accessory
 * Creates a single accessory with two services:
 * - Lightbulb service for main power and dimming control
 * - Television service for preset selection as inputs
 */
export class WLEDAccessory {
  private lightService: Service;
  private presetsService: Service;
  private inputServices: Service[] = [];

  // State tracking properties
  private states = {
    on: false,
    brightness: 0,
    hue: 0,
    saturation: 0,
  };

  // Preset tracking
  private presetInputMap: Map<number, number> = new Map();
  private inputPresetMap: Map<number, number> = new Map();
  private currentActiveInput = 0;

  // State listener for device updates
  private stateListener = (state: WLEDState) => {
    this.updateStateFromDevice(state);
  };

  // Preset listener
  private presetListener = (presets: Record<string, { name: string; data: any }>) => {
    this.updateInputSources(presets);
  };

  constructor(
    private readonly platform: WLEDPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly wledDevice: WLEDDevice,
  ) {
    // Set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'WLED')
      .setCharacteristic(this.platform.Characteristic.Model, 'WLED Controller')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');

    // Create the Television service first (primary service for TELEVISION category)
    this.presetsService = this.accessory.getService(this.platform.Service.Television) ||
      this.accessory.addService(this.platform.Service.Television);

    this.presetsService
      .setCharacteristic(this.platform.Characteristic.ConfiguredName, accessory.context.device.name)
      .setCharacteristic(this.platform.Characteristic.SleepDiscoveryMode,
        this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

    // Set up TV control handlers
    this.presetsService.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(this.getTVActive.bind(this))
      .onSet(this.setTVActive.bind(this));

    // Configure remote control (we'll keep it simple - no remote control needed)
    this.presetsService.getCharacteristic(this.platform.Characteristic.RemoteKey)
      .onSet(this.setRemoteKey.bind(this));

    // Get or create the light service
    this.lightService = this.accessory.getService(this.platform.Service.Lightbulb) ||
      this.accessory.addService(this.platform.Service.Lightbulb);

    // Set service name
    this.lightService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name + ' Light');

    // Register handlers for lightbulb characteristics
    this.lightService.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.getOn.bind(this))
      .onSet(this.setOn.bind(this));

    this.lightService.getCharacteristic(this.platform.Characteristic.Brightness)
      .onGet(this.getBrightness.bind(this))
      .onSet(this.setBrightness.bind(this));

    this.lightService.getCharacteristic(this.platform.Characteristic.Hue)
      .onGet(this.getHue.bind(this))
      .onSet(this.setHue.bind(this));

    this.lightService.getCharacteristic(this.platform.Characteristic.Saturation)
      .onGet(this.getSaturation.bind(this))
      .onSet(this.setSaturation.bind(this));

    // Link the lightbulb service to the TV service so they appear together
    this.presetsService.addLinkedService(this.lightService);

    // Register for state updates from the device
    this.wledDevice.addStateListener(this.stateListener);
    this.wledDevice.addPresetListener(this.presetListener);

    // Initialize presets
    this.initializePresets();

    // Get the current state from the device
    const currentState = this.wledDevice.getState();
    this.updateStateFromDevice(currentState);
  }

  /**
   * Initialize presets by fetching them from the device
   */
  private async initializePresets(): Promise<void> {
    try {
      this.platform.log.debug('Fetching presets from WLED device...');
      const presets = await this.wledDevice.getPresets();

      this.platform.log.debug(`Presets response received: ${JSON.stringify(presets)}`);
      this.platform.log.debug(`Number of presets found: ${Object.keys(presets).length}`);

      if (Object.keys(presets).length === 0) {
        this.platform.log.warn('No presets configured on WLED device - presets object is empty');
        return;
      }

      this.updateInputSources(presets);
    } catch (error) {
      this.platform.log.error('Failed to initialize presets:', error);
    }
  }

  /**
   * Update input sources based on available presets
   */
  private updateInputSources(presets: Record<string, { name: string; data: any }>): void {
    // this.platform.log.debug(`Discovered presets: ${JSON.stringify(presets, null, 2)}`);

    // Clear existing mappings
    this.presetInputMap.clear();
    this.inputPresetMap.clear();

    // Remove all existing input services
    for (const inputService of this.inputServices) {
      this.presetsService.removeLinkedService(inputService);
      this.accessory.removeService(inputService);
    }
    this.inputServices = [];

    // Create input source for each preset
    for (const [presetIdStr, preset] of Object.entries(presets)) {
      this.platform.log.info(`[DEBUG] Processing preset - presetIdStr: "${presetIdStr}"`);

      const presetId = parseInt(presetIdStr, 10);
      this.platform.log.info(`[DEBUG] Parsed presetId: ${presetId} (isNaN: ${isNaN(presetId)})`);

      if (isNaN(presetId)) {
        this.platform.log.warn(`[DEBUG] Skipping preset with non-numeric ID: "${presetIdStr}"`);
        continue; // Skip non-numeric preset IDs
      }

      // this.platform.log.info(`[DEBUG] Preset object: ${JSON.stringify(preset)}`);
      this.platform.log.info(`[DEBUG] Preset data.n: "${preset.data?.n}", data.ql: "${preset.data?.ql}"`);

      // Map preset ID for later reference
      this.presetInputMap.set(presetId, presetId);
      this.inputPresetMap.set(presetId, presetId);

      const serviceName = `Preset ${presetId}`;

      // Construct label using ql (quick label) and n (name) from preset data
      const n = preset.data?.n || `Preset ${presetId}`;
      const ql = preset.data?.ql || '';
      const label = (ql ? `${ql} ` : '') + `${n}`;

      this.platform.log.info(`[DEBUG] Creating preset - ID: ${presetId}, serviceName: "${serviceName}", label: "${label}" (ql: "${ql}", n: "${n}"`);

      // Create a new InputSource service for this preset
      const inputService = this.accessory.getService(serviceName) ||
        this.accessory.addService(this.platform.Service.InputSource, label, label);

      inputService
        .setCharacteristic(this.platform.Characteristic.Identifier, presetId)
        .setCharacteristic(this.platform.Characteristic.ConfiguredName, label)
        .setCharacteristic(this.platform.Characteristic.IsConfigured, this.platform.Characteristic.IsConfigured.CONFIGURED)
        .setCharacteristic(this.platform.Characteristic.InputSourceType,
          this.platform.Characteristic.InputSourceType.HDMI);

      inputService.subtype = serviceName;

      // Link this input to the TV service
      this.presetsService.addLinkedService(inputService);
      this.inputServices.push(inputService);
    }

    // Set up the ActiveIdentifier handler after all inputs are created
    this.presetsService
      .getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .onGet(async () => {
        const activePresetId = this.wledDevice.getActivePresetId();
        // Return 0 if no preset is active (HomeKit doesn't accept negative values)
        return activePresetId > 0 ? activePresetId : 0;
      })
      .onSet(async (value: CharacteristicValue) => {
        const presetId = value as number;
        this.platform.log.info(`[DEBUG] ActiveIdentifier set to: ${presetId}`);
        if (this.presetInputMap.has(presetId)) {
          this.currentActiveInput = presetId;
          await this.wledDevice.activatePreset(presetId);
        } else {
          this.platform.log.warn(`[DEBUG] Preset ID ${presetId} not found in presetInputMap`);
        }
      });

    const createdPresets = Array.from(this.presetInputMap.keys()).join(', ');
    this.platform.log.debug(`Created ${this.inputServices.length} preset inputs for ${this.accessory.displayName}: [${createdPresets}]`);
  }

  /**
   * Update accessory state from device state
   */
  private updateStateFromDevice(state: WLEDState): void {
    // Save current state
    this.states.on = state.on;
    this.states.brightness = state.brightness;
    this.states.hue = state.hue;
    this.states.saturation = state.saturation;

    // Update the HomeKit characteristics
    this.lightService.updateCharacteristic(this.platform.Characteristic.On, state.on);
    this.lightService.updateCharacteristic(this.platform.Characteristic.Brightness, state.brightness);
    this.lightService.updateCharacteristic(this.platform.Characteristic.Hue, state.hue);
    this.lightService.updateCharacteristic(this.platform.Characteristic.Saturation, state.saturation);

    // Update TV active state based on power state
    this.presetsService.updateCharacteristic(
      this.platform.Characteristic.Active,
      state.on ? this.platform.Characteristic.Active.ACTIVE : this.platform.Characteristic.Active.INACTIVE,
    );

    // Update active preset if it changed
    const activePresetId = this.wledDevice.getActivePresetId();
    if (activePresetId > 0 && this.presetInputMap.has(activePresetId)) {
      if (activePresetId !== this.currentActiveInput) {
        this.currentActiveInput = activePresetId;
        this.platform.log.debug(`Updating ActiveIdentifier to: ${activePresetId}`);
        this.presetsService.updateCharacteristic(this.platform.Characteristic.ActiveIdentifier, activePresetId);
      }
    } else if (activePresetId <= 0) {
      // No preset is active, set to 0 (or first available preset)
      this.platform.log.debug('No active preset, setting ActiveIdentifier to 0');
      this.presetsService.updateCharacteristic(this.platform.Characteristic.ActiveIdentifier, 0);
    }
  }

  // ======================
  // Lightbulb Service Handlers
  // ======================

  async getOn(): Promise<CharacteristicValue> {
    const state = this.wledDevice.getState();
    this.states.on = state.on;
    return state.on;
  }

  async setOn(value: CharacteristicValue): Promise<void> {
    const newValue = value as boolean;

    if (this.states.on !== newValue) {
      this.states.on = newValue;
      await this.wledDevice.setPower(newValue);
    }
  }

  async getBrightness(): Promise<CharacteristicValue> {
    const state = this.wledDevice.getState();
    this.states.brightness = state.brightness;
    return state.brightness;
  }

  async setBrightness(value: CharacteristicValue): Promise<void> {
    const newValue = value as number;

    if (this.states.brightness !== newValue) {
      this.states.brightness = newValue;
      await this.wledDevice.setBrightness(newValue);
    }
  }

  async getHue(): Promise<CharacteristicValue> {
    const state = this.wledDevice.getState();
    this.states.hue = state.hue;
    return state.hue;
  }

  async setHue(value: CharacteristicValue): Promise<void> {
    const newValue = value as number;

    if (this.states.hue !== newValue) {
      this.states.hue = newValue;
      await this.wledDevice.setHSV(newValue, this.states.saturation, this.states.brightness);
    }
  }

  async getSaturation(): Promise<CharacteristicValue> {
    const state = this.wledDevice.getState();
    this.states.saturation = state.saturation;
    return state.saturation;
  }

  async setSaturation(value: CharacteristicValue): Promise<void> {
    const newValue = value as number;

    if (this.states.saturation !== newValue) {
      this.states.saturation = newValue;
      await this.wledDevice.setHSV(this.states.hue, newValue, this.states.brightness);
    }
  }

  // ======================
  // Television Service Handlers
  // ======================

  async getTVActive(): Promise<CharacteristicValue> {
    const state = this.wledDevice.getState();
    return state.on
      ? this.platform.Characteristic.Active.ACTIVE
      : this.platform.Characteristic.Active.INACTIVE;
  }

  async setTVActive(value: CharacteristicValue): Promise<void> {
    const isActive = value === this.platform.Characteristic.Active.ACTIVE;
    await this.wledDevice.setPower(isActive);
  }

  async setRemoteKey(value: CharacteristicValue): Promise<void> {
    // We don't need to handle remote key presses for this use case
    // But we need to provide a handler to avoid errors
  }
}
