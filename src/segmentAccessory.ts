import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { WLEDPlatform } from './platform';
import { WLEDDevice, WLEDState } from './wledDevice';

/**
 * Segment Accessory
 * An instance of this class is created for each WLED segment when segments are enabled
 */
export class WLEDSegmentAccessory {
  private lightService: Service;

  // State tracking properties
  private states = {
    on: false,
    brightness: 0,
    hue: 0,
    saturation: 0,
  };

  // State listener for device updates
  private stateListener = (state: WLEDState) => {
    this.updateStateFromDevice(state);
  }

  constructor(
    private readonly platform: WLEDPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly wledDevice: WLEDDevice,
    private readonly segmentIndex: number,
  ) {
    // Set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'WLED')
      .setCharacteristic(this.platform.Characteristic.Model, 'WLED Segment')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, `Segment-${segmentIndex}`);

    // Get or create the lightbulb service for this segment
    this.lightService = this.accessory.getService(this.platform.Service.Lightbulb) ||
      this.accessory.addService(this.platform.Service.Lightbulb);

    // Set service name
    this.lightService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // Register handlers for required characteristics
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

    // Register for state updates from the device
    this.wledDevice.addStateListener(this.stateListener);

    // Get the current segment state
    const segmentState = this.wledDevice.getSegmentState(this.segmentIndex);
    if (segmentState) {
      this.updateStateFromDevice(segmentState);
    }
  }

  /**
   * Update accessory state from device state
   */
  private updateStateFromDevice(state: WLEDState): void {
    // First try to get the segment-specific state
    const segmentState = this.wledDevice.getSegmentState(this.segmentIndex);
    
    // If we have segment-specific state, use it
    if (segmentState) {
      state = segmentState;
    }

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
  }

  /**
   * Handle "GET" requests from HomeKit
   */
  async getOn(): Promise<CharacteristicValue> {
    const segmentState = this.wledDevice.getSegmentState(this.segmentIndex);
    if (segmentState) {
      this.states.on = segmentState.on;
      return segmentState.on;
    }
    return this.states.on;
  }

  /**
   * Handle "SET" requests from HomeKit
   */
  async setOn(value: CharacteristicValue): Promise<void> {
    const newValue = value as boolean;
    
    if (this.states.on !== newValue) {
      this.states.on = newValue;
      await this.wledDevice.setSegmentPower(this.segmentIndex, newValue);
    }
  }

  /**
   * Handle "GET" requests from HomeKit
   */
  async getBrightness(): Promise<CharacteristicValue> {
    const segmentState = this.wledDevice.getSegmentState(this.segmentIndex);
    if (segmentState) {
      this.states.brightness = segmentState.brightness;
      return segmentState.brightness;
    }
    return this.states.brightness;
  }

  /**
   * Handle "SET" requests from HomeKit
   */
  async setBrightness(value: CharacteristicValue): Promise<void> {
    const newValue = value as number;
    
    if (this.states.brightness !== newValue) {
      this.states.brightness = newValue;
      await this.wledDevice.setSegmentBrightness(this.segmentIndex, newValue);
    }
  }

  /**
   * Handle "GET" requests from HomeKit
   */
  async getHue(): Promise<CharacteristicValue> {
    const segmentState = this.wledDevice.getSegmentState(this.segmentIndex);
    if (segmentState) {
      this.states.hue = segmentState.hue;
      return segmentState.hue;
    }
    return this.states.hue;
  }

  /**
   * Handle "SET" requests from HomeKit
   */
  async setHue(value: CharacteristicValue): Promise<void> {
    const newValue = value as number;
    
    if (this.states.hue !== newValue) {
      this.states.hue = newValue;
      // When setting hue, we need to send the complete HSV values
      await this.wledDevice.setSegmentHSV(this.segmentIndex, newValue, this.states.saturation, this.states.brightness);
    }
  }

  /**
   * Handle "GET" requests from HomeKit
   */
  async getSaturation(): Promise<CharacteristicValue> {
    const segmentState = this.wledDevice.getSegmentState(this.segmentIndex);
    if (segmentState) {
      this.states.saturation = segmentState.saturation;
      return segmentState.saturation;
    }
    return this.states.saturation;
  }

  /**
   * Handle "SET" requests from HomeKit
   */
  async setSaturation(value: CharacteristicValue): Promise<void> {
    const newValue = value as number;
    
    if (this.states.saturation !== newValue) {
      this.states.saturation = newValue;
      // When setting saturation, we need to send the complete HSV values
      await this.wledDevice.setSegmentHSV(this.segmentIndex, this.states.hue, newValue, this.states.brightness);
    }
  }
}