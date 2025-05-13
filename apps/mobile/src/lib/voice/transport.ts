import { Platform } from 'react-native';

export type VoiceState =
  'connecting' | 'listening' | 'userSpeaking' | 'botSpeaking' | 'ended' | 'error';

export interface VoiceTransport {
  start(onState: (s: VoiceState) => void): Promise<void>;
  setMuted(muted: boolean): void;
  stop(): void;
}

/** Browser WebRTC straight to the OpenAI Realtime API using the short-lived client secret. */
export class WebRtcTransport implements VoiceTransport {
  private pc: RTCPeerConnection | null = null;
  private mic: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;

  constructor(private readonly clientSecret: string) {}

  async start(onState: (s: VoiceState) => void) {
    onState('connecting');
    const pc = new RTCPeerConnection();
    this.pc = pc;
    this.audio = document.createElement('audio');
    this.audio.autoplay = true;
    pc.ontrack = (e) => {
      if (this.audio) this.audio.srcObject = e.streams[0] ?? null;
    };
    this.mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mic.getTracks().forEach((track) => pc.addTrack(track, this.mic!));

    const events = pc.createDataChannel('oai-events');
    events.onmessage = (msg) => {
      try {
        const e = JSON.parse(String(msg.data)) as { type: string };
        if (e.type === 'input_audio_buffer.speech_started') onState('userSpeaking');
        else if (e.type === 'output_audio_buffer.started') onState('botSpeaking');
        else if (
          e.type === 'output_audio_buffer.stopped' ||
          e.type === 'input_audio_buffer.speech_stopped'
        )
          onState('listening');
      } catch {
        // ignore non-JSON frames
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') onState('error');
      if (pc.connectionState === 'closed') onState('ended');
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const res = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      body: offer.sdp,
      headers: { authorization: `Bearer ${this.clientSecret}`, 'content-type': 'application/sdp' },
    });
    if (!res.ok) throw new Error(`Realtime connection failed (${res.status})`);
    await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() });
    onState('listening');
  }

  setMuted(muted: boolean) {
    this.mic?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }

  stop() {
    this.mic?.getTracks().forEach((t) => t.stop());
    this.pc?.close();
    if (this.audio) this.audio.srcObject = null;
    this.pc = null;
    this.mic = null;
  }
}

/** Used with the offline mock provider: cycles through states so the UI can be exercised. */
export class SimulatedTransport implements VoiceTransport {
  private timers: ReturnType<typeof setTimeout>[] = [];
  private muted = false;

  async start(onState: (s: VoiceState) => void) {
    onState('connecting');
    const cycle = (delay: number) => {
      this.timers.push(setTimeout(() => onState(this.muted ? 'listening' : 'userSpeaking'), delay));
      this.timers.push(setTimeout(() => onState('botSpeaking'), delay + 1600));
      this.timers.push(setTimeout(() => onState('listening'), delay + 3600));
    };
    this.timers.push(setTimeout(() => onState('listening'), 700));
    for (let i = 0; i < 20; i++) cycle(1500 + i * 5000);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
  }

  stop() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}

export function canUseRealtimeVoice() {
  return Platform.OS === 'web' && typeof globalThis.RTCPeerConnection !== 'undefined';
}

export function transportFor(clientSecret: string): VoiceTransport | null {
  if (clientSecret.startsWith('ek_mock_')) return new SimulatedTransport();
  if (canUseRealtimeVoice()) return new WebRtcTransport(clientSecret);
  // Native realtime audio needs react-native-webrtc in a development build.
  return null;
}
