"use client";

import { IntakeWizard } from "@/app/ke-khai/wizard";

/**
 * Bọc mỏng quanh wizard công khai.
 *
 * Tồn tại chỉ để trang máy chủ (`page.tsx`) truyền tên cán bộ xuống mà không phải tự thành client
 * component — `requireActiveUser` chỉ chạy được ở phía máy chủ.
 */
export function AssistedIntakeWizard({ officerName }: { officerName: string }) {
  return <IntakeWizard assisted={{ officerName }} />;
}
