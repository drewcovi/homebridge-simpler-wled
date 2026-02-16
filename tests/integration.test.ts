/**
 * Integration tests for the complete WLED platform
 */

import { WLEDPlatform } from '../src/platform';
import { WLEDDevice } from '../src/wledDevice';
import { MockLogger, MockAPI, createMockPlatformConfig, createMockDeviceConfig } from './mocks/homebridge';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

// Mock WebSocket
jest.mock('ws');

describe('Integration Tests', () => {
  let mockAxios: MockAdapter;
  let mockLogger: MockLogger;
  let mockApi: MockAPI;

  beforeEach(() => {
    mockAxios = new MockAdapter(axios);
    mockLogger = new MockLogger();
    mockApi = new MockAPI();
    jest.clearAllMocks();
  });

  afterEach(() => {
    mockAxios.restore();
  });

  describe('End-to-End Device Lifecycle', () => {
    it('should initialize platform and add device', async () => {
      const device = createMockDeviceConfig({
        name: 'Living Room WLED',
        host: '192.168.1.100',
        port: 80,
      });

      const config = createMockPlatformConfig({
        devices: [device],
      });

      // Mock WLED device responses
      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, {
        name: 'Living Room WLED',
        ver: '0.14.0',
        mac: '00:11:22:33:44:55',
        leds: {
          count: 100,
          segs: 1,
        },
      });

      mockAxios.onGet('http://192.168.1.100:80/json/state').reply(200, {
        on: true,
        bri: 128,
        seg: [{
          col: [[255, 0, 0]],
          fx: 0,
        }],
      });

      mockAxios.onGet('http://192.168.1.100:80/presets.json').reply(200, {
        '1': { n: 'Preset 1', ql: 'P1' },
      });

      const platform = new WLEDPlatform(mockLogger, config, mockApi as any);

      // Trigger platform initialization
      mockApi.emit('didFinishLaunching');

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify platform initialized correctly
      expect(platform.wledDevices.size).toBe(1);
      expect(mockApi.registerPlatformAccessories).toHaveBeenCalled();
    });

    it('should handle multiple devices', async () => {
      const devices = [
        createMockDeviceConfig({ name: 'Device 1', host: '192.168.1.100' }),
        createMockDeviceConfig({ name: 'Device 2', host: '192.168.1.101' }),
        createMockDeviceConfig({ name: 'Device 3', host: '192.168.1.102' }),
      ];

      const config = createMockPlatformConfig({ devices });

      // Mock responses for all devices
      devices.forEach(device => {
        mockAxios.onGet(`http://${device.host}:80/json/info`).reply(200, {
          name: device.name,
          ver: '0.14.0',
          mac: `00:11:22:33:44:${devices.indexOf(device)}`,
          leds: { count: 100, segs: 1 },
        });

        mockAxios.onGet(`http://${device.host}:80/json/state`).reply(200, {
          on: false,
          bri: 0,
          seg: [{ col: [[0, 0, 0]], fx: 0 }],
        });

        mockAxios.onGet(`http://${device.host}:80/presets.json`).reply(200, {});
      });

      const platform = new WLEDPlatform(mockLogger, config, mockApi as any);
      mockApi.emit('didFinishLaunching');

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(platform.wledDevices.size).toBe(3);
    });
  });

  describe('Device State Synchronization', () => {
    it('should sync state from WLED device to HomeKit', async () => {
      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, {
        name: 'Test WLED',
        ver: '0.14.0',
        mac: '00:11:22:33:44:55',
        leds: { count: 100, segs: 1 },
      });

      const stateResponse = {
        on: true,
        bri: 200,
        seg: [{
          col: [[0, 255, 0]],
          fx: 0,
        }],
      };

      mockAxios.onGet('http://192.168.1.100:80/json/state').reply(200, stateResponse);

      const device = new WLEDDevice(mockLogger, '192.168.1.100', 80, 10, false);

      // Wait for initial state fetch
      await new Promise(resolve => setTimeout(resolve, 200));

      const state = device.getState();

      expect(state.on).toBe(true);
      expect(state.brightness).toBeCloseTo(78, 0); // 200/255 * 100
      expect(state.color.g).toBe(255);

      device.cleanup();
    });

    it('should update HomeKit when WLED state changes', async () => {
      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, {
        name: 'Test WLED',
        ver: '0.14.0',
        mac: '00:11:22:33:44:55',
        leds: { count: 100, segs: 1 },
      });

      // Initial state
      mockAxios.onGet('http://192.168.1.100:80/json/state').replyOnce(200, {
        on: false,
        bri: 0,
        seg: [{ col: [[0, 0, 0]], fx: 0 }],
      });

      const device = new WLEDDevice(mockLogger, '192.168.1.100', 80, 10, false);

      const stateListener = jest.fn();
      device.addStateListener(stateListener);

      // Updated state
      mockAxios.onGet('http://192.168.1.100:80/json/state').replyOnce(200, {
        on: true,
        bri: 255,
        seg: [{ col: [[255, 255, 255]], fx: 0 }],
      });

      // Trigger state update
      await (device as any).updateStateViaHTTP();

      expect(stateListener).toHaveBeenCalled();
      const newState = stateListener.mock.calls[0][0];
      expect(newState.on).toBe(true);
      expect(newState.brightness).toBe(100);

      device.cleanup();
    });
  });

  describe('Error Recovery', () => {
    it('should handle device offline gracefully', async () => {
      mockAxios.onGet('http://192.168.1.100:80/json/info').networkError();

      const device = createMockDeviceConfig({
        name: 'Offline Device',
        host: '192.168.1.100',
      });

      const config = createMockPlatformConfig({ devices: [device] });

      const platform = new WLEDPlatform(mockLogger, config, mockApi as any);
      mockApi.emit('didFinishLaunching');

      await new Promise(resolve => setTimeout(resolve, 200));

      // Platform should still initialize even with offline device
      expect(platform).toBeDefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should continue working with partial device failures', async () => {
      const devices = [
        createMockDeviceConfig({ name: 'Working Device', host: '192.168.1.100' }),
        createMockDeviceConfig({ name: 'Failed Device', host: '192.168.1.101' }),
      ];

      const config = createMockPlatformConfig({ devices });

      // Working device
      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, {
        name: 'Working Device',
        ver: '0.14.0',
        mac: '00:11:22:33:44:55',
        leds: { count: 100, segs: 1 },
      });

      mockAxios.onGet('http://192.168.1.100:80/json/state').reply(200, {
        on: true,
        bri: 128,
        seg: [{ col: [[255, 0, 0]], fx: 0 }],
      });

      mockAxios.onGet('http://192.168.1.100:80/presets.json').reply(200, {});

      // Failed device
      mockAxios.onGet('http://192.168.1.101:80/json/info').networkError();

      const platform = new WLEDPlatform(mockLogger, config, mockApi as any);
      mockApi.emit('didFinishLaunching');

      await new Promise(resolve => setTimeout(resolve, 200));

      // One device should still work
      expect(platform.wledDevices.size).toBe(2);
    });
  });

  describe('Preset Management Flow', () => {
    it('should load and activate presets', async () => {
      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, {
        name: 'Test WLED',
        ver: '0.14.0',
        mac: '00:11:22:33:44:55',
        leds: { count: 100, segs: 1 },
      });

      mockAxios.onGet('http://192.168.1.100:80/presets.json').reply(200, {
        '1': { n: 'Sunrise', ql: 'SR' },
        '2': { n: 'Party', ql: 'PT' },
        '3': { n: 'Relax', ql: 'RX' },
      });

      mockAxios.onPost('http://192.168.1.100:80/json/state').reply(200);
      mockAxios.onGet('http://192.168.1.100:80/json/state').reply(200, {
        on: true,
        bri: 255,
        ps: 1,
        seg: [{ col: [[255, 128, 0]], fx: 0 }],
      });

      const device = new WLEDDevice(mockLogger, '192.168.1.100', 80, 10, false);

      // Load presets
      const presets = await device.getPresets();

      expect(Object.keys(presets)).toHaveLength(3);
      expect(presets['1'].name).toBe('SR Sunrise');
      expect(presets['2'].name).toBe('PT Party');

      // Activate preset
      await device.activatePreset(2);

      expect(device.getActivePresetId()).toBe(2);

      device.cleanup();
    });
  });

  describe('Color Control Flow', () => {
    it('should set color and update state', async () => {
      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, {
        name: 'Test WLED',
        ver: '0.14.0',
        mac: '00:11:22:33:44:55',
        leds: { count: 100, segs: 1 },
      });

      mockAxios.onPost('http://192.168.1.100:80/json/state').reply(200);

      const device = new WLEDDevice(mockLogger, '192.168.1.100', 80, 10, false);

      // Set RGB color
      await device.setColor(255, 0, 128);

      const state = device.getState();
      expect(state.color.r).toBe(255);
      expect(state.color.g).toBe(0);
      expect(state.color.b).toBe(128);

      // Verify HSV conversion
      expect(state.hue).toBeGreaterThan(0);
      expect(state.saturation).toBeGreaterThan(0);

      device.cleanup();
    });
  });
});
