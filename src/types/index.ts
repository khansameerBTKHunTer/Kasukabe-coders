export type UserRole =
  "citizen" | "fire_rescue" | "electricity" | "municipal" | "medical" | "relief_responder" | "admin";

export type IncidentCategory =
  | "flood"
  | "building_damage"
  | "electrical_hazard"
  | "fire"
  | "landslide"
  | "road_blockage"
  | "medical_emergency"
  | "other";

export type SeverityLevel = "critical" | "high" | "medium" | "low";

export type PriorityBand = "Critical" | "High" | "Medium" | "Low";

export type VerificationStatus =
  "unverified" | "verified" | "flagged" | "rejected";

export type IncidentStatus =
  "open" | "assigned" | "in_progress" | "pending_verification" | "resolved" | "closed";

export type AssignmentStatus =
  | "pending"
  | "acknowledged"
  | "en_route"
  | "on_site"
  | "in_progress"
  | "resolved"
  | "rejected";

export type SourceType = "on_site" | "field_report" | "news_public";

export type ImmediateDanger = "yes" | "no" | "unknown";

export interface Department {
  id: string;
  name: string;
  code: string;
  capabilities: string[];
  created_at?: string;
}

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface Profile {
  id: string;
  email?: string;
  display_name: string;
  role: UserRole;
  approval_status: ApprovalStatus;
  department_id?: string | null;
  department?: Department | null;
  created_at?: string;
}

export interface AIAssessment {
  category: IncidentCategory;
  title: string;
  visible_damage: string[];
  secondary_hazards: string[];
  severity: SeverityLevel;
  confidence: number;
  recommended_departments: string[];
  assistance_required?: string;
  life_risk_indicators: string[];
  critical_infrastructure_indicators: string[];
  uncertainties: string[];
  human_review_required: boolean;
  summary: string;
}

export interface PriorityBreakdown {
  factors: {
    lifeRisk: { weight: 30; score: number; reason: string };
    damageSeverity: { weight: 20; score: number; reason: string };
    secondaryHazards: { weight: 15; score: number; reason: string };
    peopleAffected: { weight: 10; score: number; reason: string };
    criticalInfrastructure: { weight: 10; score: number; reason: string };
    timeSensitivity: { weight: 10; score: number; reason: string };
    vulnerablePeople: { weight: 5; score: number; reason: string };
  };
  totalScore: number;
  priorityBand: PriorityBand;
  reasons: string[];
  missingInformation: string[];
  urgentReviewRequired: boolean;
}

export interface Incident {
  id: string;
  title: string;
  category: IncidentCategory;
  latitude: number;
  longitude: number;
  description: string;
  visible_damage: string[];
  secondary_hazards: string[];
  severity: SeverityLevel;
  ai_confidence: number;
  ai_assessment: AIAssessment | null;
  priority_score: number;
  priority_band: PriorityBand;
  priority_reasons: string[];
  review_required: boolean;
  verification_status: VerificationStatus;
  primary_department_id?: string | null;
  primary_department?: Department | null;
  status: IncidentStatus;
  routing_decision?: RoutingDecision | null;
  evidence_count?: number;
  reports?: Report[];
  assignments?: Assignment[];
  created_at: string;
  updated_at: string;
}

export interface Report {
  id: string;
  reporter_id?: string | null;
  incident_id?: string | null;
  image_path: string;
  description: string;
  incident_latitude: number;
  incident_longitude: number;
  reporter_latitude?: number | null;
  reporter_longitude?: number | null;
  source_type: SourceType;
  assistance_needed: string;
  reported_people_affected?: number | null;
  immediate_danger: ImmediateDanger;
  verification_status: "unverified" | "verified" | "rejected";
  created_at: string;
  distance_to_incident_meters?: number;
}

export interface Assignment {
  id: string;
  incident_id: string;
  department_id: string;
  department?: Department | null;
  assigned_by?: string | null;
  assigner_profile?: Profile | null;
  assignment_status: AssignmentStatus;
  assigned_at: string;
  acknowledged_at?: string | null;
  completed_at?: string | null;
  notes?: string | null;
  assignment_source?: "automatic" | "manual";
  completion_verification?: "not_submitted" | "pending_review" | "verified" | "rework";
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
}

export interface RoutingDecision {
  mode: "automatic" | "needs_review" | "manual";
  suggested_codes: string[];
  assigned_codes: string[];
  reasons: string[];
  policy_version: "india-relief-v1" | "india-relief-v2" | "india-relief-v3";
}

export interface ActivityLog {
  id: string;
  incident_id: string;
  actor_id?: string | null;
  actor_profile?: Profile | null;
  action: string;
  old_value?: any;
  new_value?: any;
  reason?: string | null;
  created_at: string;
}

export interface DuplicateMatch {
  incident: Incident;
  distanceMeters: number;
  categoryMatch: boolean;
  similarityScore: number;
  duplicateConfidence: "high" | "moderate" | "unlikely";
  reasons: string[];
}
