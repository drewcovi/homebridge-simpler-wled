import { WLEDDiscoveryService, DiscoveredWLEDDevice } from '../src/discoveryService';
import { MockLogger } from './mocks/homebridge';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

// Mock dnssd
jest.mock('dnssd', () => ({
  tcp: jest.fn(() => 'wled'),
  Browser: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    on: jest.fn(),
  })),
}));

// Mock dgram
jest.mock('dgram', () => ({
  createSocket: jest.fn(() => ({
    on: jest.fn(),
    bind: jest.fn((callback: () => void) => callback()),
    setBroadcast: jest.fn(),
    send: jest.fn((buffer: Buffer, port: number, address: string, callback: (err?: Error) => void) => {
      callback();
    }),
    close: jest.fn(),
  })),
}));

describe('WLEDDiscoveryService', () => {
  let mockAxios: MockAdapter;
  let mockLogger: MockLogger;
  let discoveryService: WLEDDiscoveryService;

  beforeEach(() => {
    mockAxios = new MockAdapter(axios);
    mockLogger = new MockLogger();
    discoveryService = new WLEDDiscoveryService(mockLogger);
    jest.clearAllMocks();
  });

  afterEach(() => {
    mockAxios.restore();
    discoveryService.stopDiscovery();
  });

  describe('Initialization', () => {
    it('should create a WLEDDiscoveryService instance', () => {
      expect(discoveryService).toBeInstanceOf(WLEDDiscoveryService);
    });

    it('should initialize with empty discovered devices', () => {
      const devices = discoveryService.getDiscoveredDevices();
      expect(devices).toEqual([]);
    });
  });

  describe('Discovery Lifecycle', () => {
    it('should start discovery', () => {
      discoveryService.startDiscovery();
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Starting WLED device discovery'));
    });

    it('should not start discovery if already running', () => {
      discoveryService.startDiscovery();
      mockLogger.info.mockClear();

      discoveryService.startDiscovery();
      expect(mockLogger.debug).toHaveBeenCalledWith('Discovery already running');
    });

    it('should stop discovery', () => {
      discoveryService.startDiscovery();
      discoveryService.stopDiscovery();

      // Verify cleanup occurred
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('Device Checking', () => {
    it('should identify WLED device correctly', async () => {
      const wledInfo = {
        name: 'Test WLED',
        ver: '0.14.0',
        mac: '00:11:22:33:44:55',
        brand: 'WLED',
        leds: {
          count: 100,
        },
      };

      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, wledInfo);

      const device = await discoveryService.addDeviceByHost('192.168.1.100', 80);

      expect(device).toBeDefined();
      expect(device?.name).toBe('Test WLED');
      expect(device?.host).toBe('192.168.1.100');
      expect(device?.port).toBe(80);
      expect(device?.discoveryMethod).toBe('direct');
    });

    it('should return null for non-WLED device', async () => {
      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(404);

      const device = await discoveryService.addDeviceByHost('192.168.1.100', 80);

      expect(device).toBeNull();
    });

    it('should handle connection timeout', async () => {
      mockAxios.onGet('http://192.168.1.100:80/json/info').timeout();

      const device = await discoveryService.addDeviceByHost('192.168.1.100', 80);

      expect(device).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle connection refused', async () => {
      mockAxios.onGet('http://192.168.1.100:80/json/info').networkError();

      const device = await discoveryService.addDeviceByHost('192.168.1.100', 80);

      expect(device).toBeNull();
    });
  });

  describe('Device Management', () => {
    it('should add discovered device', async () => {
      const wledInfo = {
        name: 'Test WLED',
        ver: '0.14.0',
        mac: '001122334455',
        leds: { count: 100 },
      };

      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, wledInfo);

      await discoveryService.addDeviceByHost('192.168.1.100', 80);

      const devices = discoveryService.getDiscoveredDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0].name).toBe('Test WLED');
    });

    it('should not add duplicate devices', async () => {
      const wledInfo = {
        name: 'Test WLED',
        ver: '0.14.0',
        mac: '001122334455',
        leds: { count: 100 },
      };

      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, wledInfo);

      await discoveryService.addDeviceByHost('192.168.1.100', 80);
      await discoveryService.addDeviceByHost('192.168.1.100', 80);

      const devices = discoveryService.getDiscoveredDevices();
      expect(devices).toHaveLength(1);
    });

    it('should clear discovered devices', async () => {
      const wledInfo = {
        name: 'Test WLED',
        ver: '0.14.0',
        mac: '001122334455',
        leds: { count: 100 },
      };

      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, wledInfo);

      await discoveryService.addDeviceByHost('192.168.1.100', 80);
      expect(discoveryService.getDiscoveredDevices()).toHaveLength(1);

      discoveryService.clearDiscoveredDevices();
      expect(discoveryService.getDiscoveredDevices()).toHaveLength(0);
    });
  });

  describe('Discovery Listeners', () => {
    it('should notify listeners when device is discovered', async () => {
      const listener = jest.fn();
      discoveryService.addDiscoveryListener(listener);

      const wledInfo = {
        name: 'Test WLED',
        ver: '0.14.0',
        mac: '001122334455',
        leds: { count: 100 },
      };

      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, wledInfo);

      await discoveryService.addDeviceByHost('192.168.1.100', 80);

      expect(listener).toHaveBeenCalled();
      const devices: DiscoveredWLEDDevice[] = listener.mock.calls[listener.mock.calls.length - 1][0];
      expect(devices).toHaveLength(1);
      expect(devices[0].name).toBe('Test WLED');
    });

    it('should immediately notify listener with existing devices', async () => {
      const wledInfo = {
        name: 'Test WLED',
        ver: '0.14.0',
        mac: '001122334455',
        leds: { count: 100 },
      };

      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, wledInfo);

      await discoveryService.addDeviceByHost('192.168.1.100', 80);

      const listener = jest.fn();
      discoveryService.addDiscoveryListener(listener);

      expect(listener).toHaveBeenCalled();
      const devices: DiscoveredWLEDDevice[] = listener.mock.calls[0][0];
      expect(devices).toHaveLength(1);
    });

    it('should remove listeners', async () => {
      const listener = jest.fn();
      discoveryService.addDiscoveryListener(listener);
      discoveryService.removeDiscoveryListener(listener);

      const wledInfo = {
        name: 'Test WLED',
        ver: '0.14.0',
        mac: '001122334455',
        leds: { count: 100 },
      };

      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, wledInfo);

      await discoveryService.addDeviceByHost('192.168.1.100', 80);

      // Listener should have been called once during addDiscoveryListener (immediate notification)
      // but not again after device was added
      expect(listener).toHaveBeenCalledTimes(0);
    });

    it('should notify all listeners', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();

      discoveryService.addDiscoveryListener(listener1);
      discoveryService.addDiscoveryListener(listener2);
      discoveryService.addDiscoveryListener(listener3);

      const wledInfo = {
        name: 'Test WLED',
        ver: '0.14.0',
        mac: '001122334455',
        leds: { count: 100 },
      };

      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, wledInfo);

      await discoveryService.addDeviceByHost('192.168.1.100', 80);

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
      expect(listener3).toHaveBeenCalled();
    });
  });

  describe('Device Info Enrichment', () => {
    it('should include device info in discovered device', async () => {
      const wledInfo = {
        name: 'Test WLED',
        ver: '0.14.0',
        mac: '00:11:22:33:44:55',
        leds: {
          count: 150,
        },
      };

      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, wledInfo);

      const device = await discoveryService.addDeviceByHost('192.168.1.100', 80);

      expect(device?.info).toBeDefined();
      expect(device?.info?.version).toBe('0.14.0');
      expect(device?.info?.macAddress).toBe('00:11:22:33:44:55');
      expect(device?.info?.ledCount).toBe(150);
    });
  });

  describe('Error Handling', () => {
    it('should handle listener errors gracefully', async () => {
      const failingListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const workingListener = jest.fn();

      discoveryService.addDiscoveryListener(failingListener);
      discoveryService.addDiscoveryListener(workingListener);

      const wledInfo = {
        name: 'Test WLED',
        ver: '0.14.0',
        mac: '001122334455',
        leds: { count: 100 },
      };

      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, wledInfo);

      await discoveryService.addDeviceByHost('192.168.1.100', 80);

      // Both listeners should be called despite error in first
      expect(failingListener).toHaveBeenCalled();
      expect(workingListener).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
