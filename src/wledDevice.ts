import { Logger } from 'homebridge';
import axios from 'axios';
import WebSocket from 'ws';

export interface WLEDState {
  on: boolean;
  brightness: number;
  colorMode: 'rgb' | 'hsv' | 'hs' | 'ct' | 'unknown';
  color: {
    r: number;
    g: number;
    b: number;
  };
  hue: number;
  saturation: number;
  colorTemperature: number;
  effect: number;
  presetId: number;
  segmentState?: WLEDState[];
}

export interface WLEDSegment {
  id: number;
  name?: string;
  start: number;
  stop: number;
  length: number;
  colors: Array<[number, number, number]>;
  brightness: number;
  on: boolean;
  selected: boolean;
}

export interface WLEDInfo {
  name: string;
  version: string;
  mac: string;
  segmentCount: number;
  ledCount: number;
}

export class WLEDDevice {
  private readonly baseUrl: string;
  private readonly wsUrl: string;
  private pollTimer?: NodeJS.Timeout;
  private webSocket?: WebSocket;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly reconnectInterval = 5000; // 5 seconds
  private state: WLEDState = {
    on: false,
    brightness: 0,
    colorMode: 'rgb',
    color: { r: 0, g: 0, b: 0 },
    hue: 0,
    saturation: 0,
    colorTemperature: 140, // Middle of range
    effect: 0,
    presetId: 0,
  };
  private stateListeners: Array<(state: WLEDState) => void> = [];
  private segments: WLEDSegment[] = [];
  private info?: WLEDInfo;
  private isConnected = false;

  constructor(
    private readonly log: Logger,
    private readonly host: string,
    private readonly port: number,
    private readonly pollInterval: number,
    private readonly useWebSockets = true,
  ) {
    this.baseUrl = `http://${host}:${port}/json`;
    this.wsUrl = `ws://${host}:${port}/ws`;
    
    // Initialize by getting the device information
    this.getDeviceInfo().catch(error => {
      this.log.error('Failed to initialize WLED device:', error);
    });
    
    if (this.useWebSockets) {
      this.connectWebSocket();
      
      // Also initialize with a standard HTTP request to ensure we have complete state
      this.updateStateViaHTTP().catch(error => {
        this.log.debug('Error during initial HTTP state update:', error);
      });
    } else {
      // Fall back to polling if WebSockets are disabled
      this.startPolling();
    }
  }
  
  /**
   * Connect to the WLED WebSocket API
   */
  private connectWebSocket(): void {
    // Clean up any existing connection
    this.cleanupWebSocket();
    
    this.log.debug(`Connecting to WebSocket at ${this.wsUrl}`);
    
    try {
      this.webSocket = new WebSocket(this.wsUrl);
      
      this.webSocket.on('open', () => {
        this.log.debug('WebSocket connection established');
        this.isConnected = true;
        this.reconnectAttempts = 0; // Reset reconnect counter on successful connection
      });
      
      this.webSocket.on('message', (data: WebSocket.Data) => {
        try {
          this.handleWebSocketMessage(data);
        } catch (error) {
          this.log.error('Error handling WebSocket message:', error);
        }
      });
      
      this.webSocket.on('error', (error) => {
        this.log.error('WebSocket error:', error);
      });
      
      this.webSocket.on('close', () => {
        this.log.debug('WebSocket connection closed');
        this.isConnected = false;
        
        // Attempt to reconnect
        this.scheduleReconnect();
      });
    } catch (error) {
      this.log.error('Failed to connect to WebSocket:', error);
      this.scheduleReconnect();
    }
  }
  
  /**
   * Clean up WebSocket connection
   */
  private cleanupWebSocket(): void {
    if (this.webSocket) {
      // Remove all listeners
      this.webSocket.removeAllListeners();
      
      // Close connection if it's open
      if (this.webSocket.readyState === WebSocket.OPEN) {
        this.webSocket.close();
      }
      
      this.webSocket = undefined;
    }
  }
  
  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    // Clear any existing reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    // Only attempt to reconnect if we haven't exceeded the maximum attempts
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      
      const delay = this.reconnectInterval * Math.min(this.reconnectAttempts, 5);
      this.log.debug(`Scheduling WebSocket reconnection in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      this.reconnectTimer = setTimeout(() => {
        this.connectWebSocket();
      }, delay);
    } else {
      this.log.error(`Failed to reconnect after ${this.maxReconnectAttempts} attempts, falling back to polling`);
      // Fall back to polling if we can't establish a WebSocket connection
      this.startPolling();
    }
  }
  
  /**
   * Handle incoming WebSocket messages
   */
  private handleWebSocketMessage(data: WebSocket.Data): void {
    // Convert data to string if it's not already
    const message = data.toString();
    
    try {
      // Parse the JSON message
      const jsonData = JSON.parse(message);
      
      // Check if this is a state update
      if (jsonData.state) {
        this.updateStateFromData(jsonData.state);
      } else if (jsonData.seg !== undefined) {
        // This might be a segment update only
        this.updateSegmentsFromData(jsonData);
      }
    } catch (error) {
      this.log.error('Error parsing WebSocket message:', error);
    }
  }

  /**
   * Start polling the WLED device for state updates
   */
  private startPolling(): void {
    // Clear any existing poll timer
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }

    // Create new poll timer
    this.pollTimer = setInterval(() => {
      this.updateStateViaHTTP().catch(error => {
        this.log.debug('Error updating WLED state:', error);
      });
    }, this.pollInterval * 1000);

    // Do an immediate update
    this.updateStateViaHTTP().catch(error => {
      this.log.debug('Error during initial WLED state update:', error);
    });
  }

  /**
   * Stop polling the WLED device
   */
  public stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }
  
  /**
   * Clean up resources when device is removed
   */
  public cleanup(): void {
    // Stop polling
    this.stopPolling();
    
    // Clear reconnect timer if it exists
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    
    // Close WebSocket connection
    this.cleanupWebSocket();
    
    // Clear listeners
    this.stateListeners = [];
    this.presetListeners = [];
  }

  /**
   * Update the device state from the WLED HTTP API
   */
  private async updateStateViaHTTP(): Promise<void> {
    try {
      const response = await axios.get(`${this.baseUrl}/state`);
      const data = response.data;
      this.updateStateFromData(data);
    } catch (error) {
      this.log.debug('Failed to fetch WLED state via HTTP:', error);
      throw error;
    }
  }
  
  /**
   * Update state from data (used by both HTTP and WebSocket)
   */
  private updateStateFromData(data: any): void {
    try {
      // Parse the state response
      this.state = {
        on: data.on === true,
        brightness: data.bri !== undefined ? Math.round((data.bri / 255) * 100) : 0,
        colorMode: 'rgb', // Default, will be updated based on data
        color: {
          r: data.seg?.[0]?.col?.[0]?.[0] || 0,
          g: data.seg?.[0]?.col?.[0]?.[1] || 0,
          b: data.seg?.[0]?.col?.[0]?.[2] || 0,
        },
        hue: 0, // Will be calculated from RGB
        saturation: 0, // Will be calculated from RGB
        colorTemperature: 140, // Default middle value
        effect: data.seg?.[0]?.fx || 0,
        presetId: data.ps || -1,
      };

      // Update active preset ID if present in the response
      if (data.ps !== undefined) {
        this.activePresetId = data.ps;
      }

      // Convert RGB to HSV
      const { h, s } = this.rgbToHsv(
        this.state.color.r,
        this.state.color.g,
        this.state.color.b,
      );
      this.state.hue = h;
      this.state.saturation = s;

      // Update segment info if available
      this.updateSegmentsFromData(data);

      // Notify listeners
      this.notifyListeners();
    } catch (error) {
      this.log.error('Error updating state from data:', error);
    }
  }
  
  /**
   * Update segments information from data
   */
  private updateSegmentsFromData(data: any): void {
    if (data.seg && Array.isArray(data.seg)) {
      this.segments = data.seg.map((segment: any, index: number) => ({
        id: index,
        name: segment.n || `Segment ${index}`,
        start: segment.start,
        stop: segment.stop,
        length: segment.stop - segment.start,
        colors: segment.col || [],
        brightness: segment.bri !== undefined ? Math.round((segment.bri / 255) * 100) : 0,
        on: segment.on === true,
        selected: segment.sel === true,
      }));

      // Update segment states if they exist
      if (this.segments.length > 0) {
        this.state.segmentState = this.segments.map(segment => {
          const mainColor = segment.colors[0] || [0, 0, 0];
          const { h, s } = this.rgbToHsv(mainColor[0], mainColor[1], mainColor[2]);
          
          return {
            on: segment.on,
            brightness: segment.brightness,
            colorMode: 'rgb',
            color: {
              r: mainColor[0],
              g: mainColor[1],
              b: mainColor[2],
            },
            hue: h,
            saturation: s,
            colorTemperature: 140,
            effect: 0,
            presetId: 0,
          };
        });
      }
    }
  }

  /**
   * Convert RGB values to HSV
   */
  private rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
    // Convert RGB from 0-255 to 0-1
    r = r / 255;
    g = g / 255;
    b = b / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    
    let h = 0;
    let s = max === 0 ? 0 : delta / max;
    const v = max;

    if (delta === 0) {
      h = 0;
    } else if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }

    h = Math.round(h * 60);
    if (h < 0) {
      h += 360;
    }

    // Convert to HomeKit ranges
    return {
      h, // 0-360 degrees
      s: Math.round(s * 100), // 0-100%
      v: Math.round(v * 100), // 0-100%
    };
  }

  /**
   * Convert HSV values to RGB
   */
  private hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
    // Convert to 0-1 ranges
    h = h / 360;
    s = s / 100;
    v = v / 100;

    let r = 0, g = 0, b = 0;

    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    switch (i % 6) {
      case 0:
        r = v;
        g = t;
        b = p;
        break;
      case 1:
        r = q;
        g = v;
        b = p;
        break;
      case 2:
        r = p;
        g = v;
        b = t;
        break;
      case 3:
        r = p;
        g = q;
        b = v;
        break;
      case 4:
        r = t;
        g = p;
        b = v;
        break;
      case 5:
        r = v;
        g = p;
        b = q;
        break;
    }

    // Convert back to 0-255 ranges
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255),
    };
  }

  /**
   * Get the current state
   */
  public getState(): WLEDState {
    return { ...this.state };
  }

  /**
   * Get segment state
   */
  public getSegmentState(segmentIndex: number): WLEDState | undefined {
    return this.state.segmentState?.[segmentIndex];
  }

  /**
   * Register a listener for state changes
   */
  public addStateListener(listener: (state: WLEDState) => void): void {
    this.stateListeners.push(listener);
  }

  /**
   * Remove a listener
   */
  public removeStateListener(listener: (state: WLEDState) => void): void {
    const index = this.stateListeners.indexOf(listener);
    if (index >= 0) {
      this.stateListeners.splice(index, 1);
    }
  }

  /**
   * Notify all listeners of a state change
   */
  private notifyListeners(): void {
    for (const listener of this.stateListeners) {
      try {
        listener(this.state);
      } catch (error) {
        this.log.error('Error in state listener:', error);
      }
    }
  }

  /**
   * Send a state update via the WebSocket connection
   */
  private sendWebSocketUpdate(payload: any): void {
    if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
      try {
        this.webSocket.send(JSON.stringify(payload));
        return; // Success - no need to continue
      } catch (error) {
        this.log.debug('Error sending WebSocket message, falling back to HTTP:', error);
        // Fall through to HTTP method
      }
    }
    
    // If WebSocket not available or send failed, fall back to HTTP
    axios.post(`${this.baseUrl}/state`, payload).catch(error => {
      this.log.error('Failed to send state update via HTTP:', error);
    });
  }
  
  /**
   * Set the on/off state
   */
  public async setPower(on: boolean): Promise<void> {
    try {
      const payload = { on };
      
      // If WebSockets are enabled and connected, use that
      if (this.useWebSockets && this.isConnected) {
        this.sendWebSocketUpdate(payload);
      } else {
        // Otherwise use HTTP
        await axios.post(`${this.baseUrl}/state`, payload);
      }
      
      // Update local state immediately for responsiveness
      this.state.on = on;
      this.notifyListeners();
    } catch (error) {
      this.log.error('Failed to set power state:', error);
      throw error;
    }
  }

  /**
   * Set segment power state
   */
  public async setSegmentPower(segmentIndex: number, on: boolean): Promise<void> {
    try {
      const payload = {
        seg: {
          id: segmentIndex,
          on,
        },
      };
      
      // If WebSockets are enabled and connected, use that
      if (this.useWebSockets && this.isConnected) {
        this.sendWebSocketUpdate(payload);
      } else {
        // Otherwise use HTTP
        await axios.post(`${this.baseUrl}/state`, payload);
      }
      
      // Update local state for the segment
      if (this.state.segmentState && this.state.segmentState[segmentIndex]) {
        this.state.segmentState[segmentIndex].on = on;
      }
      
      this.notifyListeners();
    } catch (error) {
      this.log.error(`Failed to set power state for segment ${segmentIndex}:`, error);
      throw error;
    }
  }

  /**
   * Set the brightness level (0-100)
   */
  public async setBrightness(brightness: number): Promise<void> {
    try {
      // Convert 0-100 to 0-255
      const bri = Math.max(0, Math.min(255, Math.round((brightness / 100) * 255)));
      const payload = { bri };
      
      // If WebSockets are enabled and connected, use that
      if (this.useWebSockets && this.isConnected) {
        this.sendWebSocketUpdate(payload);
      } else {
        // Otherwise use HTTP
        await axios.post(`${this.baseUrl}/state`, payload);
      }
      
      // Update local state immediately for responsiveness
      this.state.brightness = brightness;
      this.notifyListeners();
    } catch (error) {
      this.log.error('Failed to set brightness:', error);
      throw error;
    }
  }

  /**
   * Set segment brightness
   */
  public async setSegmentBrightness(segmentIndex: number, brightness: number): Promise<void> {
    try {
      // Convert 0-100 to 0-255
      const bri = Math.max(0, Math.min(255, Math.round((brightness / 100) * 255)));
      const payload = {
        seg: {
          id: segmentIndex,
          bri,
        },
      };
      
      // If WebSockets are enabled and connected, use that
      if (this.useWebSockets && this.isConnected) {
        this.sendWebSocketUpdate(payload);
      } else {
        // Otherwise use HTTP
        await axios.post(`${this.baseUrl}/state`, payload);
      }
      
      // Update local state for the segment
      if (this.state.segmentState && this.state.segmentState[segmentIndex]) {
        this.state.segmentState[segmentIndex].brightness = brightness;
      }
      
      this.notifyListeners();
    } catch (error) {
      this.log.error(`Failed to set brightness for segment ${segmentIndex}:`, error);
      throw error;
    }
  }

  /**
   * Set the RGB color
   */
  public async setColor(r: number, g: number, b: number): Promise<void> {
    try {
      const payload = {
        seg: {
          id: 0,
          col: [[r, g, b]],
        },
      };
      
      // If WebSockets are enabled and connected, use that
      if (this.useWebSockets && this.isConnected) {
        this.sendWebSocketUpdate(payload);
      } else {
        // Otherwise use HTTP
        await axios.post(`${this.baseUrl}/state`, payload);
      }
      
      // Update local state immediately for responsiveness
      this.state.color = { r, g, b };
      const { h, s } = this.rgbToHsv(r, g, b);
      this.state.hue = h;
      this.state.saturation = s;
      this.state.colorMode = 'rgb';
      
      this.notifyListeners();
    } catch (error) {
      this.log.error('Failed to set color:', error);
      throw error;
    }
  }

  /**
   * Set segment color
   */
  public async setSegmentColor(segmentIndex: number, r: number, g: number, b: number): Promise<void> {
    try {
      const payload = {
        seg: {
          id: segmentIndex,
          col: [[r, g, b]],
        },
      };
      
      // If WebSockets are enabled and connected, use that
      if (this.useWebSockets && this.isConnected) {
        this.sendWebSocketUpdate(payload);
      } else {
        // Otherwise use HTTP
        await axios.post(`${this.baseUrl}/state`, payload);
      }
      
      // Update local state for the segment
      if (this.state.segmentState && this.state.segmentState[segmentIndex]) {
        this.state.segmentState[segmentIndex].color = { r, g, b };
        const { h, s } = this.rgbToHsv(r, g, b);
        this.state.segmentState[segmentIndex].hue = h;
        this.state.segmentState[segmentIndex].saturation = s;
        this.state.segmentState[segmentIndex].colorMode = 'rgb';
      }
      
      this.notifyListeners();
    } catch (error) {
      this.log.error(`Failed to set color for segment ${segmentIndex}:`, error);
      throw error;
    }
  }

  /**
   * Set the HSV color
   */
  public async setHSV(hue: number, saturation: number, value: number): Promise<void> {
    try {
      const { r, g, b } = this.hsvToRgb(hue, saturation, value);
      await this.setColor(r, g, b);
    } catch (error) {
      this.log.error('Failed to set HSV color:', error);
      throw error;
    }
  }

  /**
   * Set segment HSV color
   */
  public async setSegmentHSV(segmentIndex: number, hue: number, saturation: number, value: number): Promise<void> {
    try {
      const { r, g, b } = this.hsvToRgb(hue, saturation, value);
      await this.setSegmentColor(segmentIndex, r, g, b);
    } catch (error) {
      this.log.error(`Failed to set HSV color for segment ${segmentIndex}:`, error);
      throw error;
    }
  }

  /**
   * Get the device info from WLED
   */
  public async getDeviceInfo(): Promise<WLEDInfo> {
    try {
      const response = await axios.get(`${this.baseUrl}/info`);
      const data = response.data;

      this.info = {
        name: data.name || 'WLED',
        version: data.ver || 'Unknown',
        mac: data.mac || 'Unknown',
        segmentCount: data.leds?.segs || 1,
        ledCount: data.leds?.count || 0,
      };

      return this.info;
    } catch (error) {
      this.log.error('Failed to get device info:', error);
      throw error;
    }
  }

  /**
   * Get array of segments from the device
   */
  public async getSegments(): Promise<WLEDSegment[]> {
    try {
      // If we already have segments and they're populated, return them
      if (this.segments.length > 0) {
        return this.segments;
      }

      // Otherwise, force an update to get the segments
      await this.updateStateViaHTTP();
      return this.segments;
    } catch (error) {
      this.log.error('Failed to get segments:', error);
      throw error;
    }
  }

  /**
   * Get available effects
   */
  public async getEffects(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/effects`);
      const data = response.data;
      
      // Returns an array of effect names
      return Array.isArray(data) ? data : [];
    } catch (error) {
      this.log.error('Failed to get effects:', error);
      throw error;
    }
  }

  /**
   * Set the current effect by index
   */
  public async setEffect(effectIndex: number): Promise<void> {
    try {
      const payload = {
        seg: {
          id: 0,
          fx: effectIndex,
        },
      };
      
      // If WebSockets are enabled and connected, use that
      if (this.useWebSockets && this.isConnected) {
        this.sendWebSocketUpdate(payload);
      } else {
        // Otherwise use HTTP
        await axios.post(`${this.baseUrl}/state`, payload);
      }
      
      this.state.effect = effectIndex;
      this.notifyListeners();
    } catch (error) {
      this.log.error('Failed to set effect:', error);
      throw error;
    }
  }

  /**
   * Set effect for a specific segment
   */
  public async setSegmentEffect(segmentIndex: number, effectIndex: number): Promise<void> {
    try {
      const payload = {
        seg: {
          id: segmentIndex,
          fx: effectIndex,
        },
      };
      
      // If WebSockets are enabled and connected, use that
      if (this.useWebSockets && this.isConnected) {
        this.sendWebSocketUpdate(payload);
      } else {
        // Otherwise use HTTP
        await axios.post(`${this.baseUrl}/state`, payload);
      }
      
      // Update local state if needed
      this.notifyListeners();
    } catch (error) {
      this.log.error(`Failed to set effect for segment ${segmentIndex}:`, error);
      throw error;
    }
  }

  private presets: Record<string, { name: string; data: any }> = {};
  private presetListeners: Array<(presets: Record<string, { name: string; data: any }>) => void> = [];
  private activePresetId = -1; // No preset active by default

  /**
   * Get available presets
   */
  public async getPresets(): Promise<Record<string, { name: string; data: any }>> {
    try {
      if (Object.keys(this.presets).length > 0) {
        return this.presets;
      }
      
      const response = await axios.get(`${this.baseUrl}/presets`);
      const rawPresets = response.data || {};
      
      // Process presets to have a more useful format
      // Remove metadata entries
      delete rawPresets._name;
      delete rawPresets._type;
      
      // Format presets into a more useful structure
      this.presets = {};
      
      for (const [id, data] of Object.entries(rawPresets)) {
        if (typeof data === 'object' && data !== null) {
          // Extract a name for the preset
          let name = `Preset ${id}`;
          
          if ('n' in data && typeof data.n === 'string') {
            name = data.n;
          } else if ('name' in data && typeof data.name === 'string') {
            name = data.name;
          }
          
          this.presets[id] = {
            name,
            data,
          };
        }
      }
      
      // Notify preset listeners
      this.notifyPresetListeners();
      
      return this.presets;
    } catch (error) {
      this.log.error('Failed to get presets:', error);
      throw error;
    }
  }

  /**
   * Get active preset ID
   */
  public getActivePresetId(): number {
    return this.activePresetId;
  }

  /**
   * Register a listener for preset changes
   */
  public addPresetListener(listener: (presets: Record<string, { name: string; data: any }>) => void): void {
    this.presetListeners.push(listener);
  }

  /**
   * Remove a preset listener
   */
  public removePresetListener(listener: (presets: Record<string, { name: string; data: any }>) => void): void {
    const index = this.presetListeners.indexOf(listener);
    if (index >= 0) {
      this.presetListeners.splice(index, 1);
    }
  }

  /**
   * Notify all preset listeners
   */
  private notifyPresetListeners(): void {
    for (const listener of this.presetListeners) {
      try {
        listener(this.presets);
      } catch (error) {
        this.log.error('Error in preset listener:', error);
      }
    }
  }

  /**
   * Activate a preset by ID
   */
  public async activatePreset(presetId: number): Promise<void> {
    try {
      const payload = { ps: presetId };
      
      // If WebSockets are enabled and connected, use that
      if (this.useWebSockets && this.isConnected) {
        this.sendWebSocketUpdate(payload);
      } else {
        // Otherwise use HTTP
        await axios.post(`${this.baseUrl}/state`, payload);
      }
      
      this.activePresetId = presetId;
      this.state.presetId = presetId;
      this.notifyListeners();
      
      // Update the state as preset activation might change multiple properties
      if (this.useWebSockets && this.isConnected) {
        // WebSocket will provide updates automatically
      } else {
        // Use HTTP to update state
        await this.updateStateViaHTTP();
      }
    } catch (error) {
      this.log.error('Failed to activate preset:', error);
      throw error;
    }
  }
}