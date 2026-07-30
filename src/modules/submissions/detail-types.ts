import type { PayloadLayer } from "@/modules/public-intake/payload-layers";
import type { IntakeChannel, PublicStatus } from "@/modules/public-intake/repository";
import type { IntakeDraft } from "@/modules/public-intake/types";

/**
 * Dữ liệu một hồ sơ dùng cho màn duyệt của cán bộ.
 *
 * Đây là **nguồn duy nhất** của hình dạng dữ liệu này: cả `GET /api/submissions/:id` và trang server
 * `/submissions/[submissionId]` (server-priming) đều trả về đúng kiểu này, và `SubmissionDetail` lấy
 * luôn kiểu này làm kiểu prop. Đừng khai lại hình dạng này trong component client — thêm một trường
 * (ví dụ `internalNotes`) sẽ phải sửa hai nơi và rất dễ lệch.
 */
export interface StaffSubmissionDetail {
  readonly submissionId: string;
  readonly receiptCode: string;
  readonly status: PublicStatus;
  readonly phone: string;
  readonly version: number;
  readonly claimedBy: string | null;
  readonly claimedByDisplayName: string | null;
  readonly intakeChannel: IntakeChannel;
  readonly assistedByDisplayName: string | null;
  readonly claimedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly officialCaseId: string | null;
  readonly acceptStep: string | null;
  /** Ghi chú nội bộ của cán bộ — không hiển thị cho người dân (migration `202607290006`). */
  readonly internalNotes: string;
  readonly canResetAccessSecret: boolean;
  readonly draft: IntakeDraft | null;
  readonly payloadLayer: PayloadLayer | "DRAFT";
  readonly citizenPayload: IntakeDraft | null;
  readonly workingPayload: IntakeDraft | null;
  readonly officialPayload: IntakeDraft | null;
  readonly files: readonly {
    fileId: string;
    documentType: "CITIZEN_ID_FRONT" | "CITIZEN_ID_BACK" | "CERTIFICATE";
    ownerId: string;
  }[];
}
