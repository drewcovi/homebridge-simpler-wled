import { WLEDPlatform } from '../src/platform';
import { WLEDDiscoveryService } from '../src/discoveryService';
import { MockLogger, MockAPI, createMockPlatformConfig, createMockDeviceConfig } from './mocks/homebridge';

// Mock dependencies
jest.mock('../src/wledDevice');
jest.mock('../src/discoveryService');
jest.mock('../src/platformAccessory');
jest.mock('../src/presetsAccessory');

describe('WLEDPlatform', () => {
  let mockLogger: MockLogger;
  let mockApi: MockAPI;
  let platform: WLEDPlatform;

  beforeEach(() => {
    mockLogger = new MockLogger();
    mockApi = new MockAPI();
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should create platform instance', () => {
      const config = createMockPlatformConfig();
      platform = new WLEDPlatform(mockLogger, config, mockApi as any);

      expect(platform).toBeInstanceOf(WLEDPlatform);
    });

    it('should initialize discovery service', () => {
      const config = createMockPlatformConfig();
      platform = new WLEDPlatform(mockLogger, config, mockApi as any);

      expect(WLEDDiscoveryService).toHaveBeenCalledWith(mockLogger);
    });

    it('should register didFinishLaunching callback', () => {
      const config = createMockPlatformConfig();
      const onSpy = jest.spyOn(mockApi, 'on');
      platform = new WLEDPlatform(mockLogger, config, mockApi as any);

      expect(onSpy).toHaveBeenCalledWith('didFinishLaunching', expect.any(Function));
    });

    it('should initialize with empty accessories', () => {
      const config = createMockPlatformConfig();
      platform = new WLEDPlatform(mockLogger, config, mockApi as any);

      expect(platform.accessories).toEqual([]);
    });

    it('should handle empty configuration gracefully', () => {
      const config = createMockPlatformConfig({ devices: [] });
      platform = new WLEDPlatform(mockLogger, config, mockApi as any);

      mockApi.emit('didFinishLaunching');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No WLED devices configured')
      );
      expect(platform.wledDevices.size).toBe(0);
    });
  });

  describe('Device Discovery', () => {
    it('should discover manually configured devices', () => {
      const device1 = createMockDeviceConfig({ name: 'Device 1', host: '192.168.1.100' });
      const device2 = createMockDeviceConfig({ name: 'Device 2', host: '192.168.1.101' });

      const config = createMockPlatformConfig({
        devices: [device1, device2],
      });

      platform = new WLEDPlatform(mockLogger, config, mockApi as any);

      // Trigger didFinishLaunching
      mockApi.emit('didFinishLaunching');

      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should skip disabled devices', () => {
      const device = createMockDeviceConfig({
        name: 'Disabled Device',
        host: '192.168.1.100',
        enabled: false,
      });

      const config = createMockPlatformConfig({
        devices: [device],
      });

      platform = new WLEDPlatform(mockLogger, config, mockApi as any);
      mockApi.emit('didFinishLaunching');

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Skipping disabled device'));
    });

    it('should skip devices with missing required fields', () => {
      const invalidDevice = { name: 'Invalid' }; // Missing host

      const config = createMockPlatformConfig({
        devices: [invalidDevice],
      });

      platform = new WLEDPlatform(mockLogger, config, mockApi as any);
      mockApi.emit('didFinishLaunching');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('missing required fields'),
        expect.any(Object)
      );
    });
  });

  describe('Display Name Formatting', () => {
    it('should format hostname to title case', () => {
      const config = createMockPlatformConfig();
      platform = new WLEDPlatform(mockLogger, config, mockApi as any);

      const displayName = (platform as any).getDisplayNameFromHost('holiday-lights.local', 'Fallback');
      expect(displayName).toBe('Holiday Lights');
    });

    it('should use fallback for IP addresses', () => {
      const config = createMockPlatformConfig();
      platform = new WLEDPlatform(mockLogger, config, mockApi as any);

      const displayName = (platform as any).getDisplayNameFromHost('192.168.1.100', 'My WLED');
      expect(displayName).toBe('My WLED');
    });

    it('should remove .local suffix', () => {
      const config = createMockPlatformConfig();
      platform = new WLEDPlatform(mockLogger, config, mockApi as any);

      const displayName = (platform as any).getDisplayNameFromHost('bedroom-lights.local', 'Fallback');
      expect(displayName).toBe('Bedroom Lights');
    });

    it('should handle single word hostnames', () => {
      const config = createMockPlatformConfig();
      platform = new WLEDPlatform(mockLogger, config, mockApi as any);

      const displayName = (platform as any).getDisplayNameFromHost('wled.local', 'Fallback');
      expect(displayName).toBe('Wled');
    });
  });

  describe('Accessory Management', () => {
    it('should register new accessory', () => {
      const device = createMockDeviceConfig({ name: 'New Device', host: '192.168.1.100' });

      const config = createMockPlatformConfig({
        devices: [device],
      });

      platform = new WLEDPlatform(mockLogger, config, mockApi as any);
      mockApi.emit('didFinishLaunching');

      expect(mockApi.registerPlatformAccessories).toHaveBeenCalled();
    });

    it('should restore cached accessory', () => {
      const device = createMockDeviceConfig({ name: 'Cached Device', host: '192.168.1.100' });

      const config = createMockPlatformConfig({
        devices: [device],
      });

      platform = new WLEDPlatform(mockLogger, config, mockApi as any);

      // Simulate cached light accessory
      const mockAccessory = new mockApi.platformAccessory('Cached Device', 'uuid-192.168.1.100:light');
      mockAccessory.context.device = device;

      platform.configureAccessory(mockAccessory as any);

      mockApi.emit('didFinishLaunching');

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Restoring existing light accessory'), expect.anything());
      expect(mockApi.updatePlatformAccessories).toHaveBeenCalled();
    });

    it('should unregister removed accessories', () => {
      const device = createMockDeviceConfig({ name: 'Device', host: '192.168.1.100' });

      const config = createMockPlatformConfig({
        devices: [],
      });

      platform = new WLEDPlatform(mockLogger, config, mockApi as any);

      // Simulate cached accessory that is no longer in config
      const mockAccessory = new mockApi.platformAccessory('Device', 'uuid-192.168.1.100');
      mockAccessory.context.device = device;

      platform.configureAccessory(mockAccessory as any);

      mockApi.emit('didFinishLaunching');

      expect(mockApi.unregisterPlatformAccessories).toHaveBeenCalled();
    });
  });

  describe('Preset Configuration Changes', () => {
    it('should re-register accessory when enabled presets change', () => {
      const device = createMockDeviceConfig({
        name: 'Device',
        host: '192.168.1.100',
        deviceSettings: {
          enabledPresets: ['1', '2'],
        },
      });

      const config = createMockPlatformConfig({
        devices: [device],
      });

      platform = new WLEDPlatform(mockLogger, config, mockApi as any);

      // Simulate cached TV accessory with different presets
      const mockAccessory = new mockApi.platformAccessory('Device', 'uuid-192.168.1.100:tv');
      mockAccessory.context.device = {
        ...device,
        deviceSettings: {
          enabledPresets: ['1', '3'], // Different presets
        },
      };

      platform.configureAccessory(mockAccessory as any);

      mockApi.emit('didFinishLaunching');

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Enabled presets changed'));
      expect(mockApi.unregisterPlatformAccessories).toHaveBeenCalled();
      expect(mockApi.registerPlatformAccessories).toHaveBeenCalled();
    });

    it('should not re-register accessory when presets unchanged', () => {
      const device = createMockDeviceConfig({
        name: 'Device',
        host: '192.168.1.100',
        deviceSettings: {
          enabledPresets: ['1', '2'],
        },
      });

      const config = createMockPlatformConfig({
        devices: [device],
      });

      platform = new WLEDPlatform(mockLogger, config, mockApi as any);

      // Simulate cached TV accessory with same presets
      const mockAccessory = new mockApi.platformAccessory('Device', 'uuid-192.168.1.100:tv');
      mockAccessory.context.device = device;

      platform.configureAccessory(mockAccessory as any);

      mockApi.emit('didFinishLaunching');

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Restoring existing TV accessory'), expect.anything());
      expect(mockApi.unregisterPlatformAccessories).not.toHaveBeenCalled();
    });
  });

  describe('Config Structure Support', () => {
    it('should support flat config structure', () => {
      const config = createMockPlatformConfig({
        devices: [createMockDeviceConfig()],
        defaultPollInterval: 5,
        defaultUseWebSockets: false,
      });

      platform = new WLEDPlatform(mockLogger, config, mockApi as any);
      mockApi.emit('didFinishLaunching');

      expect(platform).toBeDefined();
    });

    it('should support nested config structure', () => {
      const config = createMockPlatformConfig({
        manualDevicesSection: {
          devices: [createMockDeviceConfig()],
        },
        defaultSettingsSection: {
          defaultPollInterval: 5,
          defaultUseWebSockets: false,
        },
      });

      platform = new WLEDPlatform(mockLogger, config, mockApi as any);
      mockApi.emit('didFinishLaunching');

      expect(platform).toBeDefined();
    });
  });

  describe('Discovery Listener', () => {
    it('should register discovery listener', () => {
      const config = createMockPlatformConfig();
      platform = new WLEDPlatform(mockLogger, config, mockApi as any);

      const mockDiscoveryService = (platform as any).discoveryService as jest.Mocked<WLEDDiscoveryService>;

      mockApi.emit('didFinishLaunching');

      expect(mockDiscoveryService.addDiscoveryListener).toHaveBeenCalled();
    });

    it('should handle discovered devices', () => {
      const config = createMockPlatformConfig();
      platform = new WLEDPlatform(mockLogger, config, mockApi as any);

      const mockDiscoveryService = (platform as any).discoveryService as jest.Mocked<WLEDDiscoveryService>;

      mockApi.emit('didFinishLaunching');

      const discoveryListener = mockDiscoveryService.addDiscoveryListener.mock.calls[0][0];

      const discoveredDevices = [
        {
          name: 'Discovered WLED',
          host: '192.168.1.150',
          port: 80,
          id: 'abc123',
          discoveryMethod: 'mdns' as const,
        },
      ];

      discoveryListener(discoveredDevices);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Discovered 1 WLED devices'));
    });

    it('should skip discovered devices already in config', () => {
      const device = createMockDeviceConfig({ name: 'Device', host: '192.168.1.100' });

      const config = createMockPlatformConfig({
        devices: [device],
      });

      platform = new WLEDPlatform(mockLogger, config, mockApi as any);

      const mockDiscoveryService = (platform as any).discoveryService as jest.Mocked<WLEDDiscoveryService>;

      mockApi.emit('didFinishLaunching');

      const discoveryListener = mockDiscoveryService.addDiscoveryListener.mock.calls[0][0];

      const discoveredDevices = [
        {
          name: 'Device',
          host: '192.168.1.100',
          port: 80,
          id: 'abc123',
          discoveryMethod: 'mdns' as const,
        },
      ];

      discoveryListener(discoveredDevices);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('already manually configured')
      );
    });
  });

  describe('Device Settings', () => {
    it('should apply device-specific settings', () => {
      const device = createMockDeviceConfig({
        name: 'Device',
        host: '192.168.1.100',
        deviceSettings: {
          pollInterval: 15,
          useWebSockets: false,
        },
      });

      const config = createMockPlatformConfig({
        devices: [device],
      });

      platform = new WLEDPlatform(mockLogger, config, mockApi as any);
      mockApi.emit('didFinishLaunching');

      expect(platform.wledDevices.size).toBe(1);
    });

    it('should use default settings when device settings not specified', () => {
      const device = {
        name: 'Device',
        host: '192.168.1.100',
        port: 80,
      };

      const config = createMockPlatformConfig({
        devices: [device],
        defaultPollInterval: 20,
        defaultUseWebSockets: true,
      });

      platform = new WLEDPlatform(mockLogger, config, mockApi as any);
      mockApi.emit('didFinishLaunching');

      expect(platform.wledDevices.size).toBe(1);
    });
  });

  describe('UUID Generation', () => {
    it('should generate consistent UUID for same host', () => {
      const device = createMockDeviceConfig({ name: 'Device', host: '192.168.1.100' });

      const config = createMockPlatformConfig({
        devices: [device],
      });

      platform = new WLEDPlatform(mockLogger, config, mockApi as any);
      mockApi.emit('didFinishLaunching');

      expect(mockApi.hap.uuid.generate).toHaveBeenCalledWith('192.168.1.100:light');
      expect(mockApi.hap.uuid.generate).toHaveBeenCalledWith('192.168.1.100:tv');
    });
  });
});
