import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { verifyCsrfToken } from "@/modules/auth/csrf";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { UserRole } from "@/modules/common/domain";
import { loadServerEnvironment } from "@/modules/common/env";
import {
  getUserRepository,
  IdempotencyConflictError,
  type ManagedUser,
  UserAlreadyExistsError,
} from "@/modules/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const userInputSchema = z.object({
  email: z.email(),
  roles: z.array(z.enum(UserRole)).min(1).max(Object.values(UserRole).length),
  active: z.boolean(),
  displayName: z.string().trim().min(1).max(160),
});

const updateUserInputSchema = z
  .object({
    email: z.email(),
    roles: z.array(z.enum(UserRole)).min(1).max(Object.values(UserRole).length).optional(),
    active: z.boolean().optional(),
    displayName: z.string().trim().min(1).max(160).optional(),
  })
  .refine(
    (body) =>
      body.roles !== undefined || body.active !== undefined || body.displayName !== undefined,
    {
      message: "Cần có ít nhất một trường cần cập nhật.",
    },
  );

function requestId(request: NextRequest): string {
  const candidate = request.headers.get("x-request-id");
  return candidate && candidate.length <= 128 ? candidate : randomUUID();
}

function errorResponse(
  code:
    | "ACCESS_DENIED"
    | "IDEMPOTENCY_CONFLICT"
    | "INTERNAL_ERROR"
    | "UNAUTHENTICATED"
    | "VALIDATION_FAILED",
  message: string,
  requestIdValue: string,
  status: number,
): NextResponse {
  return NextResponse.json(createApiErrorPayload({ code, message, requestId: requestIdValue }), {
    status,
    headers: { "cache-control": "no-store" },
  });
}

async function requireSystemAdmin(request: NextRequest) {
  const user = await requireActiveUser([UserRole.SYSTEM_ADMIN]);
  const environment = loadServerEnvironment();
  if (!verifyCsrfToken(environment.AUTH_SECRET, user.email, request.headers.get("x-csrf-token"))) {
    throw new CsrfValidationError();
  }
  return { user, environment };
}

function publicUser(user: ManagedUser): ManagedUser {
  return user;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestIdValue = requestId(request);
  try {
    await requireActiveUser([UserRole.SYSTEM_ADMIN]);
    const users = await getUserRepository().list();
    return NextResponse.json(
      { users: users.map(publicUser), requestId: requestIdValue },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(
        error.kind,
        error.message,
        requestIdValue,
        error.kind === "UNAUTHENTICATED" ? 401 : 403,
      );
    }
    return errorResponse(
      "INTERNAL_ERROR",
      "Không thể tải danh sách người dùng.",
      requestIdValue,
      500,
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestIdValue = requestId(request);
  try {
    const { user } = await requireSystemAdmin(request);
    const input = userInputSchema.safeParse(await request.json());
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!input.success || !idempotencyKey || idempotencyKey.length > 256) {
      return errorResponse(
        "VALIDATION_FAILED",
        "Dữ liệu người dùng hoặc idempotency key không hợp lệ.",
        requestIdValue,
        400,
      );
    }
    const email = input.data.email.trim().toLowerCase();
    const repository = getUserRepository();
    const created = await repository.mutate({
      ...input.data,
      mode: "CREATE",
      email,
      actorEmail: user.email,
      requestId: requestIdValue,
      idempotencyKey,
    });
    return NextResponse.json(
      { user: publicUser(created), requestId: requestIdValue },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return mutationError(error, requestIdValue);
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const requestIdValue = requestId(request);
  try {
    const { user, environment } = await requireSystemAdmin(request);
    const input = updateUserInputSchema.safeParse(await request.json());
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!input.success || !idempotencyKey || idempotencyKey.length > 256) {
      return errorResponse(
        "VALIDATION_FAILED",
        "Dữ liệu người dùng hoặc idempotency key không hợp lệ.",
        requestIdValue,
        400,
      );
    }
    const email = input.data.email.trim().toLowerCase();
    const repository = getUserRepository();
    const current = (await repository.list()).find((candidate) => candidate.email === email);
    if (!current) {
      return errorResponse(
        "VALIDATION_FAILED",
        "Không tìm thấy người dùng cần cập nhật.",
        requestIdValue,
        400,
      );
    }
    const nextRoles = input.data.roles ?? current.roles;
    const nextActive = input.data.active ?? current.active;
    const isPrimaryAdmin = email === environment.SYSTEM_ADMIN_EMAIL.trim().toLowerCase();
    if (isPrimaryAdmin && (!nextActive || !nextRoles.includes(UserRole.SYSTEM_ADMIN))) {
      return errorResponse(
        "ACCESS_DENIED",
        "Không thể khóa hoặc tước quyền quản trị của tài khoản quản trị gốc.",
        requestIdValue,
        403,
      );
    }
    const updated = await repository.mutate({
      mode: "UPDATE",
      email,
      roles: nextRoles,
      active: nextActive,
      displayName: input.data.displayName ?? current.displayName,
      actorEmail: user.email,
      requestId: requestIdValue,
      idempotencyKey,
    });
    return NextResponse.json(
      { user: publicUser(updated), requestId: requestIdValue },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return mutationError(error, requestIdValue);
  }
}

class CsrfValidationError extends Error {}

function mutationError(error: unknown, requestIdValue: string): NextResponse {
  if (error instanceof AuthorizationError) {
    return errorResponse(
      error.kind,
      error.message,
      requestIdValue,
      error.kind === "UNAUTHENTICATED" ? 401 : 403,
    );
  }
  if (error instanceof CsrfValidationError) {
    return errorResponse(
      "ACCESS_DENIED",
      "Yêu cầu bảo mật không hợp lệ hoặc đã hết hạn.",
      requestIdValue,
      403,
    );
  }
  if (error instanceof IdempotencyConflictError) {
    return errorResponse("IDEMPOTENCY_CONFLICT", error.message, requestIdValue, 409);
  }
  if (error instanceof UserAlreadyExistsError) {
    return errorResponse("VALIDATION_FAILED", error.message, requestIdValue, 400);
  }
  return errorResponse("INTERNAL_ERROR", "Không thể cập nhật người dùng.", requestIdValue, 500);
}
