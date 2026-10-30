import { AIAssessment, ImmediateDanger, PriorityBand, PriorityBreakdown } from '../types';

export interface PriorityInput {
  category: string;
  immediateDanger: ImmediateDanger;
  reportedPeopleAffected?: number | null;
  vulnerablePeopleReported?: boolean | null;
  aiAssessment?: AIAssessment | null;
  isNightTime?: boolean;
  sourceType?: string;
  hasMedicalNeed?: boolean;
  isInfrastructureBlocked?: boolean;
}

/**
 * Deterministic Priority Scoring Engine (Section 8)
 * Weights:
 * - Risk to human life: 30%
 * - Visible damage severity: 20%
 * - Secondary hazards: 15%
 * - People affected: 10%
 * - Critical infrastructure: 10%
 * - Time sensitivity: 10%
 * - Vulnerable people: 5%
 * Total = 100%
 */
export function calculatePriorityScore(input: PriorityInput): PriorityBreakdown {
  const missingInformation: string[] = [];
  const reasons: string[] = [];
  let urgentReviewRequired = false;

  // 1. RISK TO HUMAN LIFE (30% Weight)
  let lifeRiskScore = 0;
  let lifeRiskReason = 'Low baseline human life threat observed.';

  if (input.immediateDanger === 'yes') {
    lifeRiskScore = 95;
    lifeRiskReason = 'Reporter flagged active, immediate danger to human life.';
    urgentReviewRequired = true;
  } else if (input.immediateDanger === 'unknown') {
    // Conservative policy: Unknown information is not treated as zero risk (baseline 40 + flagged)
    lifeRiskScore = 45;
    lifeRiskReason = 'Immediate life threat status is unknown; conservative baseline applied.';
    missingInformation.push('Immediate danger to life status unconfirmed');
  } else {
    lifeRiskScore = 15;
  }

  // Factor in category specifics and AI life risk indicators if present
  if (input.aiAssessment?.life_risk_indicators && input.aiAssessment.life_risk_indicators.length > 0) {
    lifeRiskScore = Math.min(100, Math.max(lifeRiskScore, 85));
    lifeRiskReason = `Vision analysis detected high-risk factors: ${input.aiAssessment.life_risk_indicators.join(', ')}`;
    urgentReviewRequired = true;
  } else if (input.category === 'electrical_hazard' || input.category === 'building_damage' || input.category === 'fire') {
    lifeRiskScore = Math.max(lifeRiskScore, 70);
    lifeRiskReason = `Inherent lethal risk category (${input.category.replace('_', ' ')}).`;
  }

  // 2. VISIBLE DAMAGE SEVERITY (20% Weight)
  let damageScore = 20;
  let damageReason = 'Minor visible structural impact.';

  const severity = input.aiAssessment?.severity || 'medium';
  if (severity === 'critical') {
    damageScore = 95;
    damageReason = 'Catastrophic structural failure or severe destruction identified.';
  } else if (severity === 'high') {
    damageScore = 75;
    damageReason = 'Significant structural degradation or deep inundation.';
  } else if (severity === 'medium') {
    damageScore = 50;
    damageReason = 'Moderate localized physical damage.';
  } else {
    damageScore = 20;
    damageReason = 'Surface-level or minor non-structural damage.';
  }

  if (input.aiAssessment?.visible_damage && input.aiAssessment.visible_damage.length > 2) {
    damageScore = Math.min(100, damageScore + 10);
    damageReason += ` (Multiple damage signatures: ${input.aiAssessment.visible_damage.join(', ')})`;
  }

  // 3. SECONDARY HAZARDS (15% Weight)
  let secondaryScore = 20;
  let secondaryReason = 'No acute compound hazards flagged.';

  if (input.aiAssessment?.secondary_hazards && input.aiAssessment.secondary_hazards.length > 0) {
    const count = input.aiAssessment.secondary_hazards.length;
    secondaryScore = Math.min(100, 45 + count * 20);
    secondaryReason = `Compound cascading hazards identified: ${input.aiAssessment.secondary_hazards.join(', ')}`;
  } else if (input.category === 'electrical_hazard') {
    secondaryScore = 80;
    secondaryReason = 'Severe compound shock / electrocution hazard present in disaster zone.';
  } else if (!input.aiAssessment) {
    // Conservative baseline when AI assessment unavailable
    secondaryScore = 35;
    missingInformation.push('Secondary hazard AI inspection pending');
  }

  // 4. PEOPLE AFFECTED (10% Weight)
  let peopleScore = 15;
  let peopleReason = 'Small or single household affected.';

  if (input.reportedPeopleAffected !== null && input.reportedPeopleAffected !== undefined) {
    const count = input.reportedPeopleAffected;
    if (count > 50) {
      peopleScore = 100;
      peopleReason = `Large population impacted (${count}+ individuals).`;
    } else if (count >= 20) {
      peopleScore = 80;
      peopleReason = `Substantial crowd / multiple dwellings impacted (${count} people).`;
    } else if (count >= 5) {
      peopleScore = 55;
      peopleReason = `Neighborhood cluster impacted (${count} people).`;
    } else if (count > 0) {
      peopleScore = 30;
      peopleReason = `Isolated count of ${count} individuals reported.`;
    } else {
      peopleScore = 10;
      peopleReason = 'No civilian casualties reported.';
    }
  } else {
    peopleScore = 35; // Conservative baseline: unknown is not zero
    peopleReason = 'Impacted population count unknown; conservative default applied.';
    missingInformation.push('Number of people affected not specified');
  }

  // 5. CRITICAL INFRASTRUCTURE (10% Weight)
  let infraScore = 20;
  let infraReason = 'Residential or secondary lane location.';

  if (input.aiAssessment?.critical_infrastructure_indicators && input.aiAssessment.critical_infrastructure_indicators.length > 0) {
    infraScore = 85;
    infraReason = `Vital lifeline impacted: ${input.aiAssessment.critical_infrastructure_indicators.join(', ')}`;
  } else if (input.category === 'road_blockage' || input.category === 'electrical_hazard') {
    infraScore = 75;
    infraReason = 'Disruption of vital transit or power distribution corridor.';
  } else if (input.isInfrastructureBlocked) {
    infraScore = 80;
    infraReason = 'Primary transit route confirmed blocked.';
  }

  // 6. TIME SENSITIVITY (10% Weight)
  let timeScore = 30;
  let timeReason = 'Standard response turnaround permissible.';

  if (input.category === 'fire' || input.category === 'medical_emergency' || input.immediateDanger === 'yes') {
    timeScore = 95;
    timeReason = 'Immediate golden-hour intervention required.';
  } else if (input.category === 'electrical_hazard') {
    timeScore = 85;
    timeReason = 'High risk of public electrocution prior to grid isolation.';
  } else if (input.category === 'building_damage') {
    timeScore = 80;
    timeReason = 'Risk of imminent secondary collapse.';
  }

  // 7. VULNERABLE PEOPLE (5% Weight)
  let vulnerableScore = 20;
  let vulnerableReason = 'No specific vulnerable demographics highlighted.';

  if (input.vulnerablePeopleReported === true) {
    vulnerableScore = 90;
    vulnerableReason = 'Elderly, pediatric, mobility-impaired or disabled persons reported in zone.';
  } else if (input.vulnerablePeopleReported === null || input.vulnerablePeopleReported === undefined) {
    vulnerableScore = 30;
    missingInformation.push('Vulnerable population demographic status unconfirmed');
  }

  // Low AI confidence triggers review
  if (input.aiAssessment && input.aiAssessment.confidence < 0.65) {
    urgentReviewRequired = true;
    missingInformation.push(`Low AI confidence score (${Math.round(input.aiAssessment.confidence * 100)}%)`);
    reasons.push('AI model indicated high visual uncertainty — human verification required.');
  }

  // Compute exact weighted sum:
  // priorityScore = SUM(weight * factorScore / 100)
  const weightedSum =
    (lifeRiskScore * 30 +
     damageScore * 20 +
     secondaryScore * 15 +
     peopleScore * 10 +
     infraScore * 10 +
     timeScore * 10 +
     vulnerableScore * 5) / 100;

  // Round to 1 decimal place
  const totalScore = Math.round(weightedSum * 10) / 10;

  // Priority bands:
  // - Critical: 80–100
  // - High: 60–79.99
  // - Medium: 35–59.99
  // - Low: 0–34.99
  let priorityBand: PriorityBand;
  if (totalScore >= 80) {
    priorityBand = 'Critical';
  } else if (totalScore >= 60) {
    priorityBand = 'High';
  } else if (totalScore >= 35) {
    priorityBand = 'Medium';
  } else {
    priorityBand = 'Low';
  }

  // Compile top contributing reasons
  reasons.push(`Life risk weight (30%): ${lifeRiskScore}/100 — ${lifeRiskReason}`);
  reasons.push(`Damage severity (20%): ${damageScore}/100 — ${damageReason}`);
  if (secondaryScore >= 50) {
    reasons.push(`Secondary hazard (15%): ${secondaryScore}/100 — ${secondaryReason}`);
  }
  if (infraScore >= 70) {
    reasons.push(`Infrastructure impact (10%): ${infraScore}/100 — ${infraReason}`);
  }
  if (timeScore >= 75) {
    reasons.push(`Time urgency (10%): ${timeScore}/100 — ${timeReason}`);
  }

  return {
    factors: {
      lifeRisk: { weight: 30, score: lifeRiskScore, reason: lifeRiskReason },
      damageSeverity: { weight: 20, score: damageScore, reason: damageReason },
      secondaryHazards: { weight: 15, score: secondaryScore, reason: secondaryReason },
      peopleAffected: { weight: 10, score: peopleScore, reason: peopleReason },
      criticalInfrastructure: { weight: 10, score: infraScore, reason: infraReason },
      timeSensitivity: { weight: 10, score: timeScore, reason: timeReason },
      vulnerablePeople: { weight: 5, score: vulnerableScore, reason: vulnerableReason },
    },
    totalScore,
    priorityBand,
    reasons,
    missingInformation,
    urgentReviewRequired,
  };
}
