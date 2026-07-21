import type { CaseStatus, Neighborhood } from "@/modules/common/domain";

/** Phần nhận diện tối thiểu của hồ sơ, chưa bao gồm dữ liệu định danh cá nhân. */
export interface CaseReference {
  readonly caseId: string;
  readonly neighborhood: Neighborhood;
  readonly status: CaseStatus;
  readonly version: number;
}
