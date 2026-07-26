import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { createApiErrorPayload } from "@/modules/common/api-error";
import { loadServerEnvironment } from "@/modules/common/env";
import { getDatabase } from "@/modules/supabase/database";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const environment = loadServerEnvironment();
    if (!environment.AI_EXTRACTION_ENABLED) {
      return NextResponse.json(
        createApiErrorPayload({
          code: "SERVICE_UNAVAILABLE",
          message: "Tính năng trích xuất AI chưa được bật.",
          requestId,
        }),
        { status: 503 },
      );
    }
    const expectedKey = process.env.AI_WORKER_API_KEY;
    if (!expectedKey || request.headers.get("x-ai-worker-key") !== expectedKey) {
      return NextResponse.json(
        createApiErrorPayload({
          code: "UNAUTHENTICATED",
          message: "Khóa xác thực worker AI không hợp lệ.",
          requestId,
        }),
        { status: 401 },
      );
    }
    const rows = await getDatabase()<{ job_id: string }[]>`
      select job_id from public.ai_extraction_jobs
      where status = 'READY_FOR_AGENT' and worker_type = 'ANTIGRAVITY'
      order by created_at
      limit 10
    `;
    return NextResponse.json(
      { jobIds: rows.map((row) => row.job_id), requestId },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      createApiErrorPayload({
        code: "INTERNAL_ERROR",
        message: "Không thể lấy hàng đợi AI.",
        requestId,
      }),
      { status: 500 },
    );
  }
}
