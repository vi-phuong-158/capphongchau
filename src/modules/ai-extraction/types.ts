export type AiJobStatus =
  | "QUEUED"
  | "READY_FOR_AGENT"
  | "PROCESSING"
  | "VALIDATING"
  | "COMPLETED"
  | "NEEDS_REVIEW"
  | "FAILED"
  | "QUARANTINED"
  | "STALE"
  | "CANCELLED";

export interface AiExtractionJob {
  jobId: string;
  submissionId?: string;
  caseId?: string;
  subjectType: "PUBLIC_SUBMISSION" | "CASE";
  citizenPayloadVersion: number;
  status: AiJobStatus;
  workerType: string;
  workerInstanceId: string;
  schemaVersion: string;
  promptVersion: string;
  modelName: string;
  inputFingerprint: string;
  inputFiles: readonly AiExtractionJobFile[];
  attemptCount: number;
  claimedAt?: string;
  leaseExpiresAt?: string;
  startedAt?: string;
  completedAt?: string;
  errorCode?: string;
  errorMessageRedacted?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiExtractionJobFile {
  fileId: string;
  checksum: string;
  fileName: string;
  ordinal: number;
}

export interface AiExtractionResult {
  resultId: string;
  jobId: string;
  resultVersion: number;
  rawJson: unknown;
  normalizedJson: unknown;
  validationStatus: "PASSED" | "REVIEW_REQUIRED" | "BLOCKED";
  warningCount: number;
  blockingIssueCount: number;
  resultFingerprint: string;
  modelName: string;
  promptVersion: string;
  processedAt?: string;
  createdAt: string;
}
