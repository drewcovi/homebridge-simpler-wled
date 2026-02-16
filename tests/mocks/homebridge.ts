import { API, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import { EventEmitter } from 'events';

/**
 * Mock Logger for testing
 */
export class MockLogger implements Logger {
  prefix = 'Test';

  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
  debug = jest.fn();
  log = jest.fn();
  success = jest.fn();
}

/**
 * Mock HAP Service
 */
export class MockService {
  public displayName: string;
  public UUID: string;
  public subtype?: string;
  public characteristics: Map<string, MockCharacteristic> = new Map();

  constructor(displayName: string, UUID: string, subtype?: string) {
    this.displayName = displayName;
    this.UUID = UUID;
    this.subtype = subtype;
  }

  getCharacteristic(characteristic: any): MockCharacteristic {
    const uuid = typeof characteristic === 'string' ? characteristic : characteristic.UUID;
    if (!this.characteristics.has(uuid)) {
      this.characteristics.set(uuid, new MockCharacteristic(uuid));
    }
    return this.characteristics.get(uuid)!;
  }

  setCharacteristic(characteristic: any, value: any): this {
    const char = this.getCharacteristic(characteristic);
    char.value = value;
    return this;
  }

  updateCharacteristic(characteristic: any, value: any): this {
    const char = this.getCharacteristic(characteristic);
    char.value = value;
    return this;
  }

  addLinkedService = jest.fn().mockReturnThis();
  removeLinkedService = jest.fn().mockReturnThis();
}

/**
 * Mock HAP Characteristic
 */
export class MockCharacteristic {
  public UUID: string;
  public value: any;
  private getHandler?: () => any;
  private setHandler?: (value: any) => void | Promise<void>;

  constructor(UUID: string) {
    this.UUID = UUID;
  }

  onGet(handler: () => any): this {
    this.getHandler = handler;
    return this;
  }

  onSet(handler: (value: any) => void | Promise<void>): this {
    this.setHandler = handler;
    return this;
  }

  getValue(): any {
    return this.getHandler ? this.getHandler() : this.value;
  }

  async setValue(value: any): Promise<void> {
    this.value = value;
    if (this.setHandler) {
      await this.setHandler(value);
    }
  }

  updateValue(value: any): this {
    this.value = value;
    return this;
  }
}

/**
 * Mock Platform Accessory
 */
export class MockPlatformAccessory {
  UUID: string;
  displayName: string;
  category: any;
  context: Record<string, any> = {};
  private serviceMap: Map<string, MockService> = new Map();

  constructor(displayName: string, UUID: string, category?: any) {
    this.displayName = displayName;
    this.UUID = UUID;
    this.category = category;

    // Pre-create AccessoryInformation service
    const infoService = new MockService('AccessoryInformation', 'AccessoryInformation');
    this.serviceMap.set('AccessoryInformation', infoService);
  }

  getService(service: any): MockService | undefined {
    const uuid = typeof service === 'string' ? service : service.UUID;
    return this.serviceMap.get(uuid);
  }

  addService(service: any, ...args: any[]): MockService {
    const uuid = typeof service === 'string' ? service : service.UUID;
    const displayName = args[0] || this.displayName;
    const subtype = args[1];

    const mockService = new MockService(displayName, uuid, subtype);
    this.serviceMap.set(uuid, mockService);
    return mockService;
  }

  removeService(service: MockService): void {
    this.serviceMap.delete(service.UUID);
  }

  getServiceById(uuid: string, subtype: string): MockService | undefined {
    for (const service of this.serviceMap.values()) {
      if (service.UUID === uuid && service.subtype === subtype) {
        return service;
      }
    }
    return undefined;
  }
}

/**
 * Mock HAP with Service and Characteristic definitions
 */
export class MockHAP {
  Service = {
    AccessoryInformation: { UUID: 'AccessoryInformation' },
    Lightbulb: { UUID: 'Lightbulb' },
    Television: { UUID: 'Television' },
    InputSource: { UUID: 'InputSource' },
  };

  Characteristic = {
    Manufacturer: { UUID: 'Manufacturer' },
    Model: { UUID: 'Model' },
    SerialNumber: { UUID: 'SerialNumber' },
    On: { UUID: 'On' },
    Brightness: { UUID: 'Brightness' },
    Hue: { UUID: 'Hue' },
    Saturation: { UUID: 'Saturation' },
    Active: {
      UUID: 'Active',
      ACTIVE: 1,
      INACTIVE: 0,
    },
    ActiveIdentifier: { UUID: 'ActiveIdentifier' },
    ConfiguredName: { UUID: 'ConfiguredName' },
    SleepDiscoveryMode: {
      UUID: 'SleepDiscoveryMode',
      ALWAYS_DISCOVERABLE: 1,
    },
    RemoteKey: { UUID: 'RemoteKey' },
    Identifier: { UUID: 'Identifier' },
    IsConfigured: {
      UUID: 'IsConfigured',
      CONFIGURED: 1,
      NOT_CONFIGURED: 0,
    },
    InputSourceType: {
      UUID: 'InputSourceType',
      HDMI: 3,
    },
  };

  Categories = {
    TELEVISION: 24,
    LIGHTBULB: 5,
  };

  uuid = {
    generate: jest.fn((data: string) => `uuid-${data}`),
  };
}

/**
 * Mock Homebridge API
 */
export class MockAPI extends EventEmitter {
  public hap: any;
  public platformAccessory: any;

  constructor() {
    super();
    this.hap = new MockHAP();
    this.platformAccessory = MockPlatformAccessory;
  }

  registerPlatform = jest.fn();
  registerPlatformAccessories = jest.fn();
  unregisterPlatformAccessories = jest.fn();
  updatePlatformAccessories = jest.fn();
  publishExternalAccessories = jest.fn();

  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
}

/**
 * Create a mock platform config
 */
export function createMockPlatformConfig(overrides?: Partial<PlatformConfig>): PlatformConfig {
  return {
    platform: 'WLED',
    name: 'WLED Test',
    devices: [],
    defaultPollInterval: 10,
    defaultUseWebSockets: true,
    ...overrides,
  };
}

/**
 * Create a mock device config
 */
export function createMockDeviceConfig(overrides?: any) {
  return {
    name: 'Test WLED',
    host: '192.168.1.100',
    port: 80,
    enabled: true,
    deviceSettings: {
      pollInterval: 10,
      useWebSockets: true,
      enabledPresets: [],
    },
    ...overrides,
  };
}
