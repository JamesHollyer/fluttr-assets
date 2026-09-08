import { AudioManager, AudioRecorder } from 'react-native-audio-api';

import { SAMPLE_RATE, WINDOW_SAMPLES } from './classifier';

/** New window every 2.5 s, each covering the last 5 s, so calls are never cut in half. */
const HOP_SAMPLES = WINDOW_SAMPLES / 2;
const BUFFER_SAMPLES = 8000; // 0.25 s

export type MicHandlers = {
  onWindow: (window: Float32Array) => void;
  onLevel: (rms: number) => void;
};

/**
 * Pulls mono 32 kHz PCM from the microphone and hands out overlapping
 * 5-second windows. Keeps one recorder for the life of the app, as the
 * audio library recommends.
 */
export class MicStream {
  private recorder: AudioRecorder | null = null;
  private ring = new Float32Array(WINDOW_SAMPLES);
  private filled = 0;
  private sinceHop = 0;
  private handlers: MicHandlers | null = null;

  /** Resolves to the final permission status; 'Granted' means we can record. */
  async requestPermission(): Promise<string> {
    const current = await AudioManager.checkRecordingPermissions();
    if (current === 'Granted') return current;
    return AudioManager.requestRecordingPermissions();
  }

  async start(handlers: MicHandlers): Promise<void> {
    this.handlers = handlers;
    this.filled = 0;
    this.sinceHop = 0;
    if (!this.recorder) {
      this.recorder = new AudioRecorder();
      this.recorder.onAudioReady(
        { sampleRate: SAMPLE_RATE, bufferLength: BUFFER_SAMPLES, channelCount: 1 },
        ({ buffer, numFrames }) => this.push(buffer.getChannelData(0), numFrames),
      );
    }
    AudioManager.setAudioSessionOptions({ iosCategory: 'record', iosMode: 'measurement', iosOptions: [] });
    await AudioManager.setAudioSessionActivity(true);
    await this.recorder.start();
  }

  async stop(): Promise<void> {
    this.handlers = null;
    if (this.recorder?.isRecording()) await this.recorder.stop();
    await AudioManager.setAudioSessionActivity(false);
  }

  private push(samples: Float32Array, n: number) {
    const h = this.handlers;
    if (!h) return;
    let energy = 0;
    for (let i = 0; i < n; i++) energy += samples[i] * samples[i];
    h.onLevel(Math.sqrt(energy / Math.max(1, n)));

    // Slide the ring buffer left and append.
    if (n >= WINDOW_SAMPLES) {
      this.ring.set(samples.subarray(n - WINDOW_SAMPLES, n));
      this.filled = WINDOW_SAMPLES;
    } else {
      this.ring.copyWithin(0, n);
      this.ring.set(samples.subarray(0, n), WINDOW_SAMPLES - n);
      this.filled = Math.min(WINDOW_SAMPLES, this.filled + n);
    }
    this.sinceHop += n;
    if (this.filled >= WINDOW_SAMPLES && this.sinceHop >= HOP_SAMPLES) {
      this.sinceHop = 0;
      h.onWindow(this.ring.slice());
    }
  }
}
