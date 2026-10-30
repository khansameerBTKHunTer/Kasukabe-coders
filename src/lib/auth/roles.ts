import type { Profile, UserRole } from "@/types";

import { DEPARTMENT_CATALOG, departmentRole } from "@/lib/departments";

export const DEPARTMENT_ROLES: Record<string, UserRole> = Object.fromEntries(
  DEPARTMENT_CATALOG.filter(department => department.role !== "admin")
    .map(department => [department.code, department.role]),
);
export const ROLE_LABELS: Record<UserRole, string> = {
  citizen: "Citizen",
  fire_rescue: "Fire & Emergency Services",
  electricity: "Electricity Distribution Utility (DISCOM)",
  municipal: "Municipal / Panchayat & Public Works",
  medical: "Health & Emergency Medical Services",
  relief_responder: "Relief Partner",
  admin: "District Emergency Operations Centre",
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
    if (!profile.department || departmentRole(profile.department.code) !== profile.role)
      return "Your role and department do not match. Contact the project administrator.";
  }
  return null;
}
