import type { IntakeDraft } from "@/modules/public-intake/types";

export interface StaffSubmissionDetail {
  readonly submissionId: string;
  readonly receiptCode: string;
  readonly status: string;
  readonly phone: string;
  readonly version: number;
  readonly claimedBy: string | null;
  readonly claimedByDisplayName: string | null;
  readonly intakeChannel: string | null;
  readonly assistedByDisplayName: string | null;
  readonly claimedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly officialCaseId: string | null;
  readonly acceptStep: string | null;
  readonly canResetAccessSecret: boolean;
  readonly draft: IntakeDraft | null;
  readonly payloadLayer: string;
  readonly citizenPayload: IntakeDraft | null;
  readonly workingPayload: IntakeDraft | null;
  readonly officialPayload: IntakeDraft | null;
  readonly files: readonly {
    fileId: string;
    documentType: "CITIZEN_ID_FRONT" | "CITIZEN_ID_BACK" | "CERTIFICATE";
    ownerId: string;
  }[];
}
