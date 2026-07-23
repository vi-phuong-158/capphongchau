import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { createApiErrorPayload } from "@/modules/common/api-error";
import { checkDatabaseHealth } from "@/modules/supabase/database";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const requestId = `req_${randomUUID()}`;
  try {
    await checkDatabaseHealth();
    return NextResponse.json({
      status: "ok",
      requestId,
      checks: { database: "ok", schema: "ok" },
    });
  } catch {
    return NextResponse.json(
      createApiErrorPayload({
        code: "INTERNAL_ERROR",
        message: "Không thể kết nối cơ sở dữ liệu Supabase hoặc schema chưa được migration.",
        requestId,
        details: { component: "supabase_database" },
      }),
      { status: 503 },
    );
  }
}
