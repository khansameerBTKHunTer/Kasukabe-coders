import { IncidentCategory } from '../types';

export interface DepartmentRecommendation {
  primaryDepartmentName: string;
  primaryDepartmentCode: 'FIRE_RESCUE' | 'ELECTRICITY' | 'MUNICIPAL' | 'MEDICAL' | 'CONTROL_ROOM';
  secondaryDepartmentNames: string[];
  rationale: string;
}

export const KNOWN_DEPARTMENTS = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Fire & Rescue', code: 'FIRE_RESCUE' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Electricity Department', code: 'ELECTRICITY' },
  { id: '33333333-3333-3333-3333-333333333333', name: 'Municipal / Road Services', code: 'MUNICIPAL' },
  { id: '44444444-4444-4444-4444-444444444444', name: 'Medical Response', code: 'MEDICAL' },
  { id: '55555555-5555-5555-5555-555555555555', name: 'Control Room / Disaster Management', code: 'CONTROL_ROOM' },
] as const;

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
        secondary.push('Municipal / Road Services');
        rationale += ' Standing water exacerbates shock hazard, requiring municipal drainage.';
      }
      if (descLower.includes('fire') || descLower.includes('spark') || descLower.includes('trapped')) {
        secondary.push('Fire & Rescue');
        rationale += ' Fire suppression or barrier containment team recommended.';
      }

      return {
        primaryDepartmentName: 'Electricity Department',
        primaryDepartmentCode: 'ELECTRICITY',
        secondaryDepartmentNames: secondary,
        rationale,
      };
    }

    case 'building_damage': {
      const secondary: string[] = ['Medical Response'];
      let rationale = 'Structural instability requires heavy Urban Search and Rescue (USAR) capabilities.';
      
      if (descLower.includes('wire') || descLower.includes('power') || descLower.includes('electric')) {
        secondary.push('Electricity Department');
        rationale += ' Power cut-off recommended to prevent secondary fire.';
      }

      return {
        primaryDepartmentName: 'Fire & Rescue',
        primaryDepartmentCode: 'FIRE_RESCUE',
        secondaryDepartmentNames: secondary,
        rationale,
      };
    }

    case 'fire': {
      const secondary: string[] = ['Medical Response'];
      if (descLower.includes('electric') || descLower.includes('wire')) {
        secondary.push('Electricity Department');
      }
      return {
        primaryDepartmentName: 'Fire & Rescue',
        primaryDepartmentCode: 'FIRE_RESCUE',
        secondaryDepartmentNames: secondary,
        rationale: 'Active fire containment and rescue operations are the domain of Fire & Rescue.',
      };
    }

    case 'flood': {
      const secondary: string[] = [];
      let rationale = 'Inundated roadways and drainage failure require municipal civil dewatering equipment.';
      
      if (descLower.includes('trapped') || descLower.includes('rescue') || descLower.includes('boat')) {
        secondary.push('Fire & Rescue');
        rationale += ' Water-rescue units advised for stranded civilians.';
      }
      if (descLower.includes('pole') || descLower.includes('wire') || descLower.includes('current')) {
        secondary.push('Electricity Department');
        rationale += ' Inundated electrical infrastructure poses electrocution risk.';
      }

      return {
        primaryDepartmentName: 'Municipal / Road Services',
        primaryDepartmentCode: 'MUNICIPAL',
        secondaryDepartmentNames: secondary,
        rationale,
      };
    }

    case 'road_blockage': {
      const secondary: string[] = [];
      let rationale = 'Debris removal and road clearance fall under municipal public works.';
      
      if (descLower.includes('wire') || descLower.includes('electric') || descLower.includes('pole')) {
        secondary.push('Electricity Department');
        rationale += ' Downed electrical utilities must be cleared by power engineers.';
      }

      return {
        primaryDepartmentName: 'Municipal / Road Services',
        primaryDepartmentCode: 'MUNICIPAL',
        secondaryDepartmentNames: secondary,
        rationale,
      };
    }

    case 'medical_emergency': {
      return {
        primaryDepartmentName: 'Medical Response',
        primaryDepartmentCode: 'MEDICAL',
        secondaryDepartmentNames: ['Fire & Rescue'],
        rationale: 'Casualty triage and emergency ambulance dispatch required.',
      };
    }

    case 'landslide': {
      return {
        primaryDepartmentName: 'Fire & Rescue',
        primaryDepartmentCode: 'FIRE_RESCUE',
        secondaryDepartmentNames: ['Municipal / Road Services', 'Medical Response'],
        rationale: 'Mass-earth movement requires joint search/rescue and earth-moving clearing units.',
      };
    }

    case 'other':
    default: {
      return {
        primaryDepartmentName: 'Control Room / Disaster Management',
        primaryDepartmentCode: 'CONTROL_ROOM',
        secondaryDepartmentNames: [],
        rationale: 'Cross-functional or uncategorized disaster report requiring administrative triage.',
      };
    }
  }
}

export function getDepartmentIdByCode(code: string): string | undefined {
  return KNOWN_DEPARTMENTS.find(d => d.code === code)?.id;
}

export function getDepartmentIdByName(name: string): string | undefined {
  return KNOWN_DEPARTMENTS.find(d => d.name.toLowerCase() === name.toLowerCase())?.id;
}
