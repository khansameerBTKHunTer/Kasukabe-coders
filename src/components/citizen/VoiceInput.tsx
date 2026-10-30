"use client";
import { useEffect, useRef, useState } from "react";
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
export function VoiceInput({
  onTranscript,
  label,
}: {
  onTranscript: (text: string) => void;
  label: string;
}) {
  const [supported, setSupported] = useState(false),
    [listening, setListening] = useState(false),
    [error, setError] = useState("");
  const instance = useRef<Recognition | null>(null);
  const callback = useRef(onTranscript);
  callback.current = onTranscript;
  useEffect(() => {
    const w = window as SpeechWindow;
    setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => {
      if (instance.current) {
        instance.current.onend = null;
        instance.current.onerror = null;
        instance.current.onresult = null;
        instance.current.abort();
      }
    };
  }, []);
  const toggle = () => {
    if (listening) {
      instance.current?.stop();
      return;
    }
    const w = window as SpeechWindow,
      Constructor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Constructor) return;
    const recognition = new Constructor();
    instance.current = recognition;
    recognition.lang = navigator.language;
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) =>
      callback.current(
        Array.from(event.results)
          .map((result) => result[0].transcript)
          .join(" "),
      );
    recognition.onerror = (event) => {
      setError(
        event.error === "not-allowed"
          ? "Microphone permission denied. You can continue typing."
          : "Speech could not be captured. Retry or continue typing.",
      );
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    setError("");
    try {
      recognition.start();
      setListening(true);
    } catch {
      setError("Voice input could not start. Continue typing or retry.");
    }
  };
  return (
    <div className="mt-1 text-xs">
      {supported ? (
        <button
          type="button"
          aria-pressed={listening}
          onClick={toggle}
          className="rounded border border-slate-300 px-2 py-1 text-blue-700"
        >
          {listening ? "Stop listening" : `Dictate ${label}`}
        </button>
      ) : (
        <span className="text-slate-500">
          Voice input is unavailable in this browser. Type your response.
        </span>
      )}
      {listening && (
        <span role="status" className="ml-2 text-blue-700">
          Listening… You can edit the transcript.
        </span>
      )}
      {error && (
        <p role="alert" className="mt-1 text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
