/**
 * Audio utilities for raw PCM streaming
 */

export class AudioStreamer {
  private audioContext: AudioContext | null = null;
  private nextStartTime: number = 0;
  private isPlaying: boolean = false;
  private sampleRate: number = 24000;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;

  constructor(sampleRate: number = 24000) {
    this.sampleRate = sampleRate;
    console.log("AudioStreamer initialized with sample rate:", sampleRate);
  }

  async start() {
    try {
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioContext();
      }
      
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }
      
      this.analyser = this.audioContext.createAnalyser();
      this.gainNode = this.audioContext.createGain();
      this.analyser.connect(this.audioContext.destination);
      this.gainNode.connect(this.analyser);
      
      this.isPlaying = true;
      this.nextStartTime = this.audioContext.currentTime;
      console.log("AudioStreamer started. Context state:", this.audioContext.state);
    } catch (err) {
      console.error("Failed to start AudioStreamer:", err);
    }
  }

  stop() {
    this.isPlaying = false;
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
      this.analyser = null;
      this.gainNode = null;
    }
    console.log("AudioStreamer stopped");
  }

  getOutputLevel(): number {
    if (!this.analyser) return 0;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(dataArray);
    
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const v = (dataArray[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / dataArray.length);
  }

  addPCMChunk(base64Data: string) {
    if (!this.isPlaying || !this.audioContext || !this.gainNode) {
      console.warn("AudioStreamer: Not playing or context not ready");
      return;
    }

    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Int16Array(len / 2);
      const uint8Array = new Uint8Array(len);
      
      for (let i = 0; i < len; i++) {
        uint8Array[i] = binaryString.charCodeAt(i);
      }
      
      const view = new DataView(uint8Array.buffer);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = view.getInt16(i * 2, true); // Little-endian
      }

      const float32Data = new Float32Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) {
        float32Data[i] = bytes[i] / 32768.0;
      }

      const audioBuffer = this.audioContext.createBuffer(1, float32Data.length, this.sampleRate);
      audioBuffer.getChannelData(0).set(float32Data);

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.gainNode);

      // Ensure we don't schedule too far in the past or future
      const now = this.audioContext.currentTime;
      if (this.nextStartTime < now) {
        this.nextStartTime = now + 0.02; // Small buffer
      }

      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
      
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
    } catch (err) {
      console.error("Error adding PCM chunk:", err);
    }
  }
}

export async function getMicrophoneStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: true });
}

export function encodePCM(float32Array: Float32Array): string {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  
  const uint8Array = new Uint8Array(int16Array.buffer);
  let binary = "";
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}
