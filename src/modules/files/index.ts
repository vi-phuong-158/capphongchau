export enum FileDocumentType {
  IDENTITY_CARD_FRONT = "IDENTITY_CARD_FRONT",
  IDENTITY_CARD_BACK = "IDENTITY_CARD_BACK",
  CERTIFICATE = "CERTIFICATE",
}

export enum FileVariant {
  ORIGINAL = "ORIGINAL",
  PREVIEW = "PREVIEW",
}

export enum FileStatus {
  ACTIVE = "ACTIVE",
  REPLACED = "REPLACED",
  DELETED = "DELETED",
}

/** Định danh nội bộ của file luôn tách khỏi Drive ID để hỗ trợ migration sau này. */
export interface FileReference {
  readonly fileId: string;
  readonly caseId: string;
  readonly documentType: FileDocumentType;
  readonly variant: FileVariant;
  readonly status: FileStatus;
}
