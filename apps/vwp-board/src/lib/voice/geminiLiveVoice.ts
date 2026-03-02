"use client";

import {
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
  type Session,
} from "@google/genai";

export type GeminiLiveCallStatus = "idle" | "connecting" | "live" | "error";

export interface GeminiLiveVoiceOptions {
  apiKey: string;
  sttModel?: string;
  ttsModel?: string;
  voiceName?: string;
  onStatusChange?: (status: GeminiLiveCallStatus) => void;
  onError?: (message: string) => void;
  onInterimTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
}

const MIC_TARGET_SAMPLE_RATE = 16_000;
const DEFAULT_TTS_SAMPLE_RATE = 24_000;
const SCRIPT_PROCESSOR_BUFFER_SIZE = 2_048;

// Current Gemini Live model (gemini-live-2.5-flash-preview was shut down Dec 9, 2025).
const LIVE_MODEL_CANDIDATES = [
  "gemini-2.5-flash-native-audio-preview-12-2025",
] as const;

export class GeminiLiveVoice {
  private readonly ai: GoogleGenAI;
  private readonly sttModel: string;
  private readonly ttsModel: string;
  private readonly voiceName: string;
  private readonly onStatusChange?: (status: GeminiLiveCallStatus) => void;
  private readonly onError?: (message: string) => void;
  private readonly onInterimTranscript?: (text: string) => void;
  private readonly onFinalTranscript?: (text: string) => void;

  private sttSession: Session | null = null;
  private ttsSession: Session | null = null;
  private mediaStream: MediaStream | null = null;
  private captureContext: AudioContext | null = null;
  private captureSource: MediaStreamAudioSourceNode | null = null;
  private captureProcessor: ScriptProcessorNode | null = null;
  private captureGainNode: GainNode | null = null;
  private playbackContext: AudioContext | null = null;
  private playbackCursor = 0;
  private activeSources = new Set<AudioBufferSourceNode>();

  private status: GeminiLiveCallStatus = "idle";
  private interimTranscript = "";
  private lastFinalTranscript = "";
  private isStopping = false;

  constructor(options: GeminiLiveVoiceOptions) {
    this.ai = new GoogleGenAI({ apiKey: options.apiKey });
    this.sttModel = options.sttModel ?? LIVE_MODEL_CANDIDATES[0];
    this.ttsModel = options.ttsModel ?? LIVE_MODEL_CANDIDATES[0];
    this.voiceName = options.voiceName ?? "Zephyr";
    this.onStatusChange = options.onStatusChange;
    this.onError = options.onError;
    this.onInterimTranscript = options.onInterimTranscript;
    this.onFinalTranscript = options.onFinalTranscript;
  }

  get callStatus(): GeminiLiveCallStatus {
    return this.status;
  }

  async start(): Promise<void> {
    if (this.status === "connecting" || this.status === "live") {
      return;
    }
    this.isStopping = false;
    this.setStatus("connecting");

    try {
      // Bring STT up first so call can become live quickly.
      this.sttSession = await withTimeout(this.connectSttSession(), 10_000, "Gemini STT connect timeout");
      await this.startMicrophoneCapture();
      this.setStatus("live");
    } catch (error) {
      await this.teardown();
      this.setStatus("error");
      this.reportError(
        error instanceof Error ? error.message : "Failed to start Gemini voice call.",
      );
      throw error;
    }
  }

  async stop(): Promise<void> {
    await this.teardown();
    this.interimTranscript = "";
    this.lastFinalTranscript = "";
    this.onInterimTranscript?.("");
    this.setStatus("idle");
  }

  async speak(text: string): Promise<void> {
    const prompt = text.trim();
    if (!prompt || this.status !== "live") {
      return;
    }

    if (!this.ttsSession) {
      try {
        this.ttsSession = await withTimeout(this.connectTtsSession(), 8_000, "Gemini TTS connect timeout");
      } catch (error) {
        this.reportError(error instanceof Error ? error.message : "Gemini TTS connect failed.");
        return;
      }
    }

    // sendClientContent with turnComplete triggers the model to generate an audio response.
    // sendRealtimeInput only handles media/audio blobs — text parts are silently dropped.
    this.ttsSession.sendClientContent({
      turns: [
        {
          role: "user",
          parts: [{ text: `Speak this naturally, preserving meaning and details:\n${prompt}` }],
        },
      ],
      turnComplete: true,
    });
  }

  private async connectSttSession(): Promise<Session> {
    return this.connectWithFallback([this.sttModel, ...LIVE_MODEL_CANDIDATES], (model) =>
      this.ai.live.connect({
        model,
        config: {
          responseModalities: [Modality.TEXT],
          inputAudioTranscription: {},
          // Keep STT path transcription-focused; OpenClaw remains the brain.
          systemInstruction:
            "Only transcribe user speech. Do not answer questions or add commentary.",
        },
        callbacks: {
          onmessage: (message) => {
            this.handleSttMessage(message);
          },
          onerror: () => {
            this.handleRuntimeError("Gemini STT session error.");
          },
          onclose: () => {
            if (this.status === "live" && !this.isStopping) {
              // STT closed but keep the class alive for TTS. Clean up mic
              // capture since there's nowhere to send audio, then notify the
              // hook so it can start the browser-STT fallback.
              this.sttSession = null;
              this.stopMicCapture();
              this.reportError("Gemini STT session closed.");
            }
          },
        },
      }),
    );
  }

  private async connectTtsSession(): Promise<Session> {
    return this.connectWithFallback([this.ttsModel, ...LIVE_MODEL_CANDIDATES], (model) =>
      this.ai.live.connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.voiceName,
              },
            },
          },
          outputAudioTranscription: {},
          systemInstruction:
            "You are a text-to-speech assistant. Read the user's text naturally and expressively. Do not add extra commentary.",
        },
        callbacks: {
          onmessage: (message) => {
            this.handleTtsMessage(message);
          },
          onerror: () => {
            this.handleRuntimeError("Gemini TTS session error.");
          },
          onclose: () => {
            if (this.status === "live" && !this.isStopping) {
              this.handleRuntimeError("Gemini TTS session closed.");
            }
          },
        },
      }),
    );
  }

  private async connectWithFallback(
    models: readonly string[],
    connect: (model: string) => Promise<Session>,
  ): Promise<Session> {
    const tried = new Set<string>();
    let lastError: unknown = null;

    for (const model of models) {
      if (!model || tried.has(model)) {
        continue;
      }
      tried.add(model);
      try {
        return await connect(model);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`Failed to connect Gemini Live for models: ${Array.from(tried).join(", ")}`);
  }

  private async startMicrophoneCapture(): Promise<void> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone capture is not supported in this browser.");
    }

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.captureContext = new AudioContext();
    await this.captureContext.resume();
    this.captureSource = this.captureContext.createMediaStreamSource(this.mediaStream);
    this.captureProcessor = this.captureContext.createScriptProcessor(
      SCRIPT_PROCESSOR_BUFFER_SIZE,
      1,
      1,
    );
    this.captureGainNode = this.captureContext.createGain();
    this.captureGainNode.gain.value = 0;

    this.captureProcessor.onaudioprocess = (event) => {
      // Grab a local ref — teardown may null the field between our check and use.
      const session = this.sttSession;
      if (!session || this.status !== "live" || this.isStopping) {
        return;
      }

      const input = event.inputBuffer.getChannelData(0);
      const pcm16 = downsampleFloat32ToPcm16(
        input,
        this.captureContext?.sampleRate ?? MIC_TARGET_SAMPLE_RATE,
        MIC_TARGET_SAMPLE_RATE,
      );

      if (pcm16.length === 0) {
        return;
      }

      try {
        // JS Live API accepts realtime chunks via media blob payload.
        session.sendRealtimeInput({
          media: {
            data: pcm16ToBase64(pcm16),
            mimeType: `audio/pcm;rate=${MIC_TARGET_SAMPLE_RATE}`,
          },
        });
      } catch {
        // Immediately stop local capture to avoid repeated send attempts while the
        // socket is already closing/closed.
        if (this.captureProcessor) {
          this.captureProcessor.onaudioprocess = null;
        }
        this.sttSession = null;
        this.handleRuntimeError("Gemini STT stream closed while sending audio.");
      }
    };

    this.captureSource.connect(this.captureProcessor);
    this.captureProcessor.connect(this.captureGainNode);
    this.captureGainNode.connect(this.captureContext.destination);
  }

  private handleSttMessage(message: LiveServerMessage): void {
    const transcript = normalizeTranscriptChunk(
      message.serverContent?.inputTranscription?.text,
    );

    if (transcript) {
      this.appendInterimTranscript(transcript);
    }

    const finished =
      Boolean(message.serverContent?.inputTranscription?.finished) ||
      String(message.voiceActivity?.voiceActivityType) === "ACTIVITY_END" ||
      Boolean(message.serverContent?.turnComplete);

    if (finished) {
      this.finalizeTranscript();
    }
  }

  private handleTtsMessage(message: LiveServerMessage): void {
    // Handle interruptions — stop all queued audio immediately.
    if (message.serverContent?.interrupted) {
      for (const src of this.activeSources) {
        try { src.stop(); } catch { /* already stopped */ }
      }
      this.activeSources.clear();
      this.playbackCursor = 0;
      return;
    }

    // Extract audio from the first part with inlineData.
    const base64Audio =
      message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      void this.enqueueAudioChunk(base64Audio, `audio/pcm;rate=${DEFAULT_TTS_SAMPLE_RATE}`);
    }
  }

  private appendInterimTranscript(chunk: string): void {
    if (this.interimTranscript.endsWith(chunk)) {
      return;
    }

    const needsSpace =
      this.interimTranscript.length > 0 &&
      !this.interimTranscript.endsWith(" ") &&
      !/^[.,!?;:]/.test(chunk);

    this.interimTranscript = `${this.interimTranscript}${needsSpace ? " " : ""}${chunk}`.trim();
    this.onInterimTranscript?.(this.interimTranscript);
  }

  private finalizeTranscript(): void {
    const finalText = this.interimTranscript.trim();
    this.interimTranscript = "";
    this.onInterimTranscript?.("");

    if (!finalText || finalText === this.lastFinalTranscript) {
      return;
    }

    this.lastFinalTranscript = finalText;
    this.onFinalTranscript?.(finalText);
  }

  private async enqueueAudioChunk(base64Data: string, mimeType: string): Promise<void> {
    const context = await this.ensurePlaybackContext();
    const sampleRate = parseSampleRate(mimeType, DEFAULT_TTS_SAMPLE_RATE);
    const float32 = decodeBase64Pcm16(base64Data);
    if (float32.length === 0) {
      return;
    }

    // copyToChannel expects a Float32Array backed by ArrayBuffer (not SharedArrayBuffer).
    const channelData = new Float32Array(float32.length);
    channelData.set(float32);
    const buffer = context.createBuffer(1, float32.length, sampleRate);
    buffer.copyToChannel(channelData, 0);

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);

    this.playbackCursor = Math.max(this.playbackCursor, context.currentTime);
    source.start(this.playbackCursor);
    this.playbackCursor += buffer.duration;

    this.activeSources.add(source);
    source.addEventListener("ended", () => {
      this.activeSources.delete(source);
    }, { once: true });
  }

  private async ensurePlaybackContext(): Promise<AudioContext> {
    if (!this.playbackContext) {
      // Match the Gemini TTS output sample rate for correct playback speed.
      this.playbackContext = new AudioContext({ sampleRate: DEFAULT_TTS_SAMPLE_RATE });
      await this.playbackContext.resume();
      this.playbackCursor = this.playbackContext.currentTime;
    }
    return this.playbackContext;
  }

  private stopMicCapture(): void {
    if (this.captureProcessor) {
      this.captureProcessor.onaudioprocess = null;
      this.captureProcessor.disconnect();
      this.captureProcessor = null;
    }
    if (this.captureSource) {
      this.captureSource.disconnect();
      this.captureSource = null;
    }
    if (this.captureGainNode) {
      this.captureGainNode.disconnect();
      this.captureGainNode = null;
    }
    if (this.captureContext) {
      void this.captureContext.close();
      this.captureContext = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
  }

  private async teardown(): Promise<void> {
    if (this.isStopping) {
      return;
    }
    this.isStopping = true;

    // Stop mic capture first so onaudioprocess can't race with session close.
    this.stopMicCapture();

    // Now safe to close sessions — no audio callbacks can race.
    const stt = this.sttSession;
    const tts = this.ttsSession;
    this.sttSession = null;
    this.ttsSession = null;

    try {
      stt?.close();
    } catch {
      // Ignore close errors.
    }
    try {
      tts?.close();
    } catch {
      // Ignore close errors.
    }

    for (const src of this.activeSources) {
      try { src.stop(); } catch { /* already stopped */ }
    }
    this.activeSources.clear();

    if (this.playbackContext) {
      await this.playbackContext.close();
      this.playbackContext = null;
      this.playbackCursor = 0;
    }

    this.isStopping = false;
  }

  private setStatus(status: GeminiLiveCallStatus): void {
    this.status = status;
    this.onStatusChange?.(status);
  }

  private handleRuntimeError(message: string): void {
    if (this.status === "error" || this.status === "idle") {
      return;
    }
    this.setStatus("error");
    this.reportError(message);
    void this.teardown();
  }

  private reportError(message: string): void {
    this.onError?.(message);
  }
}

function normalizeTranscriptChunk(text: string | undefined): string {
  if (!text) {
    return "";
  }
  return text.replace(/\s+/g, " ").trim();
}

function parseSampleRate(mimeType: string, fallback: number): number {
  const match = mimeType.match(/rate=(\d+)/i);
  if (!match) {
    return fallback;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function downsampleFloat32ToPcm16(
  source: Float32Array,
  sourceRate: number,
  targetRate: number,
): Int16Array {
  if (source.length === 0) {
    return new Int16Array(0);
  }

  if (sourceRate === targetRate) {
    return float32ToInt16(source);
  }

  const ratio = sourceRate / targetRate;
  const outputLength = Math.max(1, Math.round(source.length / ratio));
  const output = new Int16Array(outputLength);
  let sourceOffset = 0;

  for (let i = 0; i < outputLength; i += 1) {
    const nextSourceOffset = Math.min(
      source.length,
      Math.round((i + 1) * ratio),
    );
    let sum = 0;
    let count = 0;
    for (let j = sourceOffset; j < nextSourceOffset; j += 1) {
      sum += source[j];
      count += 1;
    }
    const average = count > 0 ? sum / count : 0;
    output[i] = toPcm16(average);
    sourceOffset = nextSourceOffset;
  }

  return output;
}

function float32ToInt16(source: Float32Array): Int16Array {
  const output = new Int16Array(source.length);
  for (let i = 0; i < source.length; i += 1) {
    output[i] = toPcm16(source[i]);
  }
  return output;
}

function toPcm16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
}

function pcm16ToBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function decodeBase64Pcm16(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const sampleCount = Math.floor(bytes.length / 2);
  const output = new Float32Array(sampleCount);
  const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let i = 0; i < sampleCount; i += 1) {
    output[i] = dataView.getInt16(i * 2, true) / 0x8000;
  }

  return output;
}
