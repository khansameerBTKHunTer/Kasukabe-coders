import { Incident, Report, DuplicateMatch } from '../types';

/**
 * Calculates Haversine distance between two coordinates in meters
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Detects duplicate incident candidates within 150-meter radius
 * and compares category, descriptions, and hazard characteristics.
 */
export function findDuplicateCandidates(
  newReport: {
    incident_latitude: number;
    incident_longitude: number;
    category?: string;
    description: string;
    created_at?: string;
  },
  existingIncidents: Incident[],
  radiusThresholdMeters: number = 150
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];

  for (const incident of existingIncidents) {
    const distanceMeters = calculateDistanceMeters(
      newReport.incident_latitude,
      newReport.incident_longitude,
      incident.latitude,
      incident.longitude
    );

    if (distanceMeters <= radiusThresholdMeters) {
      const categoryMatch = !newReport.category || newReport.category === incident.category;
      const reasons: string[] = [];

      reasons.push(`Located ${distanceMeters}m from existing incident #${incident.id.slice(0, 8)} (within ${radiusThresholdMeters}m threshold).`);

      let similarityScore = 0;

      // Distance score (up to 40 pts)
      const distanceProximity = Math.max(0, 1 - distanceMeters / radiusThresholdMeters);
      similarityScore += distanceProximity * 40;

      // Category matching (up to 40 pts)
      if (categoryMatch) {
        similarityScore += 40;
        reasons.push(`Identical disaster category: "${incident.category.replace('_', ' ')}".`);
      } else {
        reasons.push(`Different hazard category ("${newReport.category}" vs "${incident.category}") — separate hazard likely.`);
      }

      // Keyword / description overlap (up to 20 pts)
      const reportWords = new Set(
        newReport.description.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/)
      );
      const incidentWords = new Set(
        incident.description.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/)
      );
      
      let commonWordCount = 0;
      reportWords.forEach(w => {
        if (w.length > 3 && incidentWords.has(w)) commonWordCount++;
      });

      if (commonWordCount >= 3) {
        similarityScore += 20;
        reasons.push(`Shared description keywords: ${commonWordCount} descriptive terms match.`);
      } else if (commonWordCount > 0) {
        similarityScore += 10;
      }

      // Determine confidence band
      let duplicateConfidence: 'high' | 'moderate' | 'unlikely';
      if (categoryMatch && distanceMeters <= 80 && similarityScore >= 70) {
        duplicateConfidence = 'high';
      } else if (categoryMatch && distanceMeters <= 150) {
        duplicateConfidence = 'moderate';
      } else {
        duplicateConfidence = 'unlikely';
      }

      matches.push({
        incident,
        distanceMeters,
        categoryMatch,
        similarityScore: Math.round(similarityScore),
        duplicateConfidence,
        reasons,
      });
    }
  }

  // Sort descending by similarity score
  return matches.sort((a, b) => b.similarityScore - a.similarityScore);
}
