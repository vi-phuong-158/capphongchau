export const NEIGHBORHOODS = [
  "Hà Thạch",
  "Lũng Thượng",
  "Phú An",
  "Phú Cường",
  "Phú Điền",
  "Phú Hộ",
  "Phú Lợi",
  "Phú Xuân",
  "Phúc Lợi",
  "Thống Nhất",
] as const;

export type Neighborhood = (typeof NEIGHBORHOODS)[number];

export enum UserRole {
  SYSTEM_ADMIN = "SYSTEM_ADMIN",
  WARD_ADMIN = "WARD_ADMIN",
  INTAKE_OFFICER = "INTAKE_OFFICER",
  REVIEW_OFFICER = "REVIEW_OFFICER",
  POPULATION_MATCH_OFFICER = "POPULATION_MATCH_OFFICER",
  REPORT_VIEWER = "REPORT_VIEWER",
  AUDITOR = "AUDITOR",
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.SYSTEM_ADMIN]: "Quản trị hệ thống",
  [UserRole.WARD_ADMIN]: "Quản trị phường",
  [UserRole.INTAKE_OFFICER]: "Cán bộ tiếp nhận",
  [UserRole.REVIEW_OFFICER]: "Cán bộ duyệt",
  [UserRole.POPULATION_MATCH_OFFICER]: "Cán bộ đối soát",
  [UserRole.REPORT_VIEWER]: "Người xem báo cáo",
  [UserRole.AUDITOR]: "Kiểm toán viên",
};

export function formatUserRoles(roles: readonly UserRole[]): string {
  if (!roles || roles.length === 0) return "Chưa phân quyền";
  return roles.map((r) => USER_ROLE_LABELS[r] ?? r).join(", ");
}

export enum CaseStatus {
  DRAFT = "DRAFT",
  UPLOADED = "UPLOADED",
  PENDING_REVIEW = "PENDING_REVIEW",
  NEEDS_MORE_DOCUMENTS = "NEEDS_MORE_DOCUMENTS",
  VERIFIED = "VERIFIED",
  ARCHIVED = "ARCHIVED",
}
