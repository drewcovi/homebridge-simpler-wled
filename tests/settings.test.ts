import { PLATFORM_NAME, PLUGIN_NAME } from '../src/settings';

describe('Settings', () => {
  describe('Constants', () => {
    it('should export PLATFORM_NAME', () => {
      expect(PLATFORM_NAME).toBeDefined();
      expect(typeof PLATFORM_NAME).toBe('string');
      expect(PLATFORM_NAME).toBe('Simpler WLED');
    });

    it('should export PLUGIN_NAME', () => {
      expect(PLUGIN_NAME).toBeDefined();
      expect(typeof PLUGIN_NAME).toBe('string');
      expect(PLUGIN_NAME).toBe('homebridge-simpler-wled');
    });

    it('should not be empty strings', () => {
      expect(PLATFORM_NAME.length).toBeGreaterThan(0);
      expect(PLUGIN_NAME.length).toBeGreaterThan(0);
    });
  });
});
