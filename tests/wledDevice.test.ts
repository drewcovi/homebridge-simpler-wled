import { WLEDDevice, WLEDState } from '../src/wledDevice';
import { MockLogger } from './mocks/homebridge';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import WebSocket from 'ws';

// Mock WebSocket
jest.mock('ws');

describe('WLEDDevice', () => {
  let mockAxios: MockAdapter;
  let mockLogger: MockLogger;
  let device: WLEDDevice;

  beforeEach(() => {
    mockAxios = new MockAdapter(axios);
    mockLogger = new MockLogger();

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    mockAxios.restore();
    if (device) {
      device.cleanup();
    }
  });

  describe('Constructor and Initialization', () => {
    it('should create a WLEDDevice instance', () => {
      device = new WLEDDevice(mockLogger, '192.168.1.100', 80, 10, false);
      expect(device).toBeInstanceOf(WLEDDevice);
    });

    it('should fetch device info on initialization', async () => {
      const infoResponse = {
        name: 'Test WLED',
        ver: '0.14.0',
        mac: '00:11:22:33:44:55',
        leds: {
          count: 100,
          segs: 1,
        },
      };

      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, infoResponse);

      device = new WLEDDevice(mockLogger, '192.168.1.100', 80, 10, false);

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 100));

      const deviceInfo = await device.getDeviceInfo();
      expect(deviceInfo.name).toBe('Test WLED');
      expect(deviceInfo.version).toBe('0.14.0');
      expect(deviceInfo.ledCount).toBe(100);
    });

    it('should start polling when WebSockets are disabled', async () => {
      const stateResponse = {
        on: true,
        bri: 128,
        seg: [{
          col: [[255, 0, 0]],
          fx: 0,
        }],
      };

      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, {});
      mockAxios.onGet('http://192.168.1.100:80/json/state').reply(200, stateResponse);

      device = new WLEDDevice(mockLogger, '192.168.1.100', 80, 1, false);

      // Wait for initial poll
      await new Promise(resolve => setTimeout(resolve, 200));

      const state = device.getState();
      expect(state.on).toBe(true);
      expect(state.brightness).toBe(50); // 128/255 * 100
    });
  });

  describe('State Management', () => {
    beforeEach(() => {
      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, {});
      device = new WLEDDevice(mockLogger, '192.168.1.100', 80, 10, false);
    });

    it('should get current state', () => {
      const state = device.getState();
      expect(state).toHaveProperty('on');
      expect(state).toHaveProperty('brightness');
      expect(state).toHaveProperty('hue');
      expect(state).toHaveProperty('saturation');
    });

    it('should notify listeners on state change', async () => {
      const listener = jest.fn();
      device.addStateListener(listener);

      const stateResponse = {
        on: true,
        bri: 255,
        seg: [{
          col: [[0, 255, 0]],
        }],
      };

      mockAxios.onGet('http://192.168.1.100:80/json/state').reply(200, stateResponse);

      // Trigger state update
      await (device as any).updateStateViaHTTP();

      expect(listener).toHaveBeenCalled();
      const calledState: WLEDState = listener.mock.calls[0][0];
      expect(calledState.on).toBe(true);
      expect(calledState.brightness).toBe(100);
    });

    it('should remove state listeners', () => {
      const listener = jest.fn();
      device.addStateListener(listener);
      device.removeStateListener(listener);

      // State change should not trigger the removed listener
      (device as any).notifyListeners();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Power Control', () => {
    beforeEach(() => {
      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, {});
      device = new WLEDDevice(mockLogger, '192.168.1.100', 80, 10, false);
    });

    it('should set power state on', async () => {
      mockAxios.onPost('http://192.168.1.100:80/json/state').reply(200);

      await device.setPower(true);

      const state = device.getState();
      expect(state.on).toBe(true);
    });

    it('should set power state off', async () => {
      mockAxios.onPost('http://192.168.1.100:80/json/state').reply(200);

      await device.setPower(false);

      const state = device.getState();
      expect(state.on).toBe(false);
    });

    it('should handle power control errors', async () => {
      mockAxios.onPost('http://192.168.1.100:80/json/state').reply(500);

      await expect(device.setPower(true)).rejects.toThrow();
    });
  });

  describe('Brightness Control', () => {
    beforeEach(() => {
      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, {});
      device = new WLEDDevice(mockLogger, '192.168.1.100', 80, 10, false);
    });

    it('should set brightness', async () => {
      mockAxios.onPost('http://192.168.1.100:80/json/state').reply(200);

      await device.setBrightness(75);

      const state = device.getState();
      expect(state.brightness).toBe(75);
    });

    it('should clamp brightness to valid range', async () => {
      mockAxios.onPost('http://192.168.1.100:80/json/state').reply(config => {
        const data = JSON.parse(config.data);
        expect(data.bri).toBeGreaterThanOrEqual(0);
        expect(data.bri).toBeLessThanOrEqual(255);
        return [200];
      });

      await device.setBrightness(150);
      await device.setBrightness(-10);
    });
  });

  describe('Color Control', () => {
    beforeEach(() => {
      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, {});
      device = new WLEDDevice(mockLogger, '192.168.1.100', 80, 10, false);
    });

    it('should set RGB color', async () => {
      mockAxios.onPost('http://192.168.1.100:80/json/state').reply(200);

      await device.setColor(255, 0, 0);

      const state = device.getState();
      expect(state.color.r).toBe(255);
      expect(state.color.g).toBe(0);
      expect(state.color.b).toBe(0);
    });

    it('should set HSV color', async () => {
      mockAxios.onPost('http://192.168.1.100:80/json/state').reply(200);

      await device.setHSV(120, 100, 100); // Green

      const state = device.getState();
      expect(state.hue).toBe(120);
      expect(state.saturation).toBe(100);
    });

    it('should convert RGB to HSV correctly', () => {
      // Test RGB to HSV conversion
      const rgbToHsv = (device as any).rgbToHsv.bind(device);

      // Red
      let hsv = rgbToHsv(255, 0, 0);
      expect(hsv.h).toBe(0);
      expect(hsv.s).toBe(100);

      // Green
      hsv = rgbToHsv(0, 255, 0);
      expect(hsv.h).toBe(120);
      expect(hsv.s).toBe(100);

      // Blue
      hsv = rgbToHsv(0, 0, 255);
      expect(hsv.h).toBe(240);
      expect(hsv.s).toBe(100);

      // White
      hsv = rgbToHsv(255, 255, 255);
      expect(hsv.s).toBe(0);
    });

    it('should convert HSV to RGB correctly', () => {
      // Test HSV to RGB conversion
      const hsvToRgb = (device as any).hsvToRgb.bind(device);

      // Red
      let rgb = hsvToRgb(0, 100, 100);
      expect(rgb.r).toBe(255);
      expect(rgb.g).toBe(0);
      expect(rgb.b).toBe(0);

      // Green
      rgb = hsvToRgb(120, 100, 100);
      expect(rgb.r).toBe(0);
      expect(rgb.g).toBe(255);
      expect(rgb.b).toBe(0);

      // Blue
      rgb = hsvToRgb(240, 100, 100);
      expect(rgb.r).toBe(0);
      expect(rgb.g).toBe(0);
      expect(rgb.b).toBe(255);
    });
  });

  describe('Preset Management', () => {
    beforeEach(() => {
      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, {});
      device = new WLEDDevice(mockLogger, '192.168.1.100', 80, 10, false);
    });

    it('should get presets', async () => {
      const presetsResponse = {
        '1': { n: 'Preset 1', ql: 'P1' },
        '2': { n: 'Preset 2', ql: 'P2' },
        '3': { n: 'Preset 3' },
      };

      mockAxios.onGet('http://192.168.1.100:80/presets.json').reply(200, presetsResponse);

      const presets = await device.getPresets();

      expect(Object.keys(presets)).toHaveLength(3);
      expect(presets['1'].name).toBe('P1 Preset 1');
      expect(presets['2'].name).toBe('P2 Preset 2');
      expect(presets['3'].name).toBe('Preset 3');
    });

    it('should handle missing presets gracefully', async () => {
      mockAxios.onGet('http://192.168.1.100:80/presets.json').reply(404);

      const presets = await device.getPresets();

      expect(Object.keys(presets)).toHaveLength(0);
    });

    it('should activate a preset', async () => {
      mockAxios.onPost('http://192.168.1.100:80/json/state').reply(200);
      mockAxios.onGet('http://192.168.1.100:80/json/state').reply(200, { ps: 1 });

      await device.activatePreset(1);

      expect(device.getActivePresetId()).toBe(1);
    });

    it('should notify preset listeners', async () => {
      const listener = jest.fn();
      device.addPresetListener(listener);

      const presetsResponse = {
        '1': { n: 'Preset 1' },
      };

      mockAxios.onGet('http://192.168.1.100:80/presets.json').reply(200, presetsResponse);

      await device.getPresets();

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('Segment Control', () => {
    beforeEach(() => {
      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, {});
      device = new WLEDDevice(mockLogger, '192.168.1.100', 80, 10, false);
    });

    it('should get segments', async () => {
      const stateResponse = {
        on: true,
        bri: 128,
        seg: [
          {
            id: 0,
            n: 'Segment 1',
            start: 0,
            stop: 50,
            col: [[255, 0, 0]],
            bri: 200,
            on: true,
            sel: true,
          },
          {
            id: 1,
            n: 'Segment 2',
            start: 50,
            stop: 100,
            col: [[0, 255, 0]],
            bri: 150,
            on: false,
            sel: false,
          },
        ],
      };

      mockAxios.onGet('http://192.168.1.100:80/json/state').reply(200, stateResponse);

      const segments = await device.getSegments();

      expect(segments).toHaveLength(2);
      expect(segments[0].name).toBe('Segment 1');
      expect(segments[0].length).toBe(50);
      expect(segments[1].name).toBe('Segment 2');
    });

    it('should set segment power', async () => {
      mockAxios.onPost('http://192.168.1.100:80/json/state').reply(200);

      await device.setSegmentPower(0, true);

      // Verify the request was made with correct payload
      expect(mockAxios.history.post.length).toBe(1);
      const data = JSON.parse(mockAxios.history.post[0].data);
      expect(data.seg.id).toBe(0);
      expect(data.seg.on).toBe(true);
    });

    it('should set segment brightness', async () => {
      mockAxios.onPost('http://192.168.1.100:80/json/state').reply(200);

      await device.setSegmentBrightness(0, 50);

      const data = JSON.parse(mockAxios.history.post[0].data);
      expect(data.seg.id).toBe(0);
      expect(data.seg.bri).toBe(128); // 50% of 255
    });

    it('should set segment color', async () => {
      mockAxios.onPost('http://192.168.1.100:80/json/state').reply(200);

      await device.setSegmentColor(0, 255, 128, 64);

      const data = JSON.parse(mockAxios.history.post[0].data);
      expect(data.seg.id).toBe(0);
      expect(data.seg.col).toEqual([[255, 128, 64]]);
    });
  });

  describe('Effects', () => {
    beforeEach(() => {
      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, {});
      device = new WLEDDevice(mockLogger, '192.168.1.100', 80, 10, false);
    });

    it('should get effects list', async () => {
      const effectsResponse = ['Solid', 'Blink', 'Rainbow', 'Fire'];

      mockAxios.onGet('http://192.168.1.100:80/json/effects').reply(200, effectsResponse);

      const effects = await device.getEffects();

      expect(effects).toEqual(effectsResponse);
      expect(effects).toHaveLength(4);
    });

    it('should set effect', async () => {
      mockAxios.onPost('http://192.168.1.100:80/json/state').reply(200);

      await device.setEffect(2);

      const state = device.getState();
      expect(state.effect).toBe(2);
    });

    it('should set segment effect', async () => {
      mockAxios.onPost('http://192.168.1.100:80/json/state').reply(200);

      await device.setSegmentEffect(0, 5);

      const data = JSON.parse(mockAxios.history.post[0].data);
      expect(data.seg.id).toBe(0);
      expect(data.seg.fx).toBe(5);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup resources', () => {
      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, {});
      device = new WLEDDevice(mockLogger, '192.168.1.100', 80, 1, false);

      const listener = jest.fn();
      device.addStateListener(listener);

      device.cleanup();

      // Verify cleanup
      (device as any).notifyListeners();
      expect(listener).not.toHaveBeenCalled();
    });

    it('should stop polling on cleanup', async () => {
      mockAxios.onGet('http://192.168.1.100:80/json/info').reply(200, {});
      mockAxios.onGet('http://192.168.1.100:80/json/state').reply(200, { on: true });

      device = new WLEDDevice(mockLogger, '192.168.1.100', 80, 1, false);

      await new Promise(resolve => setTimeout(resolve, 100));

      const requestsBefore = mockAxios.history.get.length;
      device.cleanup();

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Should not have made additional requests after cleanup
      expect(mockAxios.history.get.length).toBe(requestsBefore);
    });
  });
});
