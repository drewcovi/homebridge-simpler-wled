import { WLEDAccessory } from '../src/platformAccessory';
import { WLEDDevice, WLEDState } from '../src/wledDevice';
import { MockLogger, MockAPI, MockPlatformAccessory, createMockPlatformConfig } from './mocks/homebridge';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

// Mock WLEDDevice
jest.mock('../src/wledDevice');

describe('WLEDAccessory', () => {
  let mockAxios: MockAdapter;
  let mockLogger: MockLogger;
  let mockApi: MockAPI;
  let mockAccessory: MockPlatformAccessory;
  let mockWledDevice: jest.Mocked<WLEDDevice>;
  let platform: any;
  let accessory: WLEDAccessory;

  beforeEach(() => {
    mockAxios = new MockAdapter(axios);
    mockLogger = new MockLogger();
    mockApi = new MockAPI();

    // Create mock platform
    platform = {
      log: mockLogger,
      config: createMockPlatformConfig(),
      api: mockApi,
      Service: mockApi.hap.Service,
      Characteristic: mockApi.hap.Characteristic,
    };

    // Create mock accessory
    mockAccessory = new MockPlatformAccessory('Test WLED', 'test-uuid', mockApi.hap.Categories.TELEVISION);
    mockAccessory.context.device = {
      name: 'Test WLED',
      host: '192.168.1.100',
      port: 80,
    };

    // Create mock WLED device
    const initialState: WLEDState = {
      on: false,
      brightness: 0,
      colorMode: 'rgb',
      color: { r: 0, g: 0, b: 0 },
      hue: 0,
      saturation: 0,
      colorTemperature: 140,
      effect: 0,
      presetId: -1,
    };

    mockWledDevice = {
      getState: jest.fn(() => initialState),
      getActivePresetId: jest.fn(() => -1),
      addStateListener: jest.fn(),
      addPresetListener: jest.fn(),
      removeStateListener: jest.fn(),
      removePresetListener: jest.fn(),
      setPower: jest.fn().mockResolvedValue(undefined),
      setBrightness: jest.fn().mockResolvedValue(undefined),
      setHSV: jest.fn().mockResolvedValue(undefined),
      getPresets: jest.fn().mockResolvedValue({}),
      activatePreset: jest.fn().mockResolvedValue(undefined),
      cleanup: jest.fn(),
    } as any;

    jest.clearAllMocks();
  });

  afterEach(() => {
    mockAxios.restore();
  });

  describe('Initialization', () => {
    it('should create accessory with lightbulb service', () => {
      accessory = new WLEDAccessory(platform, mockAccessory as any, mockWledDevice);

      const lightService = mockAccessory.getService(mockApi.hap.Service.Lightbulb.UUID);
      expect(lightService).toBeDefined();
    });

    it('should create accessory with television service for presets', () => {
      accessory = new WLEDAccessory(platform, mockAccessory as any, mockWledDevice);

      const tvService = mockAccessory.getService(mockApi.hap.Service.Television.UUID);
      expect(tvService).toBeDefined();
    });

    it('should set accessory information', () => {
      accessory = new WLEDAccessory(platform, mockAccessory as any, mockWledDevice);

      const infoService = mockAccessory.getService(mockApi.hap.Service.AccessoryInformation.UUID);
      expect(infoService).toBeDefined();
    });

    it('should register state listener', () => {
      accessory = new WLEDAccessory(platform, mockAccessory as any, mockWledDevice);

      expect(mockWledDevice.addStateListener).toHaveBeenCalled();
    });

    it('should register preset listener', () => {
      accessory = new WLEDAccessory(platform, mockAccessory as any, mockWledDevice);

      expect(mockWledDevice.addPresetListener).toHaveBeenCalled();
    });

    it('should fetch presets on initialization', () => {
      accessory = new WLEDAccessory(platform, mockAccessory as any, mockWledDevice);

      expect(mockWledDevice.getPresets).toHaveBeenCalled();
    });
  });

  describe('Power Control', () => {
    beforeEach(() => {
      accessory = new WLEDAccessory(platform, mockAccessory as any, mockWledDevice);
    });

    it('should get power state', async () => {
      mockWledDevice.getState.mockReturnValue({
        on: true,
        brightness: 50,
        colorMode: 'rgb',
        color: { r: 0, g: 0, b: 0 },
        hue: 0,
        saturation: 0,
        colorTemperature: 140,
        effect: 0,
        presetId: -1,
      });

      const on = await (accessory as any).getOn();
      expect(on).toBe(true);
    });

    it('should set power state on', async () => {
      await (accessory as any).setOn(true);

      expect(mockWledDevice.setPower).toHaveBeenCalledWith(true);
    });

    it('should set power state off', async () => {
      await (accessory as any).setOn(false);

      expect(mockWledDevice.setPower).toHaveBeenCalledWith(false);
    });

    it('should not call setPower if state unchanged', async () => {
      await (accessory as any).setOn(false);
      mockWledDevice.setPower.mockClear();

      await (accessory as any).setOn(false);
      expect(mockWledDevice.setPower).not.toHaveBeenCalled();
    });
  });

  describe('Brightness Control', () => {
    beforeEach(() => {
      accessory = new WLEDAccessory(platform, mockAccessory as any, mockWledDevice);
    });

    it('should get brightness', async () => {
      mockWledDevice.getState.mockReturnValue({
        on: true,
        brightness: 75,
        colorMode: 'rgb',
        color: { r: 0, g: 0, b: 0 },
        hue: 0,
        saturation: 0,
        colorTemperature: 140,
        effect: 0,
        presetId: -1,
      });

      const brightness = await (accessory as any).getBrightness();
      expect(brightness).toBe(75);
    });

    it('should set brightness', async () => {
      await (accessory as any).setBrightness(80);

      expect(mockWledDevice.setBrightness).toHaveBeenCalledWith(80);
    });

    it('should not call setBrightness if value unchanged', async () => {
      await (accessory as any).setBrightness(50);
      mockWledDevice.setBrightness.mockClear();

      await (accessory as any).setBrightness(50);
      expect(mockWledDevice.setBrightness).not.toHaveBeenCalled();
    });
  });

  describe('Color Control', () => {
    beforeEach(() => {
      accessory = new WLEDAccessory(platform, mockAccessory as any, mockWledDevice);
    });

    it('should get hue', async () => {
      mockWledDevice.getState.mockReturnValue({
        on: true,
        brightness: 100,
        colorMode: 'hsv',
        color: { r: 255, g: 0, b: 0 },
        hue: 120,
        saturation: 100,
        colorTemperature: 140,
        effect: 0,
        presetId: -1,
      });

      const hue = await (accessory as any).getHue();
      expect(hue).toBe(120);
    });

    it('should set hue', async () => {
      // Set initial saturation
      (accessory as any).states.saturation = 50;
      (accessory as any).states.brightness = 75;

      await (accessory as any).setHue(180);

      expect(mockWledDevice.setHSV).toHaveBeenCalledWith(180, 50, 75);
    });

    it('should get saturation', async () => {
      mockWledDevice.getState.mockReturnValue({
        on: true,
        brightness: 100,
        colorMode: 'hsv',
        color: { r: 255, g: 0, b: 0 },
        hue: 120,
        saturation: 75,
        colorTemperature: 140,
        effect: 0,
        presetId: -1,
      });

      const saturation = await (accessory as any).getSaturation();
      expect(saturation).toBe(75);
    });

    it('should set saturation', async () => {
      // Set initial hue
      (accessory as any).states.hue = 240;
      (accessory as any).states.brightness = 80;

      await (accessory as any).setSaturation(90);

      expect(mockWledDevice.setHSV).toHaveBeenCalledWith(240, 90, 80);
    });
  });

  describe('Television Service', () => {
    beforeEach(() => {
      accessory = new WLEDAccessory(platform, mockAccessory as any, mockWledDevice);
    });

    it('should get TV active state', async () => {
      mockWledDevice.getState.mockReturnValue({
        on: true,
        brightness: 100,
        colorMode: 'rgb',
        color: { r: 0, g: 0, b: 0 },
        hue: 0,
        saturation: 0,
        colorTemperature: 140,
        effect: 0,
        presetId: -1,
      });

      const active = await (accessory as any).getTVActive();
      expect(active).toBe(mockApi.hap.Characteristic.Active.ACTIVE);
    });

    it('should set TV active state', async () => {
      await (accessory as any).setTVActive(mockApi.hap.Characteristic.Active.ACTIVE);

      expect(mockWledDevice.setPower).toHaveBeenCalledWith(true);
    });

    it('should set TV inactive state', async () => {
      await (accessory as any).setTVActive(mockApi.hap.Characteristic.Active.INACTIVE);

      expect(mockWledDevice.setPower).toHaveBeenCalledWith(false);
    });

    it('should handle remote key without error', async () => {
      await expect((accessory as any).setRemoteKey(1)).resolves.not.toThrow();
    });
  });

  describe('Preset Management', () => {
    beforeEach(() => {
      const presets = {
        '1': { name: 'Preset 1', data: { n: 'Preset 1', ql: 'P1' } },
        '2': { name: 'Preset 2', data: { n: 'Preset 2', ql: 'P2' } },
        '3': { name: 'Preset 3', data: { n: 'Preset 3' } },
      };

      mockWledDevice.getPresets.mockResolvedValue(presets);
      accessory = new WLEDAccessory(platform, mockAccessory as any, mockWledDevice);
    });

    it('should create input sources for presets', async () => {
      // Wait for preset initialization
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify input sources were created
      const tvService = mockAccessory.getService(mockApi.hap.Service.Television.UUID);
      expect(tvService).toBeDefined();
    });

    it('should activate preset', async () => {
      // Wait for preset initialization
      await new Promise(resolve => setTimeout(resolve, 100));

      // Simulate preset activation
      const presetListener = mockWledDevice.addPresetListener.mock.calls[0][0];
      await presetListener({
        '1': { name: 'Preset 1', data: { n: 'Preset 1', ql: 'P1' } },
      });

      // Activate preset
      await mockWledDevice.activatePreset(1);

      expect(mockWledDevice.activatePreset).toHaveBeenCalledWith(1);
    });

    it('should filter presets by enabledPresets config', async () => {
      mockAccessory.context.device.deviceSettings = {
        enabledPresets: ['1', '3'],
      };

      const presets = {
        '1': { name: 'Preset 1', data: { n: 'Preset 1', ql: 'P1' } },
        '2': { name: 'Preset 2', data: { n: 'Preset 2', ql: 'P2' } },
        '3': { name: 'Preset 3', data: { n: 'Preset 3' } },
      };

      mockWledDevice.getPresets.mockResolvedValue(presets);

      accessory = new WLEDAccessory(platform, mockAccessory as any, mockWledDevice);

      // Wait for preset initialization
      await new Promise(resolve => setTimeout(resolve, 100));

      // Presets should be filtered
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Skipping preset 2'));
    });
  });

  describe('State Updates', () => {
    beforeEach(() => {
      accessory = new WLEDAccessory(platform, mockAccessory as any, mockWledDevice);
    });

    it('should update state when device state changes', () => {
      const stateListener = mockWledDevice.addStateListener.mock.calls[0][0];

      const newState: WLEDState = {
        on: true,
        brightness: 80,
        colorMode: 'hsv',
        color: { r: 255, g: 0, b: 0 },
        hue: 120,
        saturation: 100,
        colorTemperature: 140,
        effect: 0,
        presetId: 1,
      };

      stateListener(newState);

      // Verify internal state was updated
      expect((accessory as any).states.on).toBe(true);
      expect((accessory as any).states.brightness).toBe(80);
      expect((accessory as any).states.hue).toBe(120);
      expect((accessory as any).states.saturation).toBe(100);
    });

    it('should update preset when active preset changes', () => {
      mockWledDevice.getActivePresetId.mockReturnValue(2);

      const stateListener = mockWledDevice.addStateListener.mock.calls[0][0];

      const newState: WLEDState = {
        on: true,
        brightness: 100,
        colorMode: 'rgb',
        color: { r: 0, g: 255, b: 0 },
        hue: 120,
        saturation: 100,
        colorTemperature: 140,
        effect: 0,
        presetId: 2,
      };

      stateListener(newState);

      expect((accessory as any).currentActiveInput).toBe(2);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      accessory = new WLEDAccessory(platform, mockAccessory as any, mockWledDevice);
    });

    it('should handle preset fetch errors gracefully', async () => {
      mockWledDevice.getPresets.mockRejectedValue(new Error('Network error'));

      accessory = new WLEDAccessory(platform, mockAccessory as any, mockWledDevice);

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize presets:',
        expect.any(Error)
      );
    });
  });
});
