import { Logger } from 'homebridge';
import * as dnssd from 'dnssd';
import * as dgram from 'dgram';
import * as http from 'http';

import axios from 'axios';

export interface DiscoveredWLEDDevice {
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

export class WLEDDiscoveryService {
  private mdnsBrowser?: dnssd.Browser;
  private udpSocket?: dgram.Socket;
  private discoveredDevices: Map<string, DiscoveredWLEDDevice> = new Map();
  private discoveryListeners: Array<(devices: DiscoveredWLEDDevice[]) => void> = [];
  private isDiscovering = false;
  private discoveryTimer?: NodeJS.Timeout;
  private readonly DISCOVERY_INTERVAL = 300000; // 5 minutes
  private readonly MDNS_SERVICE_TYPE = '_wled._tcp';
  private readonly UDP_PORT = 21324; // WLED UDP notification port
  private readonly UDP_DISCOVERY_PORT = 21324; // WLED UDP sync port
  private checkQueue: Array<{host: string; port: number; method: 'mdns' | 'ssdp' | 'direct'}> = [];
  private isProcessingQueue = false;

  constructor(private readonly log: Logger) {
    this.log.debug('Initializing WLED Discovery Service');
  }

  /**
   * Clear all discovered devices
   */
  public clearDiscoveredDevices(): void {
    this.discoveredDevices.clear();
    this.notifyListeners();
  }

  /**
   * Start the discovery process
   */
  public startDiscovery(): void {
    this.log.info('=== startDiscovery() called ===');
    if (this.isDiscovering) {
      this.log.debug('Discovery already running');
      return;
    }

    this.isDiscovering = true;
    this.log.info('Setting isDiscovering = true, calling discoverDevices()');
    this.discoverDevices();

    // Setup periodic rediscovery
    this.discoveryTimer = setInterval(() => {
      this.discoverDevices();
    }, this.DISCOVERY_INTERVAL);
    this.log.info('Discovery timer set up');
  }

  /**
   * Stop discovery process and clean up resources
   */
  public stopDiscovery(): void {
    this.isDiscovering = false;

    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = undefined;
    }

    if (this.mdnsBrowser) {
      this.mdnsBrowser.stop();
      this.mdnsBrowser = undefined;
    }

    if (this.udpSocket) {
      this.udpSocket.close();
      this.udpSocket = undefined;
    }
  }

  /**
   * Run discovery process to find WLED devices on the network
   */
  private discoverDevices(): void {
    this.log.info('=== discoverDevices() called ===');
    this.log.info('Starting WLED device discovery');
    this.log.info('Current discovered devices count:', this.discoveredDevices.size);
    this.log.info('Discovery listeners count:', this.discoveryListeners.length);

    // Start all discovery methods in parallel
    this.log.info('Starting mDNS discovery...');
    this.discoverWithMDNS();
    this.log.info('Starting UDP discovery...');
    this.discoverWithUDP();
    this.log.info('Both discovery methods initiated');
  }

  /**
   * Process the queue of devices to check synchronously
   */
  private async processCheckQueue(): Promise<void> {
    if (this.isProcessingQueue || this.checkQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    this.log.debug(`Processing check queue with ${this.checkQueue.length} device(s)`);

    while (this.checkQueue.length > 0) {
      const item = this.checkQueue.shift();
      if (!item) {
        break;
      }

      this.log.debug(`Checking device ${item.host}:${item.port} via ${item.method} (${this.checkQueue.length} remaining in queue)`);

      try {
        const isWLED = await this.checkIfWLED(item.host, item.port, item.method);
        if (isWLED) {
          this.log.info(`✓ Found WLED device at ${item.host}:${item.port} via ${item.method}`);
        } else {
          this.log.debug(`✗ ${item.host}:${item.port} is not a WLED device`);
        }
      } catch (error: any) {
        this.log.debug(`Error checking ${item.host}:${item.port}: ${error.message}`);
      }

      // Longer delay between checks to ensure each device completes fully
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    this.isProcessingQueue = false;
    this.log.debug('Check queue processing complete');
  }

  /**
   * Add a device to the check queue and start processing
   */
  private queueDeviceCheck(host: string, port: number, method: 'mdns' | 'ssdp' | 'direct'): void {
    // Check if already in queue
    const alreadyQueued = this.checkQueue.some(item => item.host === host && item.port === port);
    if (alreadyQueued) {
      this.log.debug(`Device ${host}:${port} already in check queue, skipping`);
      return;
    }

    this.log.debug(`Adding ${host}:${port} to check queue`);
    this.checkQueue.push({ host, port, method });

    // Start processing if not already running
    if (!this.isProcessingQueue) {
      this.processCheckQueue();
    }
  }

  /**
   * Discover WLED devices using mDNS (dns-sd)
   */
  private discoverWithMDNS(): void {
    try {
      this.log.debug('Starting mDNS discovery...');

      // Stop existing browser if any
      if (this.mdnsBrowser) {
        this.mdnsBrowser.stop();
      }

      let foundAny = false;

      // Create a new browser for WLED services
      this.mdnsBrowser = new dnssd.Browser(dnssd.tcp(this.MDNS_SERVICE_TYPE.replace('._tcp', '')));

      this.mdnsBrowser.on('serviceUp', (service) => {
        foundAny = true;
        this.log.info(`!!! mDNS service UP: ${service.name} at ${service.host}:${service.port}`);

        // Remove trailing period from hostname (common in mDNS FQDNs)
        const host = service.host.replace(/\.$/, '');
        const port = service.port || 80;

        this.log.info(`Adding to check queue: ${host}:${port}`);
        // Add to queue for synchronous checking
        this.queueDeviceCheck(host, port, 'mdns');
      });

      this.mdnsBrowser.on('serviceDown', (service) => {
        this.log.debug(`mDNS service removed: ${service.name}`);
      });

      this.mdnsBrowser.on('error', (error) => {
        this.log.error('mDNS browser error:', error);
      });

      // Start browsing
      this.mdnsBrowser.start();

      // Stop finding after a longer timeout to allow all devices to be discovered
      setTimeout(() => {
        if (this.mdnsBrowser) {
          this.mdnsBrowser.stop();
        }
        if (!foundAny) {
          this.log.debug('No mDNS services found during discovery period');
        }
      }, 60000); // Increased to 60s to allow time for synchronous checks
    } catch (error) {
      this.log.error('Error discovering devices with mDNS:', error);
    }
  }


  /**
   * Discover WLED devices using UDP broadcast
   */
  private discoverWithUDP(): void {
    try {
      this.log.debug('Starting UDP discovery on port 21324...');

      // Create UDP socket
      if (!this.udpSocket) {
        this.udpSocket = dgram.createSocket('udp4');

        this.udpSocket.on('message', (msg, rinfo) => {
          this.log.info(`!!! UDP response from ${rinfo.address}:${rinfo.port}`);

          // Any response indicates a WLED device
          // Add to queue for synchronous checking
          this.log.info(`Adding UDP device to check queue: ${rinfo.address}:80`);
          this.queueDeviceCheck(rinfo.address, 80, 'ssdp');
        });

        this.udpSocket.on('error', (err) => {
          this.log.error('UDP socket error:', err);
        });

        this.udpSocket.bind(() => {
          try {
            this.udpSocket!.setBroadcast(true);

            // WLED discovery packet - simple UDP notification packet
            // WLED responds to UDP packets on port 21324
            const discoveryPacket = Buffer.from([
              0x01, // WLED notification packet type
            ]);

            // Send broadcast to common subnets
            const broadcasts = [
              '255.255.255.255', // General broadcast
              '10.0.1.255',      // Common home network
              '192.168.1.255',   // Common home network
              '192.168.0.255',   // Common home network
            ];

            broadcasts.forEach(broadcast => {
              this.udpSocket!.send(discoveryPacket, this.UDP_DISCOVERY_PORT, broadcast, (err) => {
                if (err) {
                  this.log.debug(`Failed to send UDP broadcast to ${broadcast}:`, err.message);
                } else {
                  this.log.debug(`Sent UDP discovery packet to ${broadcast}:${this.UDP_DISCOVERY_PORT}`);
                }
              });
            });
          } catch (error) {
            this.log.error('Error sending UDP broadcasts:', error);
          }
        });
      }

      // Close socket after longer discovery period
      setTimeout(() => {
        if (this.udpSocket) {
          this.udpSocket.close();
          this.udpSocket = undefined;
          this.log.debug('UDP discovery completed');
        }
      }, 60000); // Increased to 60s to allow time for synchronous checks
    } catch (error) {
      this.log.error('Error discovering devices with UDP:', error);
    }
  }

  /**
   * Add a discovered device to the map and notify listeners
   */
  private addDiscoveredDevice(device: DiscoveredWLEDDevice): void {
    // Use device ID (MAC address) as unique key to avoid duplicates
    // when same device is discovered via multiple methods
    const key = device.id;

    // Check if we already have this device
    const existing = this.discoveredDevices.get(key);

    // If device exists, merge information intelligently
    if (existing) {
      // Prefer IP addresses over .local hostnames for better reliability
      const existingIsLocal = existing.host.endsWith('.local');
      const newIsLocal = device.host.endsWith('.local');

      if (!existingIsLocal && newIsLocal) {
        // Keep existing IP-based discovery
        this.log.debug(`Device ${device.name} already discovered at ${existing.host}, ignoring .local address ${device.host}`);
        return;
      } else if (existingIsLocal && !newIsLocal) {
        // Update to use IP-based discovery
        this.log.debug(`Updating device ${device.name} from ${existing.host} to ${device.host}`);
        this.discoveredDevices.set(key, device);
        this.notifyListeners();
        return;
      } else if (existing.host === device.host) {
        // Same host, just update info if needed
        if (device.info && !existing.info) {
          this.discoveredDevices.set(key, device);
          this.notifyListeners();
        }
        return;
      } else {
        // Different hosts but same ID - this shouldn't happen with proper MAC addresses
        this.log.debug(`Device ${device.name} found at multiple hosts: ${existing.host} and ${device.host}`);
        return;
      }
    }

    // Add new device
    this.discoveredDevices.set(key, device);
    this.log.info(`Discovered WLED device: ${device.name} at ${device.host}:${device.port} via ${device.discoveryMethod}`);

    // Notify listeners
    this.notifyListeners();
  }

  /**
   * Check if a host is running WLED and add it if so
   */
  private async checkIfWLED(host: string, port: number = 80, discoveryMethod: 'mdns' | 'ssdp' | 'direct' = 'mdns'): Promise<boolean> {
    try {
      this.log.debug(`Attempting HTTP request to http://${host}:${port}/json/info`);

      const response = await axios.get(`http://${host}:${port}/json/info`, {
        timeout: 20000, // Increased to 20s for slow-responding devices
        // Disable keep-alive to prevent connection reuse issues
        headers: {
          'Connection': 'close',
        },
        // Force new connection for each request
        httpAgent: new http.Agent({
          keepAlive: false,
          maxSockets: 1,
        }),
      });

      this.log.debug(`Received response from ${host}:${port}`);
      const data = response.data;

      // Check if this is a WLED device
      if (data && data.ver && (data.name || data.brand === 'WLED')) {
        // This is a WLED device!
        this.log.debug(`Confirmed WLED device: ${data.name} at ${host}:${port}`);

        const device: DiscoveredWLEDDevice = {
          name: data.name || `WLED ${host}`,
          host: host,
          port: port,
          id: data.mac?.replace(/:/g, '') || `wled-${host}`,
          discoveryMethod: discoveryMethod,
          info: {
            version: data.ver || 'Unknown',
            macAddress: data.mac || 'Unknown',
            ledCount: data.leds?.count || 0,
          },
        };

        this.addDiscoveredDevice(device);
        return true;
      }

      this.log.debug(`Device at ${host}:${port} is not a WLED device`);
      return false;
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        this.log.debug(`Connection refused to ${host}:${port}`);
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        this.log.warn(`Timeout connecting to ${host}:${port} - device may be offline or unreachable`);
      } else if (error.code === 'ENOTFOUND') {
        this.log.warn(`DNS resolution failed for ${host} - device may not exist on network`);
      } else {
        this.log.debug(`Error checking ${host}:${port}: ${error.message}`);
      }
      return false;
    }
  }

  /**
   * Get additional information about a discovered device
   */
  private async enrichDeviceInfo(device: DiscoveredWLEDDevice): Promise<void> {
    try {
      const response = await axios.get(`http://${device.host}:${device.port}/json/info`, { timeout: 5000 });
      const data = response.data;

      device.info = {
        version: data.ver || 'Unknown',
        macAddress: data.mac || 'Unknown',
        ledCount: data.leds?.count || 0,
      };

      // Update name if available
      if (data.name) {
        device.name = data.name;
      }

      // Update the device in the map using device ID
      this.discoveredDevices.set(device.id, device);

      // Notify listeners
      this.notifyListeners();
    } catch (error) {
      this.log.debug(`Could not get additional info for WLED device at ${device.host}:${device.port}`, error);
    }
  }

  /**
   * Get all discovered devices
   */
  public getDiscoveredDevices(): DiscoveredWLEDDevice[] {
    return Array.from(this.discoveredDevices.values());
  }

  /**
   * Add a listener for device discovery events
   */
  public addDiscoveryListener(listener: (devices: DiscoveredWLEDDevice[]) => void): void {
    this.discoveryListeners.push(listener);
    
    // Immediately notify with current devices
    if (this.discoveredDevices.size > 0) {
      try {
        listener(this.getDiscoveredDevices());
      } catch (error) {
        this.log.error('Error in discovery listener:', error);
      }
    }
  }

  /**
   * Remove a discovery listener
   */
  public removeDiscoveryListener(listener: (devices: DiscoveredWLEDDevice[]) => void): void {
    const index = this.discoveryListeners.indexOf(listener);
    if (index >= 0) {
      this.discoveryListeners.splice(index, 1);
    }
  }

  /**
   * Notify all listeners of discovered devices
   */
  private notifyListeners(): void {
    const devices = this.getDiscoveredDevices();
    this.log.info(`=== notifyListeners() called with ${devices.length} devices ===`);
    this.log.info(`Notifying ${this.discoveryListeners.length} listener(s)`);
    for (const listener of this.discoveryListeners) {
      try {
        this.log.debug('Calling listener function');
        listener(devices);
      } catch (error) {
        this.log.error('Error in discovery listener:', error);
      }
    }
  }

  /**
   * Manually add a WLED device by IP/hostname
   */
  public async addDeviceByHost(host: string, port = 80): Promise<DiscoveredWLEDDevice | null> {
    try {
      // Check if device already exists
      if (this.discoveredDevices.has(host)) {
        return this.discoveredDevices.get(host) || null;
      }
      
      // Try to connect to the device
      const response = await axios.get(`http://${host}:${port}/json/info`, { timeout: 5000 });
      const data = response.data;
      
      // This appears to be a valid WLED device
      const device: DiscoveredWLEDDevice = {
        name: data.name || `WLED ${host}`,
        host: host,
        port: port,
        id: data.mac?.replace(/:/g, '') || `wled-${host}`,
        discoveryMethod: 'direct',
        info: {
          version: data.ver || 'Unknown',
          macAddress: data.mac || 'Unknown',
          ledCount: data.leds?.count || 0,
        },
      };
      
      // Add to map
      this.addDiscoveredDevice(device);
      
      return device;
    } catch (error) {
      this.log.error(`Failed to add device by host ${host}:${port}:`, error);
      return null;
    }
  }
}