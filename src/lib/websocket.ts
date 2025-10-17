export interface WaveformData {
  X: number[];
  Y: number[];
  Z: number[];
  id: number;
  time: number;
}

export interface WebSocketConfig {
  wsUrl: string;
  token: string;
  topics: string[];
  stationIds: number[];
}

interface EncodedWaveform {
  data: Uint8Array;
  id: number;
  time: number;
  count: number;
}

function decodeWaveform(encoded: EncodedWaveform): WaveformData {
  const buffer = encoded.data;
  let offset = 0;

  const header = buffer[offset++];
  const precision = (header & 0x80) ? 4 : 2;

  const count = (buffer[offset++] << 8) | buffer[offset++];

  const divisor = precision === 2 ? 100 : 10000;

  const readValue = (): number => {
    let intValue: number;

    if (precision === 2) {
      const adjusted = (buffer[offset++] << 16) |
                      (buffer[offset++] << 8) |
                      buffer[offset++];
      intValue = adjusted - 524288;
    } else {
      const adjusted = (buffer[offset++] << 24) |
                      (buffer[offset++] << 16) |
                      (buffer[offset++] << 8) |
                      buffer[offset++];
      intValue = adjusted - 67108864;
    }

    return intValue / divisor;
  };

  const X: number[] = [];
  const Y: number[] = [];
  const Z: number[] = [];

  for (let i = 0; i < count; i++) X.push(readValue());
  for (let i = 0; i < count; i++) Y.push(readValue());
  for (let i = 0; i < count; i++) Z.push(readValue());

  return {
    X,
    Y,
    Z,
    id: encoded.id,
    time: encoded.time
  };
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export class WaveformWebSocket {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private onWaveformCallback: ((data: WaveformData) => void) | null = null;
  private reconnectTimer: number | null = null;
  private reconnectDelay = 5000;

  constructor(config: WebSocketConfig) {
    this.config = config;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.wsUrl);

        this.ws.onopen = () => {
          console.log('✅ WebSocket connected');
          this.subscribe();
          resolve();
        };

        this.ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('🔌 WebSocket closed');
          this.scheduleReconnect();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private subscribe() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const message = {
      type: 'start',
      token: this.config.token,
      topic: this.config.topics,
      config: {
        [this.config.topics[0]]: this.config.stationIds
      },
      time: Date.now()
    };

    console.log('📤 Subscribing to topics:', this.config.topics);
    this.ws.send(JSON.stringify(message));
  }

  private handleMessage(event: MessageEvent) {
    try {
      const message = JSON.parse(event.data);
      console.log('📨 Message received:', message.type, message);

      switch (message.type) {
        case 'info':
          if (message.event === 'connect') {
            console.log('✅ Subscription successful');
            console.log('  Success:', message.topic?.success || []);
            console.log('  Failed:', message.topic?.failed || []);
          } else {
            console.log('ℹ️ Info event:', message);
          }
          break;

        case 'data':
          console.log('📊 Data message received:', message);

          const payload = message.payload?.payload || message.payload;

          if (payload?.data && payload.data._type === 'Buffer') {
            console.log('  Processing buffer data...');
            const base64Data = payload.data.data;
            const buffer = base64ToUint8Array(base64Data);

            const waveform = decodeWaveform({
              data: buffer,
              id: payload.id,
              time: payload.time,
              count: payload.count
            });

            console.log('  Decoded waveform:', waveform);

            if (this.onWaveformCallback) {
              this.onWaveformCallback(waveform);
            }
          } else {
            console.log('  Payload structure:', {
              hasPayload: !!message.payload,
              hasNestedPayload: !!message.payload?.payload,
              hasData: !!payload?.data,
              dataType: payload?.data?._type
            });
          }
          break;

        case 'ntp':
          console.log('⏰ NTP sync:', new Date(message.time).toISOString());
          break;

        default:
          console.log('📨 Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('❌ Message parse error:', error);
      console.log('Raw message:', event.data);
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;

    console.log(`🔄 Reconnecting in ${this.reconnectDelay / 1000}s...`);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(console.error);
    }, this.reconnectDelay);
  }

  onWaveform(callback: (data: WaveformData) => void) {
    this.onWaveformCallback = callback;
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
