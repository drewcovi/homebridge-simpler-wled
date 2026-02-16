import { HomebridgePluginUiServer, RequestError } from '@homebridge/plugin-ui-utils';

// Top-level log to verify module is loaded
console.log('[UI Server] ===== SERVER MODULE LOADED =====');
console.log('[UI Server] Module load time:', new Date().toISOString());

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
    console.log('[UI Server] ===== Constructor started =====');

    // Setup request handlers
    console.log('[UI Server] Registering request handlers...');

    // Test endpoint
    this.onRequest('/test', async () => {
      console.log('[UI Server] ===== TEST ENDPOINT CALLED =====');
      return { status: 'ok', message: 'Test endpoint works!' };
    });
    console.log('[UI Server] Registered /test');

    this.onRequest('/discover', this.handleDiscover.bind(this));
    console.log('[UI Server] Registered /discover');
    this.onRequest('/devices', this.handleGetDevices.bind(this));
    console.log('[UI Server] Registered /devices');
    this.onRequest('/stop-discovery', this.handleStopDiscovery.bind(this));
    console.log('[UI Server] Registered /stop-discovery');
    this.onRequest('/cached-accessories', this.handleGetCachedAccessories.bind(this));
    console.log('[UI Server] Registered /cached-accessories');

    // Start the UI server immediately - don't wait for discovery service
    console.log('[UI Server] Calling ready()...');
    this.ready();
    console.log('[UI Server] UI server is ready');

    // Initialize discovery service in background (non-blocking)
    this.initializeDiscoveryService().then(() => {
      this.isInitialized = true;
      console.log('[UI Server] Discovery service initialized successfully');
    }).catch((error) => {
      console.error('[UI Server] Failed to initialize discovery service:', error);
      console.log('[UI Server] UI will still work, but discovery features may be limited');
    });
  }

  /**
   * Initialize the discovery service by loading it from the compiled dist
   */
  private async initializeDiscoveryService() {
    try {
      console.log('[UI Server] Loading discovery service...');

      // Import the compiled discovery service
      const { WLEDDiscoveryService } = require('../discoveryService');

      console.log('[UI Server] Discovery service module loaded');

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

      console.log('[UI Server] Discovery service instance created');

      // Register discovery listener
      this.discoveryService.addDiscoveryListener((devices: DiscoveredWLEDDevice[]) => {
        console.log(`[UI Server] Discovery update received: ${devices.length} devices found`);
        console.log(`[UI Server] Devices:`, JSON.stringify(devices, null, 2));
        this.discoveredDevices = devices;
        // Push update to connected clients
        this.pushEvent('discoveredDevices', devices);
      });

      console.log('[UI Server] Discovery listener registered');

      // Test that the discovery service methods are available
      console.log('[UI Server] Discovery service methods:', {
        hasStartDiscovery: typeof this.discoveryService.startDiscovery === 'function',
        hasStopDiscovery: typeof this.discoveryService.stopDiscovery === 'function',
        hasGetDiscoveredDevices: typeof this.discoveryService.getDiscoveredDevices === 'function',
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
    console.log('[UI Server] ===== handleDiscover CALLED =====');
    console.log('[UI Server] Discovery request received. Initialized:', this.isInitialized, 'Service:', !!this.discoveryService);

    if (!this.isInitialized || !this.discoveryService) {
      console.error('[UI Server] Discovery service not ready');
      return {
        status: 'error',
        message: 'Discovery service not initialized. Please wait a moment and try again.',
        devices: [],
      };
    }

    if (this.isDiscovering) {
      console.log('[UI Server] Discovery already running');
      return {
        status: 'already_running',
        devices: this.discoveredDevices,
      };
    }

    try {
      // Clear any previous devices to show fresh results
      console.log('[UI Server] Clearing previous devices and starting discovery');
      this.discoveredDevices = [];
      this.discoveryService.clearDiscoveredDevices();

      this.isDiscovering = true;
      this.discoveryService.startDiscovery();

      // Set a timer to mark discovery as complete after reasonable discovery time
      // Increased to 70s to allow for synchronous device checking (60s discovery + 10s buffer)
      setTimeout(() => {
        console.log('[UI Server] Discovery time limit reached, stopping');
        this.isDiscovering = false;
        if (this.discoveryService) {
          this.discoveryService.stopDiscovery();
        }
      }, 70000);

      // Return immediately - frontend will poll for updates
      console.log('[UI Server] Discovery started successfully');
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
    console.log('[UI Server] ===== handleGetDevices CALLED =====');
    console.log(`[UI Server] Devices requested. Discovered: ${this.discoveredDevices.length}, Discovering: ${this.isDiscovering}`);
    const result = {
      devices: this.discoveredDevices,
      isDiscovering: this.isDiscovering,
    };
    console.log('[UI Server] Returning:', result);
    return result;
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
    console.log('[UI Server] ===== handleGetCachedAccessories CALLED =====');
    console.log('[UI Server] handleGetCachedAccessories called');
    try {
      const fs = require('fs');
      const path = require('path');

      console.log('[UI Server] Required fs and path modules');

      // Get the Homebridge storage path
      const storagePath = this.homebridgeStoragePath;
      console.log('[UI Server] Storage path:', storagePath);

      const cachedAccessoriesPath = path.join(storagePath, 'accessories', 'cachedAccessories');

      console.log('[UI Server] Looking for cached accessories at:', cachedAccessoriesPath);

      if (!fs.existsSync(cachedAccessoriesPath)) {
        console.log('[UI Server] No cached accessories file found');
        return { accessories: [] };
      }

      // Read the cached accessories file
      const cachedData = JSON.parse(fs.readFileSync(cachedAccessoriesPath, 'utf8'));

      // Filter for WLED plugin accessories
      const wledAccessories = cachedData.filter((accessory: any) =>
        accessory.plugin === 'homebridge-wled-ts' ||
        accessory.platform === 'WLED'
      );

      console.log('[UI Server] Found', wledAccessories.length, 'cached WLED accessories');

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
// Try both export formats for compatibility
function startUiServer() {
  console.log('[UI Server] ===== EXPORT FUNCTION CALLED =====');
  const server = new PluginUiServer();
  console.log('[UI Server] Server instance created:', !!server);
  return server;
}

export default startUiServer;
module.exports = startUiServer;
