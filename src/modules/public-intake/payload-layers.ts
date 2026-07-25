import type { IntakeDraft } from "./types";
import type { SubmissionRecord } from "./repository";

export type PayloadLayer = "CITIZEN" | "WORKING";

/**
 * Trả về bản kê khai có hiệu lực hiện tại theo thứ tự ưu tiên:
 * workingPayload (cán bộ đang duyệt/sửa) > citizenPayload (bản người dân gửi) > draft (nháp cũ)
 */
export function effectivePayload(record: SubmissionRecord): IntakeDraft | null {
  return record.workingPayload ?? record.citizenPayload ?? record.draft;
}

/**
 * Trả về lớp dữ liệu hiện tại đang có hiệu lực trong bản ghi
 */
export function payloadLayerOf(record: SubmissionRecord): PayloadLayer | "DRAFT" {
  if (record.workingPayload) return "WORKING";
  if (record.citizenPayload) return "CITIZEN";
  return "DRAFT";
}
