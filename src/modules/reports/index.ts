import type { Neighborhood } from "@/modules/common/domain";

/** Số liệu tổng hợp không chứa thông tin định danh cá nhân. */
export interface NeighborhoodSummary {
  readonly neighborhood: Neighborhood;
  readonly caseCount: number;
}
