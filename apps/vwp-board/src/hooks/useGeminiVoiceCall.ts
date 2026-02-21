"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "@/types/chat";
import {
  GeminiLiveVoice,
  type GeminiLiveCallStatus,
} from "@/lib/voice/geminiLiveVoice";
import { useChatStore } from "@/store/chat-store";

export interface GeminiVoiceCallState {
  status: GeminiLiveCallStatus;
  error: string | null;
  interimTranscript: string;
  supported: boolean;
  active: boolean;
  startCall: () => Promise<void>;
  stopCall: () => Promise<void>;
  toggleCall: () => Promise<void>;
}

function lastAssistantMessage(messages: ChatMessage[]): ChatMessage | undefined {
  return [...messages]
    .toReversed()
    .find((message) => message.role === "assistant" && message.content.trim().length > 0);
}

export function useGeminiVoiceCall(): GeminiVoiceCallState {
  const sendMessage = useChatStore((s) => s.sendMessage);
  const setVoiceModeEnabled = useChatStore((s) => s.setVoiceModeEnabled);
  const messages = useChatStore((s) => s.messages);

  const [status, setStatus] = useState<GeminiLiveCallStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState("");

  const controllerRef = useRef<GeminiLiveVoice | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SpeechRecognition has no standard type
  const recognitionRef = useRef<any>(null);
  const lastSpokenAssistantIdRef = useRef<string | null>(null);
  const fallbackActiveRef = useRef(false);

  const speechRecognitionSupported = useMemo(() => {
    if (typeof window === "undefined") {return false;}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- browser vendor-prefixed API
    return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }, []);

  const supported = useMemo(() => {
    if (typeof navigator === "undefined") {
      return false;
    }
    return Boolean(typeof navigator.mediaDevices?.getUserMedia === "function" || speechRecognitionSupported);
  }, [speechRecognitionSupported]);

  const stopBrowserFallback = useCallback(() => {
    fallbackActiveRef.current = false;
    try {
      recognitionRef.current?.stop?.();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
  }, []);

  const startBrowserFallback = useCallback(() => {
    if (!speechRecognitionSupported || fallbackActiveRef.current) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- browser vendor-prefixed API
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) {return;}

    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    fallbackActiveRef.current = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SpeechRecognition event type
    recognition.onresult = (event: any) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i]?.[0]?.transcript ?? "";
        if (event.results[i].isFinal) {
          finalText += `${transcript} `;
        } else {
          interimText += `${transcript} `;
        }
      }

      const trimmedInterim = interimText.trim();
      setInterimTranscript(trimmedInterim);

      const trimmedFinal = finalText.trim();
      if (trimmedFinal) {
        setInterimTranscript("");
        void sendMessage(trimmedFinal);
      }
    };

    recognition.addEventListener("error", () => {
      // Keep fallback resilient; avoid surfacing noisy errors to user.
    });

    recognition.onend = () => {
      if (!fallbackActiveRef.current) {
        return;
      }
      try {
        recognition.start();
      } catch {
        // If restart fails, stop fallback quietly.
        fallbackActiveRef.current = false;
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      fallbackActiveRef.current = false;
      recognitionRef.current = null;
    }
  }, [sendMessage, speechRecognitionSupported]);

  const stopCall = useCallback(async (): Promise<void> => {
    const controller = controllerRef.current;
    controllerRef.current = null;
    if (controller) {
      await controller.stop();
    }
    stopBrowserFallback();
    setVoiceModeEnabled(false);
    setInterimTranscript("");
    setError(null);
    setStatus("idle");
  }, [setVoiceModeEnabled, stopBrowserFallback]);

  const startCall = useCallback(async (): Promise<void> => {
    if (controllerRef.current || status === "connecting" || status === "live") {
      return;
    }

    if (!supported) {
      setStatus("error");
      setError("Voice input is not supported in this browser.");
      return;
    }

    const latestAssistant = lastAssistantMessage(messages);
    lastSpokenAssistantIdRef.current = latestAssistant?.id ?? null;
    setError(null);
    setInterimTranscript("");

    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY?.trim() ?? "";
    if (!apiKey) {
      // No Gemini key: run STT-only browser fallback and keep chat usable.
      startBrowserFallback();
      setVoiceModeEnabled(true);
      setStatus("live");
      return;
    }

    const controller = new GeminiLiveVoice({
      apiKey,
      onStatusChange: (nextStatus) => {
        setStatus(nextStatus);
      },
      onError: (message) => {
        // Root-cause fallback: if Gemini STT closes on startup, keep voice mode alive
        // via browser STT and avoid visible error state for the user.
        if (message.toLowerCase().includes("stt session closed")) {
          startBrowserFallback();
          setStatus("live");
          setError(null);
          setVoiceModeEnabled(true);
          return;
        }
        setError(message);
      },
      onInterimTranscript: (text) => {
        setInterimTranscript(text);
      },
      onFinalTranscript: (text) => {
        if (!text.trim()) {
          return;
        }
        void sendMessage(text);
      },
    });

    controllerRef.current = controller;
    try {
      await Promise.race([
        controller.start(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Gemini live start timeout")), 12_000),
        ),
      ]);
      setVoiceModeEnabled(true);
    } catch {
      controllerRef.current = null;
      try {
        await controller.stop();
      } catch {
        // ignore
      }
      // If Gemini start fails/hangs, automatically fall back to browser STT.
      startBrowserFallback();
      setVoiceModeEnabled(true);
      setStatus("live");
      setError(null);
    }
  }, [messages, sendMessage, setVoiceModeEnabled, speechRecognitionSupported, startBrowserFallback, status, supported]);

  const toggleCall = useCallback(async (): Promise<void> => {
    if (status === "live" || status === "connecting") {
      await stopCall();
      return;
    }
    await startCall();
  }, [startCall, status, stopCall]);

  useEffect(() => {
    if (status !== "live") {
      return;
    }

    const latestAssistant = lastAssistantMessage(messages);
    if (!latestAssistant || latestAssistant.id === lastSpokenAssistantIdRef.current) {
      return;
    }

    lastSpokenAssistantIdRef.current = latestAssistant.id;
    void controllerRef.current?.speak(latestAssistant.content);
  }, [messages, status]);

  useEffect(() => {
    return () => {
      const controller = controllerRef.current;
      controllerRef.current = null;
      if (controller) {
        void controller.stop();
      }
      stopBrowserFallback();
    };
  }, [stopBrowserFallback]);

  return {
    status,
    error,
    interimTranscript,
    supported,
    active: status === "live" || status === "connecting",
    startCall,
    stopCall,
    toggleCall,
  };
}
