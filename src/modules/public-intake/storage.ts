import { Readable } from "node:stream";

import { loadGoogleStorageEnvironment, type GoogleStorageEnvironment } from "@/modules/common/env";
import {
  createGoogleWorkspaceClient,
  getGoogleAccessToken,
} from "@/modules/google/workspace-client";
import { getDatabase } from "@/modules/supabase/database";

import { CANONICAL_IMAGE_MIME_TYPES, isCanonicalImageMimeType } from "./image-format";

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const RESUMABLE_ENDPOINT =
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id";

/**
 * Định dạng ảnh chấp nhận, dùng tên chuẩn trong `image-format.ts`. Bí danh như `image/jpg` được
 * quy về tên chuẩn **trước** khi tới đây, nên danh sách này giữ nguyên độ chặt.
 */
export const ACCEPTED_MIME_TYPES = CANONICAL_IMAGE_MIME_TYPES;

export class UploadVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadVerificationError";
  }
}

export class PreviewUnavailableError extends Error {
  constructor(message = "Không thể đọc ảnh xem trước.") {
    super(message);
    this.name = "PreviewUnavailableError";
  }
}

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

export class PublicIntakeStorage {
  private static folderCache = new Map<string, string>();

  constructor(private readonly environment: GoogleStorageEnvironment) {}

  /** Thư mục chờ của mỗi bản kê khai: `01_INBOX/{submissionId}/originals`. */
  async createSubmissionFolder(submissionId: string): Promise<string> {
    const inbox = await this.findOrCreateFolder(
      "01_INBOX",
      this.environment.GOOGLE_MY_DRIVE_ROOT_FOLDER_ID,
    );
    const submissionFolder = await this.findOrCreateFolder(submissionId, inbox);
    return this.findOrCreateFolder("originals", submissionFolder);
  }

  async ensureSubmissionFolder(submissionId: string): Promise<string> {
    // `01_INBOX` is shared by every submission, so retain the existing advisory-lock helper for
    // that one folder — only a cache miss (in practice once per cold start) still holds a
    // transaction while Drive answers. The two descendants are serialized by the per-submission
    // lease in `submission-folder.ts` instead, so they open no transaction at all.
    const inbox = await this.findOrCreateFolder(
      "01_INBOX",
      this.environment.GOOGLE_MY_DRIVE_ROOT_FOLDER_ID,
    );
    const submissionFolder = await this.findOrCreateFolderWithoutDatabaseLock(submissionId, inbox);
    return this.findOrCreateFolderWithoutDatabaseLock("originals", submissionFolder);
  }

  /**
   * Tạo URL phiên resumable upload để trình duyệt PUT trực tiếp tới Google Drive, không đi qua
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
      signal: AbortSignal.timeout(15_000),
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
      fields: "id,name,parents,mimeType,size,sha256Checksum,trashed",
    });
    const file = response.data;

    if (!file.id || file.trashed) {
      throw new UploadVerificationError("Tệp không hợp lệ hoặc đã bị xóa trên Drive.");
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

    if (!file.sha256Checksum) {
      throw new UploadVerificationError("Không thể xác minh mã checksum của tệp.");
    }

    return {
      driveFileId: file.id,
      fileName: file.name ?? file.id,
      mimeType,
      sizeBytes,
      checksum: file.sha256Checksum,
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
    const folderId = await this.findOrCreateFolder(
      "03_EXPORTS",
      this.environment.GOOGLE_MY_DRIVE_ROOT_FOLDER_ID,
    );
    const { drive } = createGoogleWorkspaceClient(this.credentials);
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

  /**
   * Liệt kê tệp trong một thư mục — chỉ dùng cho script rà soát tệp mồ côi.
   *
   * Trả về `id` và `size`, **không** trả `name`: tên tệp có thể mang dấu vết của giấy tờ, mà báo
   * cáo rà soát thì được đọc và dán qua lại giữa nhiều người. Đối chiếu mồ côi chỉ cần ID.
   */
  async listFolderFileIds(folderId: string): Promise<{ id: string; sizeBytes: number }[]> {
    const { drive } = createGoogleWorkspaceClient(this.credentials);
    const found: { id: string; sizeBytes: number }[] = [];
    let pageToken: string | undefined;
    do {
      const page = await drive.files.list({
        q: `'${escapeQueryValue(folderId)}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, size)",
        pageSize: 200,
        pageToken,
      });
      for (const file of page.data.files ?? []) {
        if (file.id) found.push({ id: file.id, sizeBytes: Number(file.size ?? 0) });
      }
      pageToken = page.data.nextPageToken ?? undefined;
    } while (pageToken);
    return found;
  }

  /**
   * Tệp này có nằm trong đúng thư mục của bản kê khai đang gọi hay không.
   *
   * Tách khỏi `verifyUploadedFile` vì hai câu hỏi khác nhau: `verifyUploadedFile` hỏi "tệp có đạt
   * để nhận vào hồ sơ không" (định dạng, dung lượng, checksum), còn hàm này chỉ hỏi "tệp có thuộc
   * hộ dân đang gọi không" — dùng ngay trước khi XÓA. Một tệp sai định dạng vẫn thuộc thư mục của
   * người gọi và vẫn được xóa; một tệp đúng định dạng nhưng nằm ở thư mục hộ khác thì tuyệt đối
   * không.
   *
   * Ném lỗi được coi là "không xác nhận được" ở phía gọi, và phía gọi phải nghiêng về GIỮ tệp.
   */
  async isFileInFolder(driveFileId: string, folderId: string): Promise<boolean> {
    const { drive } = createGoogleWorkspaceClient(this.credentials);
    const response = await drive.files.get({ fileId: driveFileId, fields: "id,parents" });
    return response.data.parents?.includes(folderId) === true;
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
    const response = await fetch(thumbnailLink, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new PreviewUnavailableError();
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 3 * 1024 * 1024) {
      throw new PreviewUnavailableError();
    }
    return { bytes, contentType: response.headers.get("content-type") ?? "image/jpeg" };
  }

  /**
   * Đọc trực tiếp tệp gốc từ Google Drive mà không qua thumbnail.
   * Dành cho màn hình duyệt hồ sơ của cán bộ.
   */
  async readOriginal(driveFileId: string): Promise<PreviewFile> {
    const { drive } = createGoogleWorkspaceClient(this.credentials);
    
    // Kiểm tra kích thước trước khi tải toàn bộ file vào RAM
    const metadata = await drive.files.get({
      fileId: driveFileId,
      fields: "size,mimeType",
    });
    const sizeBytes = Number(metadata.data.size ?? 0);
    // Giới hạn 30 MB giống luồng tải lên
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > 30 * 1024 * 1024) {
      throw new PreviewUnavailableError("Kích thước tệp không hợp lệ hoặc vượt quá giới hạn 30 MB.");
    }

    const response = await drive.files.get(
      { fileId: driveFileId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    
    const bytes = new Uint8Array(response.data as ArrayBuffer);
    if (bytes.byteLength === 0) {
      throw new PreviewUnavailableError("Tệp tin trống.");
    }
    
    return { bytes, contentType: metadata.data.mimeType ?? "application/octet-stream" };
  }

  private get credentials() {
    return {
      clientId: this.environment.GOOGLE_DRIVE_CLIENT_ID,
      clientSecret: this.environment.GOOGLE_DRIVE_CLIENT_SECRET,
      refreshToken: this.environment.GOOGLE_DRIVE_REFRESH_TOKEN,
    };
  }

  /**
   * Tìm hoặc tạo thư mục bằng khóa advisory PostgreSQL theo `(parentId, name)`.
   *
   * `Map` chỉ là cache tối ưu trong một lambda; nó không thể là cơ chế đồng bộ. Khi cache miss,
   * transaction RIÊNG này giữ khóa xuyên mọi Vercel process trong lúc query/create trên Drive, rồi
   * kết thúc ngay. Nhờ vậy hai lambda cùng tạo một nhánh Drive chỉ có một bên thực hiện `create`.
   *
   * Hàm này không được gọi khi caller đã mở `database.begin`: pool Supavisor có `max: 1`, nên mở
   * transaction lồng sẽ tự chờ chính nó. Các caller hiện tại đều gọi nó ngoài transaction nghiệp vụ.
   */
  async findOrCreateFolder(name: string, parentId: string): Promise<string> {
    const cacheKey = `${parentId}:${name}`;
    const cachedId = PublicIntakeStorage.folderCache.get(cacheKey);
    if (cachedId) return cachedId;

    const database = getDatabase();
    return database.begin(async (transaction) => {
      await transaction`
        select pg_advisory_xact_lock(hashtextextended(${`DRIVE_FOLDER:${cacheKey}`}, 0))
      `;

      // Một request cùng process có thể đã hoàn tất trong lúc request này chờ advisory lock.
      const recheckedId = PublicIntakeStorage.folderCache.get(cacheKey);
      if (recheckedId) return recheckedId;

      const folderId = await this.listOrCreateOnDrive(name, parentId);
      PublicIntakeStorage.folderCache.set(cacheKey, folderId);
      return folderId;
    });
  }

  /**
   * List-before-create recovery for a path already serialized by the submission-folder lease.
   * This deliberately performs no database work so a slow Google call cannot occupy Supavisor.
   */
  private async findOrCreateFolderWithoutDatabaseLock(
    name: string,
    parentId: string,
  ): Promise<string> {
    const cacheKey = `${parentId}:${name}`;
    const cachedId = PublicIntakeStorage.folderCache.get(cacheKey);
    if (cachedId) return cachedId;

    const folderId = await this.listOrCreateOnDrive(name, parentId);
    PublicIntakeStorage.folderCache.set(cacheKey, folderId);
    return folderId;
  }

  /**
   * Chỉ phần gọi Drive: list trước, create sau. Không cache, không khóa — hai việc đó do caller
   * quyết định, nên khác biệt duy nhất giữa hai helper ở trên đúng là cơ chế đồng bộ.
   */
  private async listOrCreateOnDrive(name: string, parentId: string): Promise<string> {
    const drive = createGoogleWorkspaceClient(this.credentials).drive;
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
    if (existingId) return existingId;

    const created = await drive.files.create({
      requestBody: { name, mimeType: FOLDER_MIME_TYPE, parents: [parentId] },
      fields: "id",
    });

    const folderId = created.data.id;
    if (!folderId) {
      throw new Error(`Google Drive không tạo được thư mục: ${name}`);
    }
    return folderId;
  }
}

let publicIntakeStorageInstance: PublicIntakeStorage | null = null;

export function getPublicIntakeStorage(): PublicIntakeStorage {
  if (!publicIntakeStorageInstance) {
    publicIntakeStorageInstance = new PublicIntakeStorage(loadGoogleStorageEnvironment());
  }
  return publicIntakeStorageInstance;
}

function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
