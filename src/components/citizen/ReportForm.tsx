'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { 
  Camera, 
  Upload, 
  MapPin, 
  Send, 
  AlertTriangle, 
  CheckCircle2, 
  Info,
  Sparkles,
  FileText
} from 'lucide-react';
import { PriorityBadge } from '../ui/PriorityBadge';
import { AIAssessmentCard } from '../incident/AIAssessmentCard';
import { useAuth } from '@/context/auth-context';

const LocationPickerMap = dynamic(
  () => import('../map/LocationPickerMap').then((mod) => mod.LocationPickerMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-64 glass-panel rounded-xl flex items-center justify-center text-xs text-slate-500">
        Loading Location Picker Map...
      </div>
    ),
  }
);

const SIMULATED_EVIDENCE_PRESETS = [
  {
    label: 'Flooded Main Road (College Rd)',
    path: '/simulated-evidence/flood_college_road_1.svg',
    category: 'flood',
    lat: 22.9447,
    lng: 90.8282,
    desc: 'College Road submerged in 3.5ft water. Traffic halted, drainage overflowing.',
    need: 'High-capacity water dewatering pumps and police traffic diversion.',
    danger: 'no',
    people: 25,
  },
  {
    label: 'Fallen 11kV Pole & Conductor',
    path: '/simulated-evidence/fallen_pole_1.svg',
    category: 'electrical_hazard',
    lat: 22.9449,
    lng: 90.8284,
    desc: 'Concrete electrical pole snapped across walkway into water with sparks popping.',
    need: 'Emergency grid power shutoff and electrical line repair crew.',
    danger: 'yes',
    people: 40,
  },
  {
    label: 'Commercial Building Structural Collapse',
    path: '/simulated-evidence/building_collapse_1.svg',
    category: 'building_damage',
    lat: 22.9410,
    lng: 90.8250,
    desc: 'Ground floor pillars failed; front facade crumbled. Shop occupants suspected trapped.',
    need: 'Urban search & rescue teams, hydraulic jacks, multiple ambulances.',
    danger: 'yes',
    people: 12,
  },
];

export const ReportForm: React.FC<{ onSuccess?: () => void }> = ({ onSuccess }) => {
  const { currentProfile } = useAuth();
  const [imagePath, setImagePath] = useState<string>('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [description, setDescription] = useState<string>('');
  const [assistanceNeeded, setAssistanceNeeded] = useState<string>('');
  const [sourceType, setSourceType] = useState<'on_site' | 'field_report' | 'news_public'>('on_site');
  const [immediateDanger, setImmediateDanger] = useState<'yes' | 'no' | 'unknown'>('no');
  const [reportedPeopleAffected, setReportedPeopleAffected] = useState<number | ''>('');
  
  // Incident coordinates vs Reporter coordinates
  const [incidentCoords, setIncidentCoords] = useState<{ lat: number; lng: number }>({
    lat: 22.9447,
    lng: 90.8282,
  });
  const [reporterCoords, setReporterCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // File Upload Handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please upload a valid image file (PNG, JPG, WebP, SVG).');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setErrorMessage('File size exceeds 8MB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setImagePath(base64);
      setImagePreview(base64);
      setErrorMessage(null);
    };
    reader.readAsDataURL(file);
  };

  // Preset selector for instant simulated testing
  const handleSelectPreset = (preset: typeof SIMULATED_EVIDENCE_PRESETS[0]) => {
    setImagePath(preset.path);
    setImagePreview(preset.path);
    setDescription(preset.desc);
    setAssistanceNeeded(preset.need);
    setImmediateDanger(preset.danger as any);
    setReportedPeopleAffected(preset.people);
    setIncidentCoords({ lat: preset.lat, lng: preset.lng });
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imagePath) {
      setErrorMessage('Please capture, upload, or select an incident photograph.');
      return;
    }
    if (!description || description.trim().length < 10) {
      setErrorMessage('Description must be at least 10 characters.');
      return;
    }
    if (!assistanceNeeded || assistanceNeeded.trim().length < 3) {
      setErrorMessage('Please describe assistance requirements.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const payload = {
        reporterId: currentProfile.id,
        imagePath,
        description,
        incidentLatitude: incidentCoords.lat,
        incidentLongitude: incidentCoords.lng,
        reporterLatitude: reporterCoords ? reporterCoords.lat : null,
        reporterLongitude: reporterCoords ? reporterCoords.lng : null,
        sourceType,
        assistanceNeeded,
        reportedPeopleAffected: reportedPeopleAffected === '' ? null : Number(reportedPeopleAffected),
        immediateDanger,
      };

      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to submit disaster report');
      }

      setSubmitResult(data);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Submission error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Submission Success Screen */}
      {submitResult ? (
        <div className="p-6 rounded-2xl glass-panel-elevated border border-emerald-500/40 space-y-5 animate-in fade-in">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Report received for triage</h2>
              <p className="text-xs text-slate-400 font-mono">
                Report ID: {submitResult.report.id} • Incident Record: #{submitResult.incident.id.slice(0, 8)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Deterministic Priority Score
              </span>
              <PriorityBadge
                band={submitResult.incident.priority_band}
                score={submitResult.incident.priority_score}
                size="lg"
              />
              <p className="text-xs text-slate-300 mt-2">
                Score: <span className="font-mono font-bold text-sky-400">{submitResult.incident.priority_score}/100</span>
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Assigned Department Recommendation
              </span>
              <p className="text-sm font-semibold text-white">
                {submitResult.incident.primary_department?.name || 'Control Room Coordination'}
              </p>
              <p className="text-xs text-slate-400">
                Status: <span className="text-amber-400">Awaiting control room review and dispatch</span>
              </p>
            </div>
          </div>

          {submitResult.duplicateCandidates && submitResult.duplicateCandidates.length > 0 && (
            <div className="p-3 rounded-xl bg-blue-950/20 border border-blue-500/30 text-xs text-blue-300">
              <span className="font-bold">Duplicate Correlator: </span>
              Identified {submitResult.duplicateCandidates.length} nearby incident(s) for control room correlation. Reports remain separate until reviewed.
            </div>
          )}

          {submitResult.aiAssessment && (
            <AIAssessmentCard
              assessment={submitResult.aiAssessment}
              confidence={submitResult.incident.ai_confidence}
            />
          )}
          {submitResult.aiWarning && <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-sm text-amber-200">AI assessment unavailable. Your report was saved for manual review.</p>}

          <button
            type="button"
            onClick={() => {
              setSubmitResult(null);
              setImagePath('');
              setImagePreview(null);
              setDescription('');
              setAssistanceNeeded('');
              setImmediateDanger('no');
              setReportedPeopleAffected('');
              setReporterCoords(null);
            }}
            className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl text-sm transition-colors"
          >
            Submit Another Disaster Report
          </button>
        </div>
      ) : (
        /* Citizen Reporting Form */
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 rounded-2xl glass-panel border border-slate-800 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-sky-400" />
              Citizen Emergency Report Form
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Submit photographs and geotagged observations of localized hazards. Reports feed directly into the Control Room ranked dispatch queue.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/40 text-xs text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Quick Preset Buttons for Testing */}
          <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 space-y-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              Quick Simulated Scenarios (Pre-loaded Field Imagery)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SIMULATED_EVIDENCE_PRESETS.map((preset, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className="text-left p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/40 text-xs text-slate-300 transition-all"
                >
                  <span className="font-semibold text-white block">{preset.label}</span>
                  <span className="text-[10px] text-slate-400 font-mono">{preset.lat}, {preset.lng}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Photograph Upload & Preview */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
              1. Incident Photograph (Required)
            </label>

            {imagePreview ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-black max-h-56">
                <img
                  src={imagePreview}
                  alt="Incident preview"
                  className="w-full h-48 object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    setImagePath('');
                    setImagePreview(null);
                  }}
                  className="absolute top-2 right-2 px-2 py-1 rounded bg-black/70 text-slate-300 hover:text-white text-xs"
                >
                  Change Photo
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-sky-400/60 rounded-xl p-6 cursor-pointer bg-slate-950/40 hover:bg-slate-900/40 transition-colors">
                <Camera className="w-8 h-8 text-sky-400 mb-2" />
                <span className="text-xs font-semibold text-white">Choose a disaster photo</span>
                <span className="text-[11px] text-slate-400 mt-1">PNG, JPG, WebP, SVG up to 8MB</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Description & Assistance */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                2. Incident Description (Required)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe visible damage, depth of water, trapped civilians, active sparking..."
                className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
                rows={3}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                3. Assistance Required (Required)
              </label>
              <textarea
                value={assistanceNeeded}
                onChange={(e) => setAssistanceNeeded(e.target.value)}
                placeholder="Specify emergency capability required: dewatering pumps, line isolation, boats, ambulance..."
                className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
                rows={3}
                required
              />
            </div>
          </div>

          {/* Location Picker Section */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
              4. Incident Hazard Coordinates (Required)
            </label>
            <LocationPickerMap
              initialLat={incidentCoords.lat}
              initialLng={incidentCoords.lng}
              onLocationChange={(lat, lng) => setIncidentCoords({ lat, lng })}
              onReporterLocationFound={(lat, lng) => setReporterCoords({ lat, lng })}
            />
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div>
              <label className="text-[11px] font-medium text-slate-400 block mb-1">
                Report Source:
              </label>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as any)}
                className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
              >
                <option value="on_site">On-Site Eyewitness</option>
                <option value="field_report">Official Field Responder</option>
                <option value="news_public">News / Public Social Media</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-400 block mb-1">
                Immediate Danger to Life:
              </label>
              <select
                value={immediateDanger}
                onChange={(e) => setImmediateDanger(e.target.value as any)}
                className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
              >
                <option value="no">No Immediate Threat</option>
                <option value="yes">YES — Active Threat</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-400 block mb-1">
                Approx. People Affected:
              </label>
              <input
                type="number"
                min="0"
                value={reportedPeopleAffected}
                onChange={(e) => setReportedPeopleAffected(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Leave blank if unknown"
                className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
              >
              </input>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl text-sm transition-all shadow-glow flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>{isSubmitting ? 'Submitting & Triage Processing...' : 'Submit Emergency Report'}</span>
          </button>
        </form>
      )}
    </div>
  );
};
