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

export enum CaseStatus {
  DRAFT = "DRAFT",
  UPLOADED = "UPLOADED",
  PENDING_REVIEW = "PENDING_REVIEW",
  NEEDS_MORE_DOCUMENTS = "NEEDS_MORE_DOCUMENTS",
  VERIFIED = "VERIFIED",
  ARCHIVED = "ARCHIVED",
}
