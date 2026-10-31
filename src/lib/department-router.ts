import { AIAssessment, IncidentCategory } from '../types';

// Use explicit citizen observations when vision is unavailable or uncertain.
// These are routing hints, never an invented visual assessment or verification.
export function reportedHazardCategories(description: string): IncidentCategory[] {
  const text = description.toLowerCase()
    .replace(/\bfire (department|brigade|services?|team|extinguisher)\b/g, "")
    .replace(/\b(?:no|not|without)\s+(?:(?:active|visible|any|signs of|evidence of|on)\s+){0,3}(?:fire|flames?|smoke|flooding|injuries|injury)\b/g, "");
  const matches: IncidentCategory[] = [];
  if (/\b(fire|flames?|burning|ablaze)\b/.test(text)) matches.push("fire");
  if (/\b(electrocut\w*|sparking|live wires?|downed wires?|fallen (?:power |electric(?:al)? )?(?:lines?|poles?)|transformer|power lines?|electrical hazard)\b/.test(text)) matches.push("electrical_hazard");
  if (/\b(collapsed?|collapsing|structural damage|cracked (?:walls?|building)|building damage)\b/.test(text)) matches.push("building_damage");
  if (/\b(landslide|mudslide)\b/.test(text)) matches.push("landslide");
  if (/\b(bleeding|unconscious|injured|injuries|medical emergency|casualties)\b/.test(text)) matches.push("medical_emergency");
  if (/\b(flood(?:ing|ed)?|waterlogged|waterlogging|blocked (?:roadside )?drain|shallow water|standing water)\b/.test(text)) matches.push("flood");
  if (/\b((?:fallen tree|debris|tree).*(?:block|road)|road (?:is )?blocked|blocked road|road blockage)\b/.test(text)) matches.push("road_blockage");
  return matches;
}

export function reportCategory(ai: AIAssessment | null | undefined, description: string): IncidentCategory {
  if (ai && ai.confidence >= 0.8 && ai.category !== "other") return ai.category;
  return reportedHazardCategories(description)[0] ?? "other";
}

export interface DepartmentRecommendation {
  primaryDepartmentName: string;
  primaryDepartmentCode: 'FIRE_RESCUE' | 'ELECTRICITY' | 'MUNICIPAL' | 'MEDICAL' | 'CONTROL_ROOM';
  secondaryDepartmentNames: string[];
  rationale: string;
}

export { DEPARTMENT_CATALOG as KNOWN_DEPARTMENTS } from "./departments";
import { DEPARTMENT_CATALOG, departmentDefinition } from "./departments";

/**
 * Deterministic Department Recommendations (Section 9)
 */
export function recommendDepartments(
  category: IncidentCategory,
  description: string = '',
  secondaryHazards: string[] = []
): DepartmentRecommendation {
  const descLower = description.toLowerCase();
  const secondaryText = secondaryHazards.join(' ').toLowerCase();

  switch (category) {
    case 'electrical_hazard': {
      const secondary: string[] = [];
      let rationale = 'Primary electrical grid hazard requires certified line isolation and repair.';
      
      // If combined with standing water or blocked transit
      if (descLower.includes('flood') || descLower.includes('water') || secondaryText.includes('water')) {
        secondary.push('Municipal / Panchayat & Public Works');
        rationale += ' Standing water exacerbates shock hazard, requiring municipal drainage.';
      }
      if (descLower.includes('fire') || descLower.includes('spark') || descLower.includes('trapped')) {
        secondary.push('Fire & Emergency Services');
        rationale += ' Fire suppression or barrier containment team recommended.';
      }

      return {
        primaryDepartmentName: 'Electricity Distribution Utility (DISCOM)',
        primaryDepartmentCode: 'ELECTRICITY',
        secondaryDepartmentNames: secondary,
        rationale,
      };
    }

    case 'building_damage': {
      const secondary: string[] = ['Health Department & Emergency Medical Services'];
      let rationale = 'Structural instability requires heavy Urban Search and Rescue (USAR) capabilities.';
      
      if (descLower.includes('wire') || descLower.includes('power') || descLower.includes('electric')) {
        secondary.push('Electricity Distribution Utility (DISCOM)');
        rationale += ' Power cut-off recommended to prevent secondary fire.';
      }

      return {
        primaryDepartmentName: 'Fire & Emergency Services',
        primaryDepartmentCode: 'FIRE_RESCUE',
        secondaryDepartmentNames: secondary,
        rationale,
      };
    }

    case 'fire': {
      const secondary: string[] = ['Health Department & Emergency Medical Services'];
      if (descLower.includes('electric') || descLower.includes('wire')) {
        secondary.push('Electricity Distribution Utility (DISCOM)');
      }
      return {
        primaryDepartmentName: 'Fire & Emergency Services',
        primaryDepartmentCode: 'FIRE_RESCUE',
        secondaryDepartmentNames: secondary,
        rationale: 'Active fire containment and rescue operations are the domain of Fire & Emergency Services.',
      };
    }

    case 'flood': {
      const secondary: string[] = [];
      let rationale = 'Inundated roadways and drainage failure require municipal civil dewatering equipment.';
      
      if (descLower.includes('trapped') || descLower.includes('rescue') || descLower.includes('boat')) {
        secondary.push('Fire & Emergency Services');
        rationale += ' Water-rescue units advised for stranded civilians.';
      }
      if (descLower.includes('pole') || descLower.includes('wire') || descLower.includes('current')) {
        secondary.push('Electricity Distribution Utility (DISCOM)');
        rationale += ' Inundated electrical infrastructure poses electrocution risk.';
      }

      return {
        primaryDepartmentName: 'Municipal / Panchayat & Public Works',
        primaryDepartmentCode: 'MUNICIPAL',
        secondaryDepartmentNames: secondary,
        rationale,
      };
    }

    case 'road_blockage': {
      const secondary: string[] = [];
      let rationale = 'Debris removal and road clearance fall under municipal public works.';
      
      if (descLower.includes('wire') || descLower.includes('electric') || descLower.includes('pole')) {
        secondary.push('Electricity Distribution Utility (DISCOM)');
        rationale += ' Downed electrical utilities must be cleared by power engineers.';
      }

      return {
        primaryDepartmentName: 'Municipal / Panchayat & Public Works',
        primaryDepartmentCode: 'MUNICIPAL',
        secondaryDepartmentNames: secondary,
        rationale,
      };
    }

    case 'medical_emergency': {
      return {
        primaryDepartmentName: 'Health Department & Emergency Medical Services',
        primaryDepartmentCode: 'MEDICAL',
        secondaryDepartmentNames: ['Fire & Emergency Services'],
        rationale: 'Casualty triage and emergency ambulance dispatch required.',
      };
    }

    case 'landslide': {
      return {
        primaryDepartmentName: 'Fire & Emergency Services',
        primaryDepartmentCode: 'FIRE_RESCUE',
        secondaryDepartmentNames: ['Municipal / Panchayat & Public Works', 'Health Department & Emergency Medical Services'],
        rationale: 'Mass-earth movement requires joint search/rescue and earth-moving clearing units.',
      };
    }

    case 'other':
    default: {
      return {
        primaryDepartmentName: 'District Emergency Operations Centre (DEOC)',
        primaryDepartmentCode: 'CONTROL_ROOM',
        secondaryDepartmentNames: [],
        rationale: 'Cross-functional or uncategorized disaster report requiring administrative triage.',
      };
    }
  }
}

export function getDepartmentIdByCode(code: string): string | undefined {
  return DEPARTMENT_CATALOG.find(d => d.code === code)?.id;
}

export function getDepartmentIdByName(name: string): string | undefined {
  return departmentDefinition(name)?.id;
}
