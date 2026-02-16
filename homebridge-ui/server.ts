import { HomebridgePluginUiServer, RequestError } from '@homebridge/plugin-ui-utils';

// Define interfaces to avoid importing from src
interface DiscoveredWLEDDevice {
  name: string;
  host: string;
  port: number;
  id: string;
  discoveryMethod: 'mdns' | 'ssdp' | 'direct';
  info?: {
    version: string;
    macAddress: string;
    ledCount: number;
  };
}

/**
 * Custom UI Server for discovering and managing WLED devices
 */
class PluginUiServer extends HomebridgePluginUiServer {
  private discoveryService: any;
  private discoveredDevices: DiscoveredWLEDDevice[] = [];
  private isDiscovering = false;
  private isInitialized = false;

  constructor() {
    super();

    // Setup request handlers
    this.onRequest('/test', async () => {
      return { status: 'ok', message: 'Test endpoint works!' };
    });

    this.onRequest('/discover', this.handleDiscover.bind(this));
    this.onRequest('/devices', this.handleGetDevices.bind(this));
    this.onRequest('/stop-discovery', this.handleStopDiscovery.bind(this));
    this.onRequest('/cached-accessories', this.handleGetCachedAccessories.bind(this));

    // Start the UI server immediately - don't wait for discovery service
    process.nextTick(() => {
      this.ready();
    });

    // Initialize discovery service in background (non-blocking)
    this.initializeDiscoveryService().then(() => {
      this.isInitialized = true;
    }).catch((error) => {
      console.error('[UI Server] Failed to initialize discovery service:', error);
    });
  }

  /**
   * Initialize the discovery service by loading it from the compiled dist
   */
  private async initializeDiscoveryService() {
    try {
      // Import the compiled discovery service
      const { WLEDDiscoveryService } = require('../discoveryService');

      // Create a simple logger for the discovery service
      const logger = {
        info: (...args: any[]) => console.log('[Discovery]', ...args),
        warn: (...args: any[]) => console.warn('[Discovery]', ...args),
        error: (...args: any[]) => console.error('[Discovery]', ...args),
        debug: (...args: any[]) => {}, // Suppress debug logs
        log: (...args: any[]) => console.log('[Discovery]', ...args),
        success: (...args: any[]) => console.log('[Discovery Success]', ...args),
      };

      // Initialize the discovery service (but don't start it yet)
      this.discoveryService = new WLEDDiscoveryService(logger);

      // Register discovery listener
      this.discoveryService.addDiscoveryListener((devices: DiscoveredWLEDDevice[]) => {
        this.discoveredDevices = devices;
        // Push update to connected clients
        this.pushEvent('discoveredDevices', devices);
      });
    } catch (error) {
      console.error('[UI Server] Failed to initialize discovery service:', error);
      throw error;
    }
  }

  /**
   * Handle a request to start device discovery
   */
  async handleDiscover() {
    if (!this.isInitialized || !this.discoveryService) {
      return {
        status: 'error',
        message: 'Discovery service not initialized. Please wait a moment and try again.',
        devices: [],
      };
    }

    if (this.isDiscovering) {
      return {
        status: 'already_running',
        devices: this.discoveredDevices,
      };
    }

    try {
      // Clear any previous devices to show fresh results
      this.discoveredDevices = [];
      this.discoveryService.clearDiscoveredDevices();

      this.isDiscovering = true;
      this.discoveryService.startDiscovery();

      // Set a timer to mark discovery as complete after reasonable discovery time
      // Increased to 70s to allow for synchronous device checking (60s discovery + 10s buffer)
      setTimeout(() => {
        this.isDiscovering = false;
        if (this.discoveryService) {
          this.discoveryService.stopDiscovery();
        }
      }, 70000);

      // Return immediately - frontend will poll for updates
      return {
        status: 'started',
        devices: this.discoveredDevices,
      };
    } catch (error: any) {
      this.isDiscovering = false;
      console.error('[UI Server] Error starting discovery:', error);
      return {
        status: 'error',
        message: error.message || 'Failed to start discovery',
        devices: [],
      };
    }
  }

  /**
   * Handle a request to get discovered devices
   */
  async handleGetDevices() {
    return {
      devices: this.discoveredDevices,
      isDiscovering: this.isDiscovering,
    };
  }

  /**
   * Handle a request to stop discovery
   */
  async handleStopDiscovery() {
    if (!this.discoveryService) {
      throw new Error('Discovery service not initialized');
    }

    this.discoveryService.stopDiscovery();
    this.isDiscovering = false;

    return {
      status: 'stopped',
      devices: this.discoveredDevices,
    };
  }

  /**
   * Handle a request to get cached accessories from Homebridge
   */
  async handleGetCachedAccessories() {
    try {
      const fs = require('fs');
      const path = require('path');

      // Get the Homebridge storage path
      const storagePath = this.homebridgeStoragePath;
      const cachedAccessoriesPath = path.join(storagePath, 'accessories', 'cachedAccessories');

      if (!fs.existsSync(cachedAccessoriesPath)) {
        return { accessories: [] };
      }

      // Read the cached accessories file
      const cachedData = JSON.parse(fs.readFileSync(cachedAccessoriesPath, 'utf8'));

      // Filter for WLED plugin accessories
      const wledAccessories = cachedData.filter((accessory: any) =>
        accessory.plugin === 'homebridge-wled-ts' ||
        accessory.platform === 'WLED'
      );

      // Extract relevant device information
      const devices = wledAccessories.map((accessory: any) => ({
        name: accessory.displayName || accessory.context?.device?.name || 'Unknown',
        host: accessory.context?.device?.host || 'Unknown',
        port: accessory.context?.device?.port || 80,
        uuid: accessory.UUID,
        useSegments: accessory.context?.device?.useSegments || false,
        usePresetService: accessory.context?.device?.usePresetService !== false,
        useWebSockets: accessory.context?.device?.useWebSockets !== false,
        pollInterval: accessory.context?.device?.pollInterval || 10,
      }));

      return { accessories: devices };
    } catch (error: any) {
      console.error('[UI Server] Error reading cached accessories:', error);
      return {
        accessories: [],
        error: error.message,
      };
    }
  }
}

// Export the server for Homebridge Config UI X
// Instantiate at module level (this is what works with Config UI X)
const serverInstance = new PluginUiServer();

export default serverInstance;
module.exports = serverInstance;
