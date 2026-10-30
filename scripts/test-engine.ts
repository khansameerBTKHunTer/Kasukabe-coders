import { calculatePriorityScore } from '../src/lib/priority-engine';
import { recommendDepartments } from '../src/lib/department-router';
import { findDuplicateCandidates, calculateDistanceMeters } from '../src/lib/duplicate-detector';
import { getInitialSeedData, IncidentService } from '../src/lib/data-store';

console.log('--- RUNNING DAMAGE MAPPER ENGINE TESTS ---');

// 1. TEST PRIORITY SCORING
console.log('\n[1] Testing Priority Scoring Engine...');
const criticalTest = calculatePriorityScore({
  category: 'electrical_hazard',
  immediateDanger: 'yes',
  reportedPeopleAffected: 50,
  vulnerablePeopleReported: true,
  aiAssessment: {
    category: 'electrical_hazard',
    title: 'Downed High Voltage Line',
    visible_damage: ['snapped_pole', 'exposed_conductor'],
    secondary_hazards: ['electrocution_in_water', 'fire'],
    severity: 'critical',
    confidence: 0.95,
    recommended_departments: ['Electricity Department'],
    life_risk_indicators: ['conductors in pedestrian pool'],
    critical_infrastructure_indicators: ['substation feeder line'],
    uncertainties: [],
    human_review_required: true,
    summary: 'Extreme life hazard.',
  },
});

console.log(`- Critical Test Score: ${criticalTest.totalScore} | Band: ${criticalTest.priorityBand} | Review Required: ${criticalTest.urgentReviewRequired}`);
if (criticalTest.totalScore < 80 || criticalTest.priorityBand !== 'Critical') {
  throw new Error(`Failed: Expected Critical band >= 80, got ${criticalTest.totalScore}`);
}
if (!criticalTest.urgentReviewRequired) {
  throw new Error('Failed: Expected urgentReviewRequired for life risk');
}

// Test Unknown handling (conservative baseline)
const unknownTest = calculatePriorityScore({
  category: 'flood',
  immediateDanger: 'unknown',
  reportedPeopleAffected: null,
});
console.log(`- Unknown Test Score: ${unknownTest.totalScore} | Band: ${unknownTest.priorityBand} | Missing factors: ${unknownTest.missingInformation.length}`);
if (unknownTest.missingInformation.length === 0) {
  throw new Error('Failed: Unknown data must be documented in missingInformation');
}

// 2. TEST DEPARTMENT ROUTING
console.log('\n[2] Testing Department Routing...');
const electRec = recommendDepartments('electrical_hazard', 'sparks flying from pole in water');
console.log(`- Electrical Hazard -> Primary: ${electRec.primaryDepartmentName} (${electRec.primaryDepartmentCode})`);
if (electRec.primaryDepartmentCode !== 'ELECTRICITY') {
  throw new Error(`Failed: Expected ELECTRICITY, got ${electRec.primaryDepartmentCode}`);
}

const buildRec = recommendDepartments('building_damage', 'collapsed commercial shopfront');
console.log(`- Building Collapse -> Primary: ${buildRec.primaryDepartmentName} (${buildRec.primaryDepartmentCode})`);
if (buildRec.primaryDepartmentCode !== 'FIRE_RESCUE') {
  throw new Error(`Failed: Expected FIRE_RESCUE, got ${buildRec.primaryDepartmentCode}`);
}

const floodRec = recommendDepartments('flood', 'submerged highway road');
console.log(`- Flooded Road -> Primary: ${floodRec.primaryDepartmentName} (${floodRec.primaryDepartmentCode})`);
if (floodRec.primaryDepartmentCode !== 'MUNICIPAL') {
  throw new Error(`Failed: Expected MUNICIPAL, got ${floodRec.primaryDepartmentCode}`);
}

// 3. TEST DUPLICATE DETECTION AND SEPARATION
console.log('\n[3] Testing Duplicate Detection...');
const seed = getInitialSeedData();
console.log(`Initial Seed: ${seed.reports.length} reports, ${seed.incidents.length} distinct incidents.`);

// Check distance between Report 1 (22.9447, 90.8282) and Report 2 (22.9451, 90.8286)
const dist1_2 = calculateDistanceMeters(22.9447, 90.8282, 22.9451, 90.8286);
console.log(`Distance between College Road flood Report 1 and Report 2: ${dist1_2}m (Expected < 150m)`);
if (dist1_2 > 150) {
  throw new Error(`Failed: Distance ${dist1_2}m exceeds 150m threshold`);
}

// Check distance between Report 1 (College Rd flood) and Report 6 (Station Rd North flood)
const dist1_6 = calculateDistanceMeters(22.9447, 90.8282, 22.9560, 90.8350);
console.log(`Distance between College Road flood and Station Road North flood: ${dist1_6}m (Expected > 1000m)`);
if (dist1_6 <= 150) {
  throw new Error(`Failed: Station Road North should be > 150m away`);
}

// Check nearby different hazard: Fallen Pole (22.9449, 90.8284) vs Flooded Road (22.9447, 90.8282)
const distPoleRoad = calculateDistanceMeters(22.9447, 90.8282, 22.9449, 90.8284);
console.log(`Distance between Fallen Pole and Flooded Road: ${distPoleRoad}m`);
const candidates = findDuplicateCandidates(
  {
    incident_latitude: 22.9449,
    incident_longitude: 90.8284,
    category: 'electrical_hazard',
    description: 'fallen electrical pole with sparks',
  },
  seed.incidents,
  150
);

console.log(`Candidates found near pole within 150m: ${candidates.length}`);
const floodCandidate = candidates.find(c => c.incident.category === 'flood');
if (floodCandidate && floodCandidate.duplicateConfidence === 'high') {
  throw new Error('Failed: Electrical hazard should NOT be flagged as high duplicate confidence with flood incident!');
}
console.log(`- Cross-hazard check passed: electrical hazard is distinct from flood incident.`);

console.log('\n>>> ALL CORE ENGINE LOGIC TESTS PASSED SUCCESSFULLY! <<<');
