import { 
  Incident, 
  Report, 
  Assignment, 
  ActivityLog, 
  Department, 
  Profile, 
  UserRole,
  AIAssessment,
  PriorityBand,
  IncidentStatus
} from '../types';
import { calculatePriorityScore } from './priority-engine';
import { recommendDepartments, KNOWN_DEPARTMENTS, reportCategory } from './department-router';
import { findDuplicateCandidates } from './duplicate-detector';

import { SEED_DEPARTMENT_CATALOG } from "./departments";
import { planResponse, responseStatus } from "./response-routing";

// Seed Departments
export const SEED_DEPARTMENTS = SEED_DEPARTMENT_CATALOG;

// Demo Profiles
export const SEED_PROFILES: Profile[] = [
  {
    id: 'a0000000-0000-0000-0000-000000000001',
    email: 'admin@civiscope.demo',
    display_name: '[Simulated] Command Chief Rahman',
    role: 'admin',
    approval_status: 'approved',
    department_id: '55555555-5555-5555-5555-555555555555',
    department: SEED_DEPARTMENTS[4],
  },
  {
    id: 'a0000000-0000-0000-0000-000000000002',
    email: 'fire@civiscope.demo',
    display_name: '[Simulated] Captain Hossain (Fire & Rescue)',
    role: 'fire_rescue',
    approval_status: 'approved',
    department_id: '11111111-1111-1111-1111-111111111111',
    department: SEED_DEPARTMENTS[0],
  },
  {
    id: 'a0000000-0000-0000-0000-000000000003',
    email: 'power@civiscope.demo',
    display_name: '[Simulated] Engr. Tariq (Electricity Dept)',
    role: 'electricity',
    approval_status: 'approved',
    department_id: '22222222-2222-2222-2222-222222222222',
    department: SEED_DEPARTMENTS[1],
  },
  {
    id: 'a0000000-0000-0000-0000-000000000004',
    email: 'citizen@civiscope.demo',
    display_name: '[Simulated] Citizen Reporter (Lakshmipur Resident)',
    role: 'citizen',
    approval_status: 'approved',
    department_id: null,
  },
  {
    id: 'a0000000-0000-0000-0000-000000000005',
    email: 'municipal@civiscope.demo',
    display_name: '[Simulated] Municipal Response Coordinator',
    role: 'municipal',
    approval_status: 'approved',
    department_id: SEED_DEPARTMENTS[2].id,
    department: SEED_DEPARTMENTS[2],
  },
  {
    id: 'a0000000-0000-0000-0000-000000000006',
    email: 'medical@civiscope.demo',
    display_name: '[Simulated] Medical Response Coordinator',
    role: 'medical',
    approval_status: 'approved',
    department_id: SEED_DEPARTMENTS[3].id,
    department: SEED_DEPARTMENTS[3],
  },
];

// Each added demo responder remains scoped to its own department.
for (const [index, code] of ["SDRF", "NDRF", "POLICE", "CIVIL_DEFENCE", "NGO_RELIEF", "COMMUNITY_VOLUNTEERS"].entries()) {
  const department = SEED_DEPARTMENTS.find(d => d.code === code)!;
  const emailName = ["sdrf", "ndrf", "police", "civil", "ngo", "volunteer"][index];
  SEED_PROFILES.push({ id: `a0000000-0000-0000-0000-${String(index + 7).padStart(12, "0")}`, email: `${emailName}@civiscope.demo`, display_name: `[Simulated] ${department.name}`, role: "relief_responder", approval_status: "approved", department_id: department.id, department });
}

export function getInitialSeedData() {
  const incidents: Incident[] = [
    {
      id: 'b1000000-0000-0000-0000-000000000001',
      title: '[Simulated] Severe Flooding along College Road',
      category: 'flood',
      latitude: 22.9447,
      longitude: 90.8282,
      description: '[Simulated] Knee-to-waist deep floodwaters blocking transit along College Road. Submerged drainage gutters causing high current.',
      visible_damage: ['submerged_roadway', 'overflowing_drainage', 'trapped_vehicles'],
      secondary_hazards: ['waterborne_contamination', 'traffic_paralysis'],
      severity: 'high',
      ai_confidence: 0.91,
      ai_assessment: {
        category: 'flood',
        title: 'Severe Flooding along College Road',
        visible_damage: ['submerged_roadway', 'overflowing_drainage'],
        secondary_hazards: ['traffic_paralysis'],
        severity: 'high',
        confidence: 0.91,
        recommended_departments: ['Municipal / Road Services'],
        life_risk_indicators: [],
        critical_infrastructure_indicators: ['arterial_road'],
        uncertainties: ['drainage depth hidden under turbid water'],
        human_review_required: false,
        summary: 'Extensive urban waterlogging on primary transit corridor requiring high-capacity dewatering pumps.',
      },
      priority_score: 68.5,
      priority_band: 'High',
      priority_reasons: [
        'Visible damage severity (20% wt): 75/100',
        'Secondary hazards (15% wt): 60/100',
        'Critical arterial road submerged (10% wt): 80/100',
      ],
      review_required: false,
      verification_status: 'verified',
      primary_department_id: '33333333-3333-3333-3333-333333333333',
      primary_department: SEED_DEPARTMENTS[2],
      status: 'assigned',
      created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 2.5 * 3600 * 1000).toISOString(),
      evidence_count: 2,
    },
    {
      id: 'b2000000-0000-0000-0000-000000000002',
      title: '[Simulated] Snapped Concrete Electrical Pole with Sparking Lines',
      category: 'electrical_hazard',
      latitude: 22.9449,
      longitude: 90.8284,
      description: '[Simulated] 11kV distribution pole snapped across walkway and standing water. Sparking observed near transformer base.',
      visible_damage: ['snapped_concrete_pole', 'downed_conductors_in_water', 'cracked_insulators'],
      secondary_hazards: ['electrocution_risk_in_standing_water', 'transformer_oil_leak', 'fire'],
      severity: 'critical',
      ai_confidence: 0.94,
      ai_assessment: {
        category: 'electrical_hazard',
        title: 'Snapped Concrete Electrical Pole with Sparking Lines',
        visible_damage: ['snapped_concrete_pole', 'downed_conductors_in_water'],
        secondary_hazards: ['electrocution_risk_in_standing_water', 'fire'],
        severity: 'critical',
        confidence: 0.94,
        recommended_departments: ['Electricity Department', 'Fire & Rescue'],
        life_risk_indicators: ['high voltage conductors in wet public pedestrian zone'],
        critical_infrastructure_indicators: ['11kV distribution feeder'],
        uncertainties: ['feeder auto-trip status unknown'],
        human_review_required: true,
        summary: 'High electrocution danger due to downed conductors in waterlogged urban alleyway. Immediate grid isolation mandatory.',
      },
      priority_score: 89.2,
      priority_band: 'Critical',
      priority_reasons: [
        'Risk to human life (30% wt): 95/100',
        'Visible damage severity (20% wt): 85/100',
        'Secondary hazards - electrocution in water (15% wt): 90/100',
        'Immediate life threat triggers mandatory priority band',
      ],
      review_required: true,
      verification_status: 'verified',
      primary_department_id: '22222222-2222-2222-2222-222222222222',
      primary_department: SEED_DEPARTMENTS[1],
      status: 'in_progress',
      created_at: new Date(Date.now() - 2.66 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 1.2 * 3600 * 1000).toISOString(),
      evidence_count: 2,
    },
    {
      id: 'b3000000-0000-0000-0000-000000000003',
      title: '[Simulated] Partial Structural Collapse of 3-Storey Commercial Unit',
      category: 'building_damage',
      latitude: 22.9410,
      longitude: 90.8250,
      description: '[Simulated] Ground floor columns gave way following soil subsidence. Upper floors partially tilted into adjacent alleyway. Possible trapped occupants.',
      visible_damage: ['column_failure', 'pancake_collapse_facade', 'rubble_blocking_street'],
      secondary_hazards: ['secondary_structural_collapse', 'gas_pipe_rupture', 'crushed_utilities'],
      severity: 'critical',
      ai_confidence: 0.96,
      ai_assessment: {
        category: 'building_damage',
        title: 'Partial Structural Collapse of 3-Storey Commercial Unit',
        visible_damage: ['column_failure', 'pancake_collapse_facade'],
        secondary_hazards: ['secondary_structural_collapse', 'gas_leak'],
        severity: 'critical',
        confidence: 0.96,
        recommended_departments: ['Fire & Rescue', 'Medical Response'],
        life_risk_indicators: ['occupants reported trapped in ground floor shop'],
        critical_infrastructure_indicators: ['dense commercial alleyway'],
        uncertainties: ['exact number trapped inside'],
        human_review_required: true,
        summary: 'Catastrophic structural failure with suspected trapped casualties. Heavy urban search and rescue dispatch required.',
      },
      priority_score: 94.5,
      priority_band: 'Critical',
      priority_reasons: [
        'Risk to human life (30% wt): 100/100',
        'Visible damage severity (20% wt): 95/100',
        'People affected (10% wt): 90/100',
        'Time sensitivity (10% wt): 95/100',
      ],
      review_required: true,
      verification_status: 'verified',
      primary_department_id: '11111111-1111-1111-1111-111111111111',
      primary_department: SEED_DEPARTMENTS[0],
      status: 'assigned',
      created_at: new Date(Date.now() - 1.83 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 1.5 * 3600 * 1000).toISOString(),
      evidence_count: 1,
    },
    {
      id: 'b4000000-0000-0000-0000-000000000004',
      title: '[Simulated] Waterlogged Residential Lane on Station Road North',
      category: 'flood',
      latitude: 22.9560,
      longitude: 90.8350,
      description: '[Simulated] Shallow standing water (1 foot) inundating residential driveways. Light vehicle passage restricted.',
      visible_damage: ['waterlogged_pavement', 'blocked_stormwater_grates'],
      secondary_hazards: ['mosquito_breeding', 'minor_basement_seepage'],
      severity: 'medium',
      ai_confidence: 0.88,
      ai_assessment: {
        category: 'flood',
        title: 'Waterlogged Residential Lane on Station Road North',
        visible_damage: ['waterlogged_pavement'],
        secondary_hazards: ['minor_basement_seepage'],
        severity: 'medium',
        confidence: 0.88,
        recommended_departments: ['Municipal / Road Services'],
        life_risk_indicators: [],
        critical_infrastructure_indicators: [],
        uncertainties: ['stormwater basin outlet capacity'],
        human_review_required: false,
        summary: 'Localized residential water accumulation without structural threat or acute human danger.',
      },
      priority_score: 46.0,
      priority_band: 'Medium',
      priority_reasons: [
        'Visible damage severity (20% wt): 40/100',
        'People affected (10% wt): 50/100',
        'Low life risk (30% wt): 15/100',
      ],
      review_required: false,
      verification_status: 'unverified',
      primary_department_id: '33333333-3333-3333-3333-333333333333',
      primary_department: SEED_DEPARTMENTS[2],
      status: 'open',
      created_at: new Date(Date.now() - 0.83 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 0.83 * 3600 * 1000).toISOString(),
      evidence_count: 1,
    },
  ];

  const reports: Report[] = [
    {
      id: 'c1000000-0000-0000-0000-000000000001',
      reporter_id: 'a0000000-0000-0000-0000-000000000004',
      incident_id: 'b1000000-0000-0000-0000-000000000001',
      image_path: '/simulated-evidence/flood_college_road_1.svg',
      description: '[Simulated] College Road completely underwater near the college gate. Cars are stalled and water is rushing into shops.',
      incident_latitude: 22.9447,
      incident_longitude: 90.8282,
      reporter_latitude: 22.9446,
      reporter_longitude: 90.8281,
      source_type: 'on_site',
      assistance_needed: 'Water pumping and emergency barricades to divert vehicles.',
      reported_people_affected: 15,
      immediate_danger: 'no',
      verification_status: 'verified',
      created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    },
    {
      id: 'c2000000-0000-0000-0000-000000000002',
      reporter_id: null,
      incident_id: 'b1000000-0000-0000-0000-000000000001', // Associated duplicate
      image_path: '/simulated-evidence/flood_college_road_2.svg',
      description: '[Simulated] Another angle of College Road flooding. The water level has reached knee height in front of the bookstore.',
      incident_latitude: 22.9451,
      incident_longitude: 90.8286,
      reporter_latitude: 22.9450,
      reporter_longitude: 90.8285,
      source_type: 'field_report',
      assistance_needed: 'Dewatering pumps urgently required before dark.',
      reported_people_affected: 20,
      immediate_danger: 'no',
      verification_status: 'verified',
      created_at: new Date(Date.now() - 2.75 * 3600 * 1000).toISOString(),
    },
    {
      id: 'c3000000-0000-0000-0000-000000000003',
      reporter_id: 'a0000000-0000-0000-0000-000000000004',
      incident_id: 'b2000000-0000-0000-0000-000000000002',
      image_path: '/simulated-evidence/fallen_pole_1.svg',
      description: '[Simulated] High tension electric pole collapsed into stagnant flood water. Sparks popping, people shouting to keep distance.',
      incident_latitude: 22.9449,
      incident_longitude: 90.8284,
      reporter_latitude: 22.9448,
      reporter_longitude: 90.8282,
      source_type: 'on_site',
      assistance_needed: 'Cut off power immediately! Dangerous live wire in water.',
      reported_people_affected: 50,
      immediate_danger: 'yes',
      verification_status: 'verified',
      created_at: new Date(Date.now() - 2.66 * 3600 * 1000).toISOString(),
    },
    {
      id: 'c4000000-0000-0000-0000-000000000004',
      reporter_id: null,
      incident_id: 'b2000000-0000-0000-0000-000000000002', // Associated duplicate
      image_path: '/simulated-evidence/fallen_pole_2.svg',
      description: '[Simulated] Close-up view of the damaged transformer and fallen wire hanging over the pathway.',
      incident_latitude: 22.9448,
      incident_longitude: 90.8285,
      reporter_latitude: 22.9447,
      reporter_longitude: 90.8284,
      source_type: 'field_report',
      assistance_needed: 'Electrical grid shutoff and line replacement crew.',
      reported_people_affected: 30,
      immediate_danger: 'yes',
      verification_status: 'verified',
      created_at: new Date(Date.now() - 2.33 * 3600 * 1000).toISOString(),
    },
    {
      id: 'c5000000-0000-0000-0000-000000000005',
      reporter_id: 'a0000000-0000-0000-0000-000000000004',
      incident_id: 'b3000000-0000-0000-0000-000000000003',
      image_path: '/simulated-evidence/building_collapse_1.svg',
      description: '[Simulated] Three storey building foundation gave way. Concrete slabs cracked and front portion collapsed onto the road. People are trapped inside.',
      incident_latitude: 22.9410,
      incident_longitude: 90.8250,
      reporter_latitude: 22.9408,
      reporter_longitude: 90.8248,
      source_type: 'on_site',
      assistance_needed: 'Heavy search and rescue team, hydraulic cutters, ambulances.',
      reported_people_affected: 12,
      immediate_danger: 'yes',
      verification_status: 'verified',
      created_at: new Date(Date.now() - 1.83 * 3600 * 1000).toISOString(),
    },
    {
      id: 'c6000000-0000-0000-0000-000000000006',
      reporter_id: null,
      incident_id: 'b4000000-0000-0000-0000-000000000004',
      image_path: '/simulated-evidence/flood_station_road_north.svg',
      description: '[Simulated] Water standing on Station Road North lane. Drain is backed up but no homes breached yet.',
      incident_latitude: 22.9560,
      incident_longitude: 90.8350,
      reporter_latitude: 22.9565,
      reporter_longitude: 90.8352,
      source_type: 'news_public',
      assistance_needed: 'Drain clearing squad.',
      reported_people_affected: 8,
      immediate_danger: 'unknown',
      verification_status: 'unverified',
      created_at: new Date(Date.now() - 0.83 * 3600 * 1000).toISOString(),
    },
  ];

  const assignments: Assignment[] = [
    {
      id: 'd1000000-0000-0000-0000-000000000001',
      incident_id: 'b1000000-0000-0000-0000-000000000001',
      department_id: '33333333-3333-3333-3333-333333333333',
      department: SEED_DEPARTMENTS[2],
      assigned_by: 'a0000000-0000-0000-0000-000000000001',
      assignment_status: 'acknowledged',
      assigned_at: new Date(Date.now() - 2.66 * 3600 * 1000).toISOString(),
      acknowledged_at: new Date(Date.now() - 2.33 * 3600 * 1000).toISOString(),
      notes: '[Simulated] Drainage Team 2 deployed with 2x trailer pumps.',
    },
    {
      id: 'd2000000-0000-0000-0000-000000000002',
      incident_id: 'b2000000-0000-0000-0000-000000000002',
      department_id: '22222222-2222-2222-2222-222222222222',
      department: SEED_DEPARTMENTS[1],
      assigned_by: 'a0000000-0000-0000-0000-000000000001',
      assignment_status: 'in_progress',
      assigned_at: new Date(Date.now() - 2.5 * 3600 * 1000).toISOString(),
      acknowledged_at: new Date(Date.now() - 2.25 * 3600 * 1000).toISOString(),
      notes: '[Simulated] Feeder 4 remote-tripped at Lakshmipur Substation. Rapid repair crew on site isolating wires.',
    },
    {
      id: 'd3000000-0000-0000-0000-000000000003',
      incident_id: 'b3000000-0000-0000-0000-000000000003',
      department_id: '11111111-1111-1111-1111-111111111111',
      department: SEED_DEPARTMENTS[0],
      assigned_by: 'a0000000-0000-0000-0000-000000000001',
      assignment_status: 'acknowledged',
      assigned_at: new Date(Date.now() - 1.66 * 3600 * 1000).toISOString(),
      acknowledged_at: new Date(Date.now() - 1.5 * 3600 * 1000).toISOString(),
      notes: '[Simulated] Rescue Unit 1 & 2 dispatched with thermal sensors and acoustic search gear.',
    },
  ];

  const activityLogs: ActivityLog[] = [
    {
      id: 'e1000000-0000-0000-0000-000000000001',
      incident_id: 'b1000000-0000-0000-0000-000000000001',
      actor_id: 'a0000000-0000-0000-0000-000000000004',
      action: 'report_created',
      new_value: { report_id: 'c1000000-0000-0000-0000-000000000001' },
      reason: 'Citizen submitted initial flooding report',
      created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    },
    {
      id: 'e2000000-0000-0000-0000-000000000002',
      incident_id: 'b1000000-0000-0000-0000-000000000001',
      actor_id: 'a0000000-0000-0000-0000-000000000001',
      action: 'duplicate_confirmed',
      new_value: { duplicate_report_id: 'c2000000-0000-0000-0000-000000000002' },
      reason: 'Control Room confirmed duplicate report at College Road (distance ~55m)',
      created_at: new Date(Date.now() - 2.7 * 3600 * 1000).toISOString(),
    },
    {
      id: 'e3000000-0000-0000-0000-000000000003',
      incident_id: 'b1000000-0000-0000-0000-000000000001',
      actor_id: 'a0000000-0000-0000-0000-000000000001',
      action: 'department_assigned',
      old_value: { status: 'open' },
      new_value: { department: 'Municipal / Road Services', status: 'assigned' },
      reason: 'Arterial blockage requires municipal dewatering',
      created_at: new Date(Date.now() - 2.66 * 3600 * 1000).toISOString(),
    },
    {
      id: 'e4000000-0000-0000-0000-000000000004',
      incident_id: 'b2000000-0000-0000-0000-000000000002',
      actor_id: 'a0000000-0000-0000-0000-000000000001',
      action: 'department_assigned',
      old_value: { status: 'open' },
      new_value: { department: 'Electricity Department', status: 'assigned' },
      reason: 'Immediate electrocution threat in standing water',
      created_at: new Date(Date.now() - 2.5 * 3600 * 1000).toISOString(),
    },
    {
      id: 'e5000000-0000-0000-0000-000000000005',
      incident_id: 'b2000000-0000-0000-0000-000000000002',
      actor_id: 'a0000000-0000-0000-0000-000000000003',
      action: 'assignment_acknowledged',
      old_value: { status: 'pending' },
      new_value: { status: 'acknowledged' },
      reason: 'Substation dispatched line isolation squad',
      created_at: new Date(Date.now() - 2.25 * 3600 * 1000).toISOString(),
    },
    {
      id: 'e6000000-0000-0000-0000-000000000006',
      incident_id: 'b2000000-0000-0000-0000-000000000002',
      actor_id: 'a0000000-0000-0000-0000-000000000003',
      action: 'status_updated',
      old_value: { status: 'acknowledged' },
      new_value: { status: 'in_progress' },
      reason: 'Feeder isolated; replacement pole transport en route',
      created_at: new Date(Date.now() - 1.2 * 3600 * 1000).toISOString(),
    },
    {
      id: 'e7000000-0000-0000-0000-000000000007',
      incident_id: 'b3000000-0000-0000-0000-000000000003',
      actor_id: 'a0000000-0000-0000-0000-000000000001',
      action: 'priority_override',
      old_value: { score: 88.0 },
      new_value: { score: 94.5 },
      reason: 'Eyewitness confirmed two shopkeepers trapped in lower floor',
      created_at: new Date(Date.now() - 1.75 * 3600 * 1000).toISOString(),
    },
  ];

  return { incidents, reports, assignments, activityLogs };
}

// In-Memory Global State (shared across serverless requests in same process)
export type MemoryStore = {
  incidents: Incident[];
  reports: Report[];
  assignments: Assignment[];
  activityLogs: ActivityLog[];
};
const processState = globalThis as typeof globalThis & { civiscopeMemoryStore?: MemoryStore };

export function replaceDemoStore(store: MemoryStore) {
  processState.civiscopeMemoryStore = store;
}

export function getStore() {
  if (!processState.civiscopeMemoryStore) {
    const seed = getInitialSeedData();
    processState.civiscopeMemoryStore = {
      incidents: seed.incidents,
      reports: seed.reports,
      assignments: seed.assignments,
      activityLogs: seed.activityLogs,
    };
  }
  return processState.civiscopeMemoryStore;
}

export function resetStore() {
  const seed = getInitialSeedData();
  processState.civiscopeMemoryStore = {
    incidents: seed.incidents,
    reports: seed.reports,
    assignments: seed.assignments,
    activityLogs: seed.activityLogs,
  };
  return processState.civiscopeMemoryStore;
}

/**
 * Incident Service API Operations
 */
export const IncidentService = {
  getIncidents: async (): Promise<Incident[]> => {
    const store = getStore();
    return store.incidents.map(inc => {
      const incReports = store.reports.filter(r => r.incident_id === inc.id);
      const incAssignments = store.assignments.filter(a => a.incident_id === inc.id);
      return {
        ...inc,
        evidence_count: incReports.length,
        reports: incReports,
        assignments: incAssignments,
      };
    }).sort((a, b) => b.priority_score - a.priority_score);
  },

  getIncidentById: async (id: string): Promise<Incident | null> => {
    const store = getStore();
    const incident = store.incidents.find(i => i.id === id);
    if (!incident) return null;

    const reports = store.reports.filter(r => r.incident_id === id);
    const assignments = store.assignments.filter(a => a.incident_id === id);

    return {
      ...incident,
      evidence_count: reports.length,
      reports,
      assignments,
    };
  },

  getActivityLogs: async (incidentId?: string): Promise<ActivityLog[]> => {
    const store = getStore();
    if (incidentId) {
      return store.activityLogs
        .filter(l => l.incident_id === incidentId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return store.activityLogs
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  getReports: async (): Promise<Report[]> => {
    return getStore().reports.slice().sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  },

  getStatistics: async () => {
    const store = getStore();
    const total = store.incidents.length;
    const critical = store.incidents.filter(i => i.priority_band === 'Critical').length;
    const high = store.incidents.filter(i => i.priority_band === 'High').length;
    const awaitingAssignment = store.incidents.filter(i => i.status === 'open').length;
    const activeResponses = store.assignments.filter(
      a => a.assignment_status === 'acknowledged' || a.assignment_status === 'in_progress'
    ).length;

    return {
      total,
      critical,
      high,
      awaitingAssignment,
      activeResponses,
      totalReports: store.reports.length,
    };
  },

  submitCitizenReport: async (params: {
    imagePath: string;
    description: string;
    incidentLatitude: number;
    incidentLongitude: number;
    reporterLatitude?: number | null;
    reporterLongitude?: number | null;
    sourceType: 'on_site' | 'field_report' | 'news_public';
    assistanceNeeded: string;
    reportedPeopleAffected?: number | null;
    immediateDanger: 'yes' | 'no' | 'unknown';
    reporterId?: string | null;
    aiAssessment?: AIAssessment | null;
  }) => {
    const store = getStore();
    const reportId = `rep-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const category = reportCategory(params.aiAssessment, params.description);

    // Create report record
    const newReport: Report = {
      id: reportId,
      reporter_id: params.reporterId || null,
      incident_id: null, // Will be set or linked
      image_path: params.imagePath,
      description: params.description,
      incident_latitude: params.incidentLatitude,
      incident_longitude: params.incidentLongitude,
      reporter_latitude: params.reporterLatitude ?? null,
      reporter_longitude: params.reporterLongitude ?? null,
      source_type: params.sourceType,
      assistance_needed: params.assistanceNeeded,
      reported_people_affected: params.reportedPeopleAffected || null,
      immediate_danger: params.immediateDanger,
      verification_status: params.sourceType === 'news_public' ? 'unverified' : 'unverified',
      created_at: new Date().toISOString(),
    };

    // 1. Check for duplicate candidates (within 150m)
    const duplicateMatches = findDuplicateCandidates(
      {
        incident_latitude: params.incidentLatitude,
        incident_longitude: params.incidentLongitude,
        category,
        description: params.description,
      },
      store.incidents.filter(i => !['resolved', 'closed'].includes(i.status)),
      150
    );

    // 2. Compute priority score deterministically
    const priorityResult = calculatePriorityScore({
      category,
      immediateDanger: params.immediateDanger,
      reportedPeopleAffected: params.reportedPeopleAffected,
      aiAssessment: params.aiAssessment,
      sourceType: params.sourceType,
    });

    // 3. Recommend department deterministically
    const deptRecommendation = recommendDepartments(
      category,
      params.description,
      params.aiAssessment?.secondary_hazards || []
    );
    const routing = planResponse({ ...params, priorityBand: priorityResult.priorityBand, hasDuplicateCandidates: duplicateMatches.some(m => m.duplicateConfidence !== 'unlikely'), departments: SEED_DEPARTMENTS });

    // 4. Create new incident entity initially (unless confirmed as duplicate)
    const incidentId = `inc-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const newIncident: Incident = {
      id: incidentId,
      title: params.aiAssessment?.title || `Disaster Report: ${params.description.slice(0, 40)}...`,
      category,
      latitude: params.incidentLatitude,
      longitude: params.incidentLongitude,
      description: params.description,
      visible_damage: params.aiAssessment?.visible_damage || [],
      secondary_hazards: params.aiAssessment?.secondary_hazards || [],
      severity: params.aiAssessment?.severity || 'medium',
      ai_confidence: params.aiAssessment?.confidence || 0.0,
      ai_assessment: params.aiAssessment || null,
      priority_score: priorityResult.totalScore,
      priority_band: priorityResult.priorityBand,
      priority_reasons: priorityResult.reasons,
      review_required: routing.mode === 'needs_review',
      routing_decision: routing,
      verification_status: 'unverified',
      primary_department_id: routing.assigned_codes.length ? SEED_DEPARTMENTS.find(d => d.code === (routing.assigned_codes.includes(deptRecommendation.primaryDepartmentCode) ? deptRecommendation.primaryDepartmentCode : routing.assigned_codes[0]))?.id ?? null : null,
      primary_department: routing.assigned_codes.length ? SEED_DEPARTMENTS.find(d => d.code === (routing.assigned_codes.includes(deptRecommendation.primaryDepartmentCode) ? deptRecommendation.primaryDepartmentCode : routing.assigned_codes[0])) ?? null : null,
      status: 'open',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      evidence_count: 1,
    };

    newReport.incident_id = incidentId;

    // Persist to store
    store.reports.unshift(newReport);
    store.incidents.unshift(newIncident);
    if (routing.assigned_codes.length) {
      for (const code of routing.assigned_codes) {
        const department = SEED_DEPARTMENTS.find(d => d.code === code)!;
        store.assignments.unshift({ id: `auto-${incidentId}-${code}`, incident_id: incidentId, department_id: department.id, department, assigned_by: null, assignment_status: 'pending', assignment_source: 'automatic', completion_verification: 'not_submitted', assigned_at: new Date().toISOString(), notes: routing.reasons.join(' ') });
      }
      newIncident.status = 'assigned';
    }
    store.activityLogs.unshift({ id: `routing-${incidentId}`, incident_id: incidentId, actor_id: null, action: routing.assigned_codes.length ? 'response_auto_assigned' : 'routing_review_required', new_value: routing, reason: routing.reasons.join(' '), created_at: new Date().toISOString() });

    // Add activity log
    const log: ActivityLog = {
      id: `log-${Date.now()}`,
      incident_id: incidentId,
      actor_id: params.reporterId || null,
      action: 'report_created',
      new_value: { report_id: reportId, priority_score: priorityResult.totalScore },
      reason: 'Citizen report submitted and triaged.',
      created_at: new Date().toISOString(),
    };
    store.activityLogs.unshift(log);

    return {
      report: newReport,
      incident: newIncident,
      duplicateCandidates: duplicateMatches,
      priorityResult,
      deptRecommendation,
    };
  },

  confirmDuplicate: async (reportId: string, targetIncidentId: string, actorId?: string) => {
    const store = getStore();
    const report = store.reports.find(r => r.id === reportId);
    const targetIncident = store.incidents.find(i => i.id === targetIncidentId);

    if (!report || !targetIncident) {
      throw new Error('Report or Target Incident not found');
    }

    const previousIncidentId = report.incident_id;

    // Associate report with existing incident
    report.incident_id = targetIncidentId;

    // If the report previously had its own standalone incident, remove that standalone incident marker
    if (previousIncidentId && previousIncidentId !== targetIncidentId) {
      // Keep the source incident while it still has evidence or response operations.
      const hasReports = store.reports.some(r => r.incident_id === previousIncidentId);
      const hasAssignments = store.assignments.some(a => a.incident_id === previousIncidentId);
      if (!hasReports && !hasAssignments) {
        store.incidents = store.incidents.filter(i => i.id !== previousIncidentId);
        store.activityLogs.forEach(log => {
          if (log.incident_id === previousIncidentId) log.incident_id = targetIncidentId;
        });
      }
    }

    // Update target incident evidence count
    const associatedReports = store.reports.filter(r => r.incident_id === targetIncidentId);
    targetIncident.evidence_count = associatedReports.length;
    targetIncident.updated_at = new Date().toISOString();

    // Log activity
    store.activityLogs.unshift({
      id: `log-${Date.now()}`,
      incident_id: targetIncidentId,
      actor_id: actorId || null,
      action: 'duplicate_confirmed',
      old_value: { previous_incident_id: previousIncidentId },
      new_value: { attached_report_id: reportId, evidence_count: associatedReports.length },
      reason: `Control Room confirmed duplicate report #${reportId.slice(0, 8)}. Associated into Incident #${targetIncidentId.slice(0, 8)}.`,
      created_at: new Date().toISOString(),
    });

    return targetIncident;
  },

  keepSeparate: async (reportId: string, actorId?: string) => {
    const store = getStore();
    const report = store.reports.find(r => r.id === reportId);
    if (!report) throw new Error('Report not found');

    store.activityLogs.unshift({
      id: `log-${Date.now()}`,
      incident_id: report.incident_id || '',
      actor_id: actorId || null,
      action: 'duplicate_rejected',
      reason: `Control Room verified report #${reportId.slice(0, 8)} represents a distinct incident. Kept separate.`,
      created_at: new Date().toISOString(),
    });

    return true;
  },

  assignDepartment: async (
    incidentId: string, 
    departmentId: string, 
    assignedBy?: string, 
    notes?: string
  ) => {
    const store = getStore();
    const incident = store.incidents.find(i => i.id === incidentId);
    const department = SEED_DEPARTMENTS.find(d => d.id === departmentId);

    if (!incident || !department) {
      throw new Error('Invalid incident or department ID');
    }

    if (incident.status === 'closed' || department.code === 'CONTROL_ROOM') throw new Error('Select an open incident and response department');
    const existing = store.assignments.find(a => a.incident_id === incidentId && a.department_id === departmentId && !['resolved', 'rejected'].includes(a.assignment_status));
    if (existing) return existing;
    const previousStatus = incident.status;

    const assignmentId = `asgn-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const newAssignment: Assignment = {
      id: assignmentId,
      incident_id: incidentId,
      department_id: departmentId,
      department,
      assigned_by: assignedBy || null,
      assignment_source: 'manual',
      completion_verification: 'not_submitted',
      assignment_status: 'pending',
      assigned_at: new Date().toISOString(),
      notes: notes || null,
    };

    store.assignments.unshift(newAssignment);
    if (!store.assignments.some(a => a.incident_id === incidentId && a.department_id === incident.primary_department_id && a.assignment_status !== 'rejected')) {
      incident.primary_department_id = departmentId;
      incident.primary_department = department;
    }
    if (incident.status !== 'in_progress') incident.status = 'assigned';
    incident.updated_at = new Date().toISOString();

    store.activityLogs.unshift({
      id: `log-${Date.now()}`,
      incident_id: incidentId,
      actor_id: assignedBy || null,
      action: 'department_assigned',
      old_value: { status: previousStatus },
      new_value: { department: department.name, status: 'assigned' },
      reason: notes || `Assigned to ${department.name}`,
      created_at: new Date().toISOString(),
    });

    return newAssignment;
  },

  acknowledgeAssignment: async (assignmentId: string, userId?: string) => {
    const store = getStore();
    const assignment = store.assignments.find(a => a.id === assignmentId);
    if (!assignment) throw new Error('Assignment not found');

    if (assignment.assignment_status !== 'pending') return assignment;

    assignment.assignment_status = 'acknowledged';
    assignment.acknowledged_at = new Date().toISOString();

    const incident = store.incidents.find(i => i.id === assignment.incident_id);
    if (incident) {
      incident.status = 'in_progress';
      incident.updated_at = new Date().toISOString();
    }

    store.activityLogs.unshift({
      id: `log-${Date.now()}`,
      incident_id: assignment.incident_id,
      actor_id: userId || null,
      action: 'assignment_acknowledged',
      new_value: { status: 'acknowledged', acknowledged_at: assignment.acknowledged_at },
      reason: `Department acknowledged response dispatch.`,
      created_at: new Date().toISOString(),
    });

    return assignment;
  },

  updateResponseStatus: async (
    assignmentId: string, 
    status: 'in_progress' | 'resolved' | 'rejected', 
    notes?: string, 
    userId?: string
  ) => {
    const store = getStore();
    const assignment = store.assignments.find(a => a.id === assignmentId);
    if (!assignment) throw new Error('Assignment not found');

    const oldStatus = assignment.assignment_status;
    assignment.assignment_status = status;
    if (status === 'resolved') {
      assignment.completed_at = new Date().toISOString();
      assignment.completion_verification = 'pending_review';
      assignment.reviewed_by = null;
      assignment.reviewed_at = null;
      assignment.review_notes = null;
    }
    if (notes) {
      assignment.notes = assignment.notes ? `${assignment.notes} | Update: ${notes}` : notes;
    }

    const incident = store.incidents.find(i => i.id === assignment.incident_id);
    if (incident) {
      incident.updated_at = new Date().toISOString();
      if (status === 'in_progress') incident.status = 'in_progress';
    }
    if (incident) {
      incident.status = responseStatus(store.assignments.filter(a => a.incident_id === incident.id));
      if (status === 'rejected') {
        incident.review_required = true;
        incident.routing_decision = { mode: 'needs_review', suggested_codes: incident.routing_decision?.suggested_codes ?? [], assigned_codes: incident.routing_decision?.assigned_codes ?? [], reasons: ['A response team declined its assignment. Admin reassignment is required.'], policy_version: 'india-relief-v1' };
      }
    }

    store.activityLogs.unshift({
      id: `log-${Date.now()}`,
      incident_id: assignment.incident_id,
      actor_id: userId || null,
      action: status === 'resolved' ? 'response_completion_submitted' : 'status_updated',
      old_value: { status: oldStatus },
      new_value: { status, notes },
      reason: notes || `Response status updated to ${status}.`,
      created_at: new Date().toISOString(),
    });

    return assignment;
  },

  overridePriority: async (
    incidentId: string, 
    newScore: number, 
    reason: string, 
    userId?: string
  ) => {
    const store = getStore();
    const incident = store.incidents.find(i => i.id === incidentId);
    if (!incident) throw new Error('Incident not found');
    if (!reason || reason.trim().length < 5) {
      throw new Error('Mandatory override reason required (at least 5 characters).');
    }

    const oldScore = incident.priority_score;
    incident.priority_score = Math.min(100, Math.max(0, newScore));
    
    // Update band
    if (incident.priority_score >= 80) incident.priority_band = 'Critical';
    else if (incident.priority_score >= 60) incident.priority_band = 'High';
    else if (incident.priority_score >= 35) incident.priority_band = 'Medium';
    else incident.priority_band = 'Low';

    incident.priority_reasons.unshift(`[Admin Override] Adjusted score to ${incident.priority_score}: ${reason}`);
    incident.updated_at = new Date().toISOString();

    store.activityLogs.unshift({
      id: `log-${Date.now()}`,
      incident_id: incidentId,
      actor_id: userId || null,
      action: 'priority_override',
      old_value: { score: oldScore },
      new_value: { score: incident.priority_score, band: incident.priority_band },
      reason,
      created_at: new Date().toISOString(),
    });

    return incident;
  },

  verifyIncident: async (
    incidentId: string, 
    verificationStatus: 'verified' | 'flagged' | 'rejected', 
    userId?: string
  ) => {
    const store = getStore();
    const incident = store.incidents.find(i => i.id === incidentId);
    if (!incident) throw new Error('Incident not found');

    const oldStatus = incident.verification_status;
    incident.verification_status = verificationStatus;
    store.reports.filter(report => report.incident_id === incidentId).forEach(report => {
      report.verification_status = verificationStatus === 'flagged' ? 'unverified' : verificationStatus;
    });
    incident.review_required = verificationStatus === 'flagged';
    incident.updated_at = new Date().toISOString();

    store.activityLogs.unshift({
      id: `log-${Date.now()}`,
      incident_id: incidentId,
      actor_id: userId || null,
      action: 'verification_updated',
      old_value: { status: oldStatus },
      new_value: { status: verificationStatus },
      reason: `Verification status updated by Control Room Admin`,
      created_at: new Date().toISOString(),
    });

    return incident;
  },
};
