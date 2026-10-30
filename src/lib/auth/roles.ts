import type { Profile, UserRole } from "@/types";

export const DEPARTMENT_ROLES = {
  FIRE_RESCUE: "fire_rescue",
  ELECTRICITY: "electricity",
  MUNICIPAL: "municipal",
  MEDICAL: "medical",
} as const;
export const ROLE_LABELS: Record<UserRole, string> = {
  citizen: "Citizen",
  fire_rescue: "Fire & Rescue",
  electricity: "Electricity Department",
  municipal: "Municipal / Road Services",
  medical: "Medical Response",
  admin: "Control Room",
};
export function profileAccessError(profile: Profile): string | null {
  if (!Object.prototype.hasOwnProperty.call(ROLE_LABELS, profile.role))
    return "This account has an unsupported role. Contact the project administrator.";
  if (!["approved", "pending", "rejected"].includes(profile.approval_status))
    return "Profile setup is incomplete. Ask the project administrator to check the integration migration.";
  if (profile.approval_status !== "approved")
    return `Account access is ${profile.approval_status}. Contact the project administrator.`;
  if (profile.role !== "citizen" && !profile.department_id)
    return "Your account has no assigned department. Contact the project administrator.";
  if (profile.role !== "citizen" && profile.role !== "admin") {
    const code = Object.entries(DEPARTMENT_ROLES).find(
      ([, role]) => role === profile.role,
    )?.[0];
    if (!profile.department || profile.department.code !== code)
      return "Your role and department do not match. Contact the project administrator.";
  }
  return null;
}
