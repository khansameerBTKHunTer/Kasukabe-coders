import type { Department, UserRole } from "@/types";

// Codes and existing IDs are stable: renaming a team must not break assignments.
export const DEPARTMENT_CATALOG = [
  {
    "id": "11111111-1111-1111-1111-111111111111",
    "code": "FIRE_RESCUE",
    "name": "Fire & Emergency Services",
    "role": "fire_rescue",
    "selfRegistration": true,
    "activation": "automatic",
    "capabilities": [
      "fire_suppression",
      "structural_rescue",
      "water_rescue",
      "hazmat"
    ],
    "aliases": [
      "Fire & Rescue"
    ]
  },
  {
    "id": "22222222-2222-2222-2222-222222222222",
    "code": "ELECTRICITY",
    "name": "Electricity Distribution Utility (DISCOM)",
    "role": "electricity",
    "selfRegistration": true,
    "activation": "automatic",
    "capabilities": [
      "grid_isolation",
      "fallen_line_repair",
      "power_restoration"
    ],
    "aliases": [
      "Electricity Department",
      "Electricity",
      "DISCOM"
    ]
  },
  {
    "id": "33333333-3333-3333-3333-333333333333",
    "code": "MUNICIPAL",
    "name": "Municipal / Panchayat & Public Works",
    "role": "municipal",
    "selfRegistration": true,
    "activation": "automatic",
    "capabilities": [
      "debris_clearing",
      "road_reopening",
      "pump_drainage",
      "civil_repairs"
    ],
    "aliases": [
      "Municipal / Road Services",
      "Public Works",
      "PWD"
    ]
  },
  {
    "id": "44444444-4444-4444-4444-444444444444",
    "code": "MEDICAL",
    "name": "Health Department & Emergency Medical Services",
    "role": "medical",
    "selfRegistration": true,
    "activation": "automatic",
    "capabilities": [
      "casualty_triage",
      "ambulance",
      "emergency_care"
    ],
    "aliases": [
      "Medical Response",
      "Medical",
      "Ambulance"
    ]
  },
  {
    "id": "55555555-5555-5555-5555-555555555555",
    "code": "CONTROL_ROOM",
    "name": "District Emergency Operations Centre (DEOC)",
    "role": "admin",
    "selfRegistration": false,
    "activation": "coordination",
    "capabilities": [
      "inter_agency_coordination",
      "resource_requests",
      "public_alerts"
    ],
    "aliases": [
      "Control Room / Disaster Management",
      "Control Room",
      "DEOC"
    ]
  },
  {
    "id": "66666666-6666-4666-8666-666666666666",
    "code": "SDRF",
    "name": "State Disaster Response Force (SDRF)",
    "role": "relief_responder",
    "selfRegistration": false,
    "activation": "admin_only",
    "capabilities": [
      "specialist_search_and_rescue",
      "flood_rescue",
      "collapsed_structure_rescue"
    ],
    "aliases": [
      "SDRF"
    ]
  },
  {
    "id": "77777777-7777-4777-8777-777777777777",
    "code": "NDRF",
    "name": "National Disaster Response Force (NDRF)",
    "role": "relief_responder",
    "selfRegistration": false,
    "activation": "admin_only",
    "capabilities": [
      "specialist_disaster_response",
      "collapsed_structure_rescue",
      "cbrn_response"
    ],
    "aliases": [
      "NDRF"
    ]
  },
  {
    "id": "88888888-8888-4888-8888-888888888888",
    "code": "POLICE",
    "name": "Police & Traffic Control",
    "role": "relief_responder",
    "selfRegistration": false,
    "activation": "automatic",
    "capabilities": [
      "traffic_diversion",
      "perimeter_control",
      "evacuation_coordination"
    ],
    "aliases": [
      "Police",
      "Traffic Police"
    ]
  },
  {
    "id": "99999999-9999-4999-8999-999999999999",
    "code": "CIVIL_DEFENCE",
    "name": "Civil Defence & Home Guards",
    "role": "relief_responder",
    "selfRegistration": true,
    "activation": "support",
    "capabilities": [
      "shelter_support",
      "relief_logistics",
      "evacuation_support"
    ],
    "aliases": [
      "Civil Defence",
      "Home Guards"
    ]
  },
  {
    "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "code": "NGO_RELIEF",
    "name": "NGO / Humanitarian Relief Partners",
    "role": "relief_responder",
    "selfRegistration": true,
    "activation": "support",
    "capabilities": [
      "food_distribution",
      "shelter_support",
      "hygiene_kits",
      "relief_logistics"
    ],
    "aliases": [
      "NGO",
      "NGOs",
      "NGO Relief"
    ]
  },
  {
    "id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "code": "COMMUNITY_VOLUNTEERS",
    "name": "Community Volunteers / Aapda Mitra",
    "role": "relief_responder",
    "selfRegistration": true,
    "activation": "support",
    "capabilities": [
      "safe_zone_relief",
      "supplies_distribution",
      "community_support"
    ],
    "aliases": [
      "Local Volunteers",
      "Community Volunteers",
      "Aapda Mitra"
    ]
  }
] as const;

export type DepartmentCode = (typeof DEPARTMENT_CATALOG)[number]["code"];
export const SEED_DEPARTMENT_CATALOG: Department[] = DEPARTMENT_CATALOG.map(({ id, name, code, capabilities }) => ({ id, name, code, capabilities: [...capabilities] }));
export function departmentDefinition(value: string) {
  const normalized = value.trim().toLowerCase();
  return DEPARTMENT_CATALOG.find(d => [d.code, d.name, ...d.aliases].some(alias => alias.toLowerCase() === normalized));
}
export function departmentRole(code: string): UserRole | undefined {
  return departmentDefinition(code)?.role;
}
