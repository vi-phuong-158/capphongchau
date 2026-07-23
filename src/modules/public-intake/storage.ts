import { Readable } from "node:stream";

import { loadGoogleStorageEnvironment, type GoogleStorageEnvironment } from "@/modules/common/env";
import {
  createGoogleWorkspaceClient,
  getGoogleAccessToken,
} from "@/modules/google/workspace-client";

import { CANONICAL_IMAGE_MIME_TYPES, isCanonicalImageMimeType } from "./image-format";

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const RESUMABLE_ENDPOINT =
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id";

/**
 * Định dạng ảnh chấp nhận, dùng tên chuẩn trong `image-format.ts`. Bí danh như `image/jpg` được
 * quy về tên chuẩn **trước** khi tới đây, nên danh sách này giữ nguyên độ chặt.
 */
export const ACCEPTED_MIME_TYPES = CANONICAL_IMAGE_MIME_TYPES;

export interface UploadSession {
  readonly uploadUrl: string;
  readonly folderId: string;
}

export interface VerifiedFile {
  readonly driveFileId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksum: string;
}

export interface PreviewFile {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export class PublicIntakeStorage {
  constructor(
    private readonly environment: GoogleStorageEnvironment = loadGoogleStorageEnvironment(),
  ) {}

  /** Thư mục chờ của mỗi bản kê khai: `01_INBOX/{submission_id}/originals`. */
  async createSubmissionFolder(submissionId: string): Promise<string> {
    const inbox = await this.findOrCreateFolder(
      "01_INBOX",
      this.environment.GOOGLE_MY_DRIVE_ROOT_FOLDER_ID,
    );
    const submissionFolder = await this.findOrCreateFolder(submissionId, inbox);
    return this.findOrCreateFolder("originals", submissionFolder);
  }

  /**
   * Tạo phiên resumable để trình duyệt tải thẳng lên Drive — ảnh gốc không đi qua body của
   * Vercel Function. URL phiên là bí mật: không log, không đưa vào audit.
   */
  async createUploadSession(input: {
    folderId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    /**
     * Origin của trình duyệt sẽ thực hiện PUT. Bắt buộc: Google chỉ gắn CORS header cho phiên
     * resumable nếu `Origin` được gửi **lúc tạo phiên**; thiếu nó thì PUT từ trình duyệt bị
     * chặn và treo. Chỉ truyền origin của chính ứng dụng, không phản chiếu origin lạ.
     */
    browserOrigin: string;
  }): Promise<UploadSession> {
    const token = await getGoogleAccessToken(this.credentials);

    const response = await fetch(RESUMABLE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": input.mimeType,
        "X-Upload-Content-Length": String(input.sizeBytes),
        Origin: input.browserOrigin,
      },
      body: JSON.stringify({ name: input.fileName, parents: [input.folderId] }),
    });

    if (!response.ok) {
      throw new Error(`Google Drive từ chối tạo phiên tải lên (HTTP ${response.status}).`);
    }

    const uploadUrl = response.headers.get("location");
    if (!uploadUrl) {
      throw new Error("Google Drive không trả URL phiên tải lên.");
    }

    return { uploadUrl, folderId: input.folderId };
  }

  /**
   * Xác minh sau khi trình duyệt báo tải xong: đúng thư mục cha, đúng loại, đúng kích thước.
   * Không tin dữ liệu client khai — đây là ranh giới tin cậy duy nhất của luồng upload.
   */
  async verifyUploadedFile(input: {
    driveFileId: string;
    expectedFolderId: string;
    maxBytes: number;
  }): Promise<VerifiedFile> {
    const { drive } = createGoogleWorkspaceClient(this.credentials);

    const response = await drive.files.get({
      fileId: input.driveFileId,
      fields: "id,name,parents,mimeType,size,sha256Checksum",
    });
    const file = response.data;

    if (!file.id) {
      throw new UploadVerificationError("Không tìm thấy tệp trên Drive.");
    }
    if (!file.parents?.includes(input.expectedFolderId)) {
      throw new UploadVerificationError("Tệp không nằm trong thư mục của bản kê khai.");
    }

    // Ranh giới tin cậy thật của luồng upload: `mimeType` ở đây do chính Drive nhận dạng từ nội
    // dung tệp, không phải thứ trình duyệt khai. Tệp đổi đuôi để qua mặt sẽ bị chặn tại đây.
    const mimeType = file.mimeType ?? "";
    if (!isCanonicalImageMimeType(mimeType)) {
      throw new UploadVerificationError("Định dạng tệp không được chấp nhận.");
    }

    const sizeBytes = Number(file.size ?? 0);
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > input.maxBytes) {
      throw new UploadVerificationError("Kích thước tệp vượt giới hạn cho phép.");
    }

    return {
      driveFileId: file.id,
      fileName: file.name ?? file.id,
      mimeType,
      sizeBytes,
      checksum: file.sha256Checksum ?? "",
    };
  }

  /**
   * Lưu file kết xuất (XLSX) vào `03_EXPORTS`, trả về Drive file ID để ghi `EXPORT_JOBS`. Đây là
   * upload có nội dung (media), khác luồng resumable của ảnh — file báo cáo nhỏ, đi qua server được.
   */
  async uploadExport(input: {
    fileName: string;
    mimeType: string;
    bytes: Uint8Array;
  }): Promise<string> {
    const { drive } = createGoogleWorkspaceClient(this.credentials);
    const folderId = await this.findOrCreateFolder(
      "03_EXPORTS",
      this.environment.GOOGLE_MY_DRIVE_ROOT_FOLDER_ID,
    );
    const created = await drive.files.create({
      requestBody: { name: input.fileName, parents: [folderId] },
      media: { mimeType: input.mimeType, body: Readable.from(Buffer.from(input.bytes)) },
      fields: "id",
    });
    if (!created.data.id) {
      throw new Error("Google Drive không trả file ID cho bản kết xuất.");
    }
    return created.data.id;
  }

  /** Tệp không đạt xác minh phải rời khỏi Drive ngay, không để tích rác (PLAN_NL §6.3). */
  async discardFile(driveFileId: string): Promise<void> {
    const { drive } = createGoogleWorkspaceClient(this.credentials);
    await drive.files.delete({ fileId: driveFileId });
  }

  /**
   * Drive sinh thumbnail riêng, nên ảnh gốc không đi qua Vercel Function khi cán bộ đối chiếu.
   * URL thumbnail chỉ dùng nội bộ trong request này, không trả về trình duyệt và không ghi log.
   */
  async readPreview(driveFileId: string): Promise<PreviewFile> {
    const { drive } = createGoogleWorkspaceClient(this.credentials);
    const metadata = await drive.files.get({
      fileId: driveFileId,
      fields: "thumbnailLink,mimeType",
    });
    const thumbnailLink = metadata.data.thumbnailLink;
    if (!thumbnailLink) {
      throw new PreviewUnavailableError();
    }
    const token = await getGoogleAccessToken(this.credentials);
    const response = await fetch(thumbnailLink, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      throw new PreviewUnavailableError();
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 3 * 1024 * 1024) {
      throw new PreviewUnavailableError();
    }
    return { bytes, contentType: response.headers.get("content-type") ?? "image/jpeg" };
  }

  private get credentials() {
    return {
      clientId: this.environment.GOOGLE_DRIVE_CLIENT_ID,
      clientSecret: this.environment.GOOGLE_DRIVE_CLIENT_SECRET,
      refreshToken: this.environment.GOOGLE_DRIVE_REFRESH_TOKEN,
    };
  }

  private async findOrCreateFolder(name: string, parentId: string): Promise<string> {
    const { drive } = createGoogleWorkspaceClient(this.credentials);

    const existing = await drive.files.list({
      q: [
        `name = '${escapeQueryValue(name)}'`,
        `mimeType = '${FOLDER_MIME_TYPE}'`,
        `'${parentId}' in parents`,
        "trashed = false",
      ].join(" and "),
      fields: "files(id)",
      pageSize: 1,
    });

    const existingId = existing.data.files?.[0]?.id;
    if (existingId) {
      return existingId;
    }

    const created = await drive.files.create({
      requestBody: { name, mimeType: FOLDER_MIME_TYPE, parents: [parentId] },
      fields: "id",
    });
    if (!created.data.id) {
      throw new Error(`Google Drive không trả folder ID cho ${name}.`);
    }
    return created.data.id;
  }
}

export class UploadVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadVerificationError";
  }
}

export class PreviewUnavailableError extends Error {
  constructor() {
    super("Chưa tạo được ảnh xem trước cho tệp này.");
    this.name = "PreviewUnavailableError";
  }
}

export function getPublicIntakeStorage(): PublicIntakeStorage {
  return new PublicIntakeStorage();
}
