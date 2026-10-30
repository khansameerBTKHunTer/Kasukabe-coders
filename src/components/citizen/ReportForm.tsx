"use client";
import Image from "next/image";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  Camera,
  Check,
  ImagePlus,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import { LocationPickerMap } from "../map/LocationPickerMap";
import { VoiceInput } from "./VoiceInput";
import { uploadPhoto } from "@/lib/upload-client";
import { useAuth } from "@/context/auth-context";
import { PriorityBadge } from "../ui/PriorityBadge";
import { AIAssessmentCard } from "../incident/AIAssessmentCard";
import type { AIAssessment } from "@/types";
type Photo = { imagePath: string; previewUrl: string; storage: string };
type AIState = "idle" | "uploading" | "analyzing" | "ready" | "error";
const input =
  "mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
export function ReportForm({ onSuccess }: { onSuccess?: () => void }) {
  const { currentProfile, isDemo } = useAuth();
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState("");
  const [savedPhoto, setSavedPhoto] = useState<Photo | null>(null);
  const [description, setDescription] = useState(""),
    [assistance, setAssistance] = useState("");
  const [incident, setIncident] = useState<{ lat: number; lng: number } | null>(
      null,
    ),
    [reporter, setReporter] = useState<{ lat: number; lng: number } | null>(
      null,
    );
  const [source, setSource] = useState("on_site"),
    [danger, setDanger] = useState("unknown"),
    [people, setPeople] = useState("");
  const [aiState, setAIState] = useState<AIState>("idle"),
    [aiError, setAIError] = useState(""),
    [assessment, setAssessment] = useState<AIAssessment | null>(null);
  const [suggestions, setSuggestions] = useState<{
    description: string;
    assistanceNeeded: string;
  } | null>(null);
  const [vision, setVision] = useState<{
    model: string;
    configured: boolean;
  } | null>(null);
  const [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [submitting, setSubmitting] = useState(false),
    [result, setResult] = useState<any>(null);
  const dirty = useRef({ description: false, assistance: false });
  const lock = useRef(false),
    generation = useRef(0),
    controller = useRef<AbortController | null>(null);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  const uploadJob = useRef<Promise<Photo> | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/ai/analyze", { signal: abort.signal, cache: "no-store" })
      .then(async (response) => {
        if (response.ok) setVision(await response.json());
      })
      .catch(() => {});
    return () => {
      abort.abort();
      controller.current?.abort();
      invalidate();
    };
  }, [invalidate]);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const analyze = async (
    photo: Photo,
    version: number,
    signal: AbortSignal,
  ) => {
    if (version !== generation.current || signal.aborted) return;
    setAIState("analyzing");
    setAIError("");
    try {
      const response = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64OrUrl: photo.imagePath }),
        signal,
      });
      const data = await response.json();
      if (version !== generation.current || signal.aborted) return;
      if (
        !response.ok ||
        !data.success ||
        !data.assessment ||
        !data.suggestions?.description ||
        !data.suggestions?.assistanceNeeded
      )
        throw new Error(
          data.error ||
            "The image could not be analyzed. Retry or enter the details yourself.",
        );
      setAssessment(data.assessment);
      setSuggestions(data.suggestions);
      setAIState("ready");
      if (data.model) setVision({ model: data.model, configured: true });
      if (!dirty.current.description)
        setDescription(data.suggestions.description);
      if (!dirty.current.assistance)
        setAssistance(data.suggestions.assistanceNeeded);
    } catch (error) {
      if (version === generation.current && !signal.aborted) {
        setAIState("error");
        setAIError(
          error instanceof Error
            ? error.message
            : "Analysis failed. You can still enter the details yourself.",
        );
      }
    }
  };
  const select = (event: React.ChangeEvent<HTMLInputElement>) => {
    const photo = event.target.files?.[0];
    if (!photo) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(photo.type) ||
      !photo.size ||
      photo.size > 8 * 1024 * 1024
    ) {
      setError("Choose a JPEG, PNG, or WebP photograph up to 8 MB.");
      event.target.value = "";
      return;
    }
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const version = ++generation.current;
    setFile(photo);
    setSavedPhoto(null);
    setAssessment(null);
    setSuggestions(null);
    setAIError("");
    setError("");
    setAIState("uploading");
    setProgress(0);
    if (!dirty.current.description) setDescription("");
    if (!dirty.current.assistance) setAssistance("");
    const pending = uploadPhoto(
      photo,
      (percent) => {
        if (version === generation.current) setProgress(percent);
      },
      abort.signal,
    );
    uploadJob.current = pending;
    void pending
      .then((uploaded) => {
        if (version !== generation.current || abort.signal.aborted) return;
        setSavedPhoto(uploaded);
        return analyze(uploaded, version, abort.signal);
      })
      .catch((error) => {
        if (version === generation.current && !abort.signal.aborted) {
          setAIState("error");
          setAIError(
            error.message ||
              "Photo upload failed. Choose the photo again to retry.",
          );
        }
      });
  };
  const retry = () => {
    if (!file || ["uploading", "analyzing"].includes(aiState)) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const version = ++generation.current;
    if (savedPhoto) {
      void analyze(savedPhoto, version, abort.signal);
      return;
    }
    setAIState("uploading");
    setAIError("");
    setProgress(0);
    const pending = uploadPhoto(file, setProgress, abort.signal);
    uploadJob.current = pending;
    void pending
      .then((photo) => {
        if (version !== generation.current) return;
        setSavedPhoto(photo);
        return analyze(photo, version, abort.signal);
      })
      .catch((error) => {
        if (!abort.signal.aborted) {
          setAIState("error");
          setAIError(error.message);
        }
      });
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    setError("");
    if (!currentProfile) {
      setError("Your session is unavailable. Sign in again.");
      return;
    }
    if (!file) {
      setError("Choose an incident photograph.");
      return;
    }
    if (!incident) {
      setError(
        "Select the incident on the map or use your live device location.",
      );
      return;
    }
    if (description.trim().length < 10 || assistance.trim().length < 3) {
      setError(
        "Review the AI suggestions or describe the visible damage and assistance needed.",
      );
      return;
    }
    if (people && (!Number.isInteger(Number(people)) || Number(people) < 0)) {
      setError("People affected must be a whole number of zero or more.");
      return;
    }
    lock.current = true;
    setSubmitting(true);
    try {
      let photo = savedPhoto;
      if (!photo) {
        if (!uploadJob.current)
          throw new Error("Choose the photograph again to upload it.");
        photo = await uploadJob.current;
      }
      const response = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reporterId: currentProfile.id,
          imagePath: photo.imagePath,
          description: description.trim(),
          assistanceNeeded: assistance.trim(),
          incidentLatitude: incident.lat,
          incidentLongitude: incident.lng,
          reporterLatitude: reporter?.lat ?? null,
          reporterLongitude: reporter?.lng ?? null,
          sourceType: source,
          immediateDanger: danger,
          reportedPeopleAffected: people ? Number(people) : null,
        }),
      });
      const data = await response.json();
      if (
        !response.ok ||
        !data.success ||
        !data.report?.id ||
        !data.incident?.id ||
        data.report.reporter_id !== currentProfile.id
      )
        throw new Error(
          data.error ||
            "Your report was not acknowledged. Your entries have been kept.",
        );
      controller.current?.abort();
      generation.current++;
      setResult(data);
      onSuccess?.();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Submission failed. Your entries have been kept.",
      );
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  };
  const modelLabel =
    vision?.model === "gemini-3.5-flash-lite"
      ? "Gemini 3.5 Flash-Lite"
      : ["google/gemini-2.5-flash", "gemini-2.5-flash"].includes(
            vision?.model || "",
          )
        ? "Gemini 2.5 Flash"
        : vision?.model?.split("/").pop() || "Vision AI";

  if (result)
    return (
      <section className="report-card min-h-[65vh] flex flex-col items-center justify-center gap-5 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <Check size={28} />
        </span>
        <h2 className="text-2xl font-semibold">Report received for triage</h2>
        <p role="status" className="text-sm text-slate-500">
          Report ID: {result.report.id}
        </p>
        {isDemo && (
          <p className="text-xs text-amber-700">
            Saved to the temporary demo repository.
          </p>
        )}
        <PriorityBadge
          band={result.incident.priority_band}
          score={result.incident.priority_score}
        />
        <p className="max-w-lg text-sm text-slate-500">
          {result.incident.routing_decision?.mode === "automatic"
            ? "Response teams have been assigned automatically and are awaiting acknowledgement. Admins will verify completed work."
            : "Your report needs admin review before response teams are assigned."}
        </p>
        {result.aiAssessment && (
          <div className="w-full max-w-3xl text-left">
            <AIAssessmentCard
              assessment={result.aiAssessment}
              confidence={result.incident.ai_confidence}
            />
          </div>
        )}
        {result.aiWarning && (
          <p className="text-sm text-amber-700">
            AI assessment unavailable. Your report was received for human
            review.
          </p>
        )}
        <button
          className="primary-button"
          onClick={() => {
            setResult(null);
            setFile(null);
            setSavedPhoto(null);
            uploadJob.current = null;
            setDescription("");
            setAssistance("");
            dirty.current = { description: false, assistance: false };
            setIncident(null);
            setReporter(null);
            setPeople("");
            setDanger("unknown");
            setAssessment(null);
            setSuggestions(null);
            setAIState("idle");
          }}
        >
          Submit another report
        </button>
      </section>
    );
  return (
    <form onSubmit={submit} className="report-workspace" aria-busy={submitting}>
      <div className="report-main space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Citizen reporting</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              Report an incident
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Add a photo. Review the AI suggestions. Confirm the location.
            </p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700">
            <Sparkles size={13} />
            {modelLabel}
          </span>
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        <div className="report-card">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">01 / Evidence & observations</p>
              <h2 className="mt-1 text-lg font-semibold">What happened?</h2>
            </div>
            <Camera size={21} className="text-blue-600" />
          </div>
          <fieldset
            disabled={submitting}
            className="report-main-grid min-w-0 disabled:opacity-70"
          >
            <div className="min-w-0 space-y-4">
              <label
                htmlFor="incident-photo"
                className={`photo-dropzone ${preview ? "has-photo" : ""}`}
              >
                {preview ? (
                  <Image
                    unoptimized
                    src={preview}
                    width={900}
                    height={700}
                    alt="Locally selected incident photograph"
                    className="photo-preview"
                  />
                ) : (
                  <span className="flex flex-col items-center gap-3 text-center">
                    <span className="rounded-2xl bg-blue-50 p-4 text-blue-600">
                      <ImagePlus size={30} />
                    </span>
                    <strong className="text-sm font-semibold text-slate-700">
                      Choose an incident photograph
                    </strong>
                    <span className="text-xs text-slate-400">
                      JPEG, PNG or WebP · up to 8 MB
                    </span>
                  </span>
                )}
                {preview && <span className="photo-change">Change photo</span>}
                <span className="sr-only">Incident photograph</span>
                <input
                  id="incident-photo"
                  aria-label="Incident photograph"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={select}
                  className="sr-only"
                />
              </label>
              <div
                className="flex items-center gap-2 text-xs text-slate-500"
                role="status"
              >
                {["uploading", "analyzing"].includes(aiState) ? (
                  <Loader2 size={14} className="animate-spin text-blue-600" />
                ) : (
                  <Check
                    size={14}
                    className={
                      savedPhoto ? "text-emerald-600" : "text-slate-300"
                    }
                  />
                )}
                <span>
                  {aiState === "uploading"
                    ? `Uploading photo · ${progress}%`
                    : aiState === "analyzing"
                      ? "Analyzing visible damage and assistance…"
                      : savedPhoto
                        ? "Photo uploaded · report not submitted yet"
                        : file
                          ? "Selected locally; not uploaded yet"
                          : "AI suggestions begin after you select a photo"}
                </span>
              </div>
              {aiState === "uploading" && (
                <progress
                  aria-label="Photograph upload progress"
                  max={100}
                  value={progress}
                  className="h-1 w-full accent-blue-600"
                />
              )}
              <p className="text-[11px] leading-relaxed text-slate-400">
                The selected image is sent to your configured vision provider
                for analysis. Review every suggestion before submitting.
              </p>
              {aiError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p
                    role="status"
                    className="text-xs leading-relaxed text-amber-800"
                  >
                    {aiError}
                  </p>
                  <button
                    type="button"
                    onClick={retry}
                    className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-800"
                  >
                    <RefreshCw size={12} />
                    Retry photo analysis
                  </button>
                </div>
              )}
              {assessment && (
                <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1 font-semibold text-blue-700">
                      <Sparkles size={13} />
                      Image assessment
                    </span>
                    <span className="text-slate-500">
                      {Math.round(assessment.confidence * 100)}% confidence
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="assessment-chip">
                      {assessment.category.replaceAll("_", " ")}
                    </span>
                    <span className="assessment-chip">
                      {assessment.severity} severity
                    </span>
                  </div>
                  {assessment.secondary_hazards.length > 0 && (
                    <p className="text-xs leading-relaxed text-slate-600">
                      <strong>Potential secondary hazards: </strong>
                      {assessment.secondary_hazards
                        .map((item) => item.replaceAll("_", " "))
                        .join(", ")}
                    </p>
                  )}
                  {assessment.uncertainties.length > 0 && (
                    <p className="text-xs leading-relaxed text-slate-500">
                      <strong>To verify: </strong>
                      {assessment.uncertainties.join("; ")}
                    </p>
                  )}
                  <p className="text-[11px] text-blue-700">
                    AI-assisted assessment · human review required
                  </p>
                </div>
              )}
            </div>
            <div className="min-w-0 space-y-5">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="description"
                    className="text-sm font-semibold"
                  >
                    Visible damage
                  </label>
                  {suggestions && (
                    <button
                      type="button"
                      onClick={() => {
                        dirty.current.description = false;
                        setDescription(suggestions.description);
                      }}
                      className="text-[11px] font-medium text-blue-600"
                    >
                      Use AI suggestion
                    </button>
                  )}
                </div>
                <textarea
                  id="description"
                  required
                  minLength={10}
                  rows={5}
                  placeholder="The AI will suggest a description from your photo. You can also type your own observations."
                  value={description}
                  onChange={(event) => {
                    dirty.current.description = true;
                    setDescription(event.target.value);
                  }}
                  className={input}
                />
                <VoiceInput
                  label="visible damage"
                  onTranscript={(text) => {
                    dirty.current.description = true;
                    setDescription((old) => `${old}${old ? " " : ""}${text}`);
                  }}
                />
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="assistance" className="text-sm font-semibold">
                    Assistance required
                  </label>
                  {suggestions && (
                    <button
                      type="button"
                      onClick={() => {
                        dirty.current.assistance = false;
                        setAssistance(suggestions.assistanceNeeded);
                      }}
                      className="text-[11px] font-medium text-blue-600"
                    >
                      Use AI suggestion
                    </button>
                  )}
                </div>
                <textarea
                  id="assistance"
                  required
                  minLength={3}
                  rows={5}
                  placeholder="Suggested response capabilities will appear here. Add any details you know."
                  value={assistance}
                  onChange={(event) => {
                    dirty.current.assistance = true;
                    setAssistance(event.target.value);
                  }}
                  className={input}
                />
                <VoiceInput
                  label="assistance"
                  onTranscript={(text) => {
                    dirty.current.assistance = true;
                    setAssistance((old) => `${old}${old ? " " : ""}${text}`);
                  }}
                />
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
                <strong className="font-semibold text-slate-600">
                  Report what you can observe.
                </strong>{" "}
                AI may be wrong about hidden hazards, building safety, or people
                affected. Add your own context and keep uncertain details
                explicit.
              </div>
            </div>
          </fieldset>
        </div>
        <div className="report-card">
          <p className="eyebrow">03 / Additional context</p>
          <fieldset
            disabled={submitting}
            className="mt-4 grid gap-4 sm:grid-cols-3"
          >
            <label className="text-xs font-medium text-slate-600">
              Report source
              <select
                value={source}
                onChange={(event) => setSource(event.target.value)}
                className={input}
              >
                <option value="on_site">On-site eyewitness</option>
                <option value="field_report">Field report</option>
                <option value="news_public">News / public source</option>
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">
              Immediate danger
              <select
                value={danger}
                onChange={(event) => setDanger(event.target.value)}
                className={input}
              >
                <option value="unknown">Unknown</option>
                <option value="yes">Yes — active threat</option>
                <option value="no">No immediate threat</option>
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">
              People affected (optional)
              <input
                type="number"
                min={0}
                step={1}
                placeholder="If known"
                value={people}
                onChange={(event) => setPeople(event.target.value)}
                className={input}
              />
            </label>
          </fieldset>
        </div>
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center">
          <p className="max-w-xl text-xs leading-relaxed text-slate-500">
            Clear routine reports are assigned automatically. Cases needing coordination go to an admin. Teams must acknowledge their tasks before responding.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="primary-button flex shrink-0 items-center justify-center gap-2 py-3"
          >
            <Send size={15} />
            {submitting ? "Submitting report…" : "Submit Emergency Report"}
          </button>
        </div>
      </div>
      <LocationPickerMap
        initialLat={incident?.lat}
        initialLng={incident?.lng}
        onLocationChange={(lat, lng) => setIncident({ lat, lng })}
        onReporterLocationFound={(lat, lng) => setReporter({ lat, lng })}
      />
    </form>
  );
}
