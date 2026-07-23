import { createHash, randomUUID } from "node:crypto";

import { UserRole } from "@/modules/common/domain";
import { getDatabase } from "@/modules/supabase/database";

export interface ActiveUser {
  readonly email: string;
  readonly displayName: string;
  readonly roles: readonly UserRole[];
}

export interface ManagedUser extends ActiveUser {
  readonly active: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UserMutation {
  readonly mode: "CREATE" | "UPDATE";
  readonly email: string;
  readonly roles: readonly UserRole[];
  readonly active: boolean;
  readonly displayName: string;
  readonly actorEmail: string;
  readonly requestId: string;
  readonly idempotencyKey: string;
}

interface UserRow {
  readonly email: string;
  readonly roles: string[];
  readonly active: boolean;
  readonly display_name: string;
  readonly created_at: Date;
  readonly updated_at: Date;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function entityHash(email: string): string {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

function mutationHash(mutation: UserMutation): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        mode: mutation.mode,
        email: normalizeEmail(mutation.email),
        roles: [...mutation.roles],
        active: mutation.active,
        displayName: mutation.displayName.trim(),
      }),
    )
    .digest("hex");
}

function parseRoles(values: readonly string[]): UserRole[] {
  const valid = new Set(Object.values(UserRole));
  return values.filter((role): role is UserRole => valid.has(role as UserRole));
}

function mapUser(row: UserRow): ManagedUser {
  return {
    email: row.email,
    roles: parseRoles(row.roles),
    active: row.active,
    displayName: row.display_name,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function actionForMutation(previous: ManagedUser | undefined, mutation: UserMutation): string {
  if (!previous) return "USER_CREATED";
  if (previous.active && !mutation.active) return "USER_LOCKED";
  if (!previous.active && mutation.active) return "USER_UNLOCKED";
  if (previous.roles.join(",") !== mutation.roles.join(",")) return "USER_ROLES_CHANGED";
  return "USER_UPDATED";
}

export class SupabaseUserRepository {
  async list(): Promise<ManagedUser[]> {
    const database = getDatabase();
    const rows = await database<UserRow[]>`
      select email::text, roles, active, display_name, created_at, updated_at
      from public.users
      order by email
    `;
    return rows.map(mapUser);
  }

  async findActiveByEmail(email: string): Promise<ActiveUser | null> {
    const database = getDatabase();
    const rows = await database<UserRow[]>`
      select email::text, roles, active, display_name, created_at, updated_at
      from public.users
      where email = ${normalizeEmail(email)} and active = true
      limit 1
    `;
    const user = rows[0] ? mapUser(rows[0]) : null;
    return user ? { email: user.email, displayName: user.displayName, roles: user.roles } : null;
  }

  async mutate(mutation: UserMutation): Promise<ManagedUser> {
    const database = getDatabase();
    const normalizedEmail = normalizeEmail(mutation.email);
    const fingerprint = mutationHash(mutation);
    const emailLockKey = `USER:${normalizedEmail}`;

    return database.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(${mutation.idempotencyKey}, 0))`;
      await transaction`select pg_advisory_xact_lock(hashtextextended(${emailLockKey}, 0))`;
      const cached = await transaction<{ mutation_hash: string }[]>`
        select mutation_hash from public.request_log
        where idempotency_key = ${mutation.idempotencyKey}
      `;
      if (cached[0]) {
        if (cached[0].mutation_hash !== fingerprint) throw new IdempotencyConflictError();
        const replay = await transaction<UserRow[]>`
          select email::text, roles, active, display_name, created_at, updated_at
          from public.users where email = ${normalizedEmail}
        `;
        if (!replay[0]) throw new IdempotencyConflictError();
        return mapUser(replay[0]);
      }

      const previousRows = await transaction<UserRow[]>`
        select email::text, roles, active, display_name, created_at, updated_at
        from public.users where email = ${normalizedEmail} for update
      `;
      const previous = previousRows[0] ? mapUser(previousRows[0]) : undefined;
      if (mutation.mode === "CREATE" && previous) throw new UserAlreadyExistsError();

      const rows = await transaction<UserRow[]>`
        insert into public.users (email, roles, active, display_name)
        values (
          ${normalizedEmail},
          ${transaction.array([...mutation.roles])},
          ${mutation.active},
          ${mutation.displayName.trim()}
        )
        on conflict (email) do update set
          roles = excluded.roles,
          active = excluded.active,
          display_name = excluded.display_name,
          updated_at = now()
        returning email::text, roles, active, display_name, created_at, updated_at
      `;
      const next = mapUser(rows[0]);
      const action = actionForMutation(previous, mutation);
      await transaction`
        insert into public.audit_logs (
          audit_id, actor_email, action, entity_type, entity_id, request_id, metadata
        ) values (
          ${randomUUID()}, ${mutation.actorEmail}, ${action}, 'USER', ${entityHash(normalizedEmail)},
          ${mutation.requestId},
          ${transaction.json({
            targetHash: entityHash(normalizedEmail),
            activeChanged: previous ? previous.active !== next.active : true,
            rolesChanged: previous ? previous.roles.join(",") !== next.roles.join(",") : true,
          })}
        )
      `;
      await transaction`
        insert into public.request_log (
          idempotency_key, request_id, kind, mutation_hash, response_json, expires_at
        ) values (
          ${mutation.idempotencyKey}, ${mutation.requestId}, 'USER_MUTATION', ${fingerprint},
          ${transaction.json({ email: normalizedEmail })}, now() + interval '24 hours'
        )
      `;
      return next;
    });
  }

  async appendDeniedSignInAudit(email: string): Promise<void> {
    const database = getDatabase();
    await database`
      insert into public.audit_logs (
        audit_id, actor_email, action, entity_type, entity_id, request_id, metadata
      ) values (
        ${randomUUID()}, 'SYSTEM', 'AUTH_SIGN_IN_DENIED', 'AUTH', ${entityHash(email)},
        ${randomUUID()}, ${database.json({ reason: "NOT_ALLOWLISTED_OR_INACTIVE" })}
      )
    `;
  }
}

export class IdempotencyConflictError extends Error {
  constructor() {
    super("Idempotency key đã được dùng cho một thao tác khác.");
    this.name = "IdempotencyConflictError";
  }
}

export class UserAlreadyExistsError extends Error {
  constructor() {
    super("Email này đã có trong danh sách người dùng.");
    this.name = "UserAlreadyExistsError";
  }
}

export function getUserRepository(): SupabaseUserRepository {
  return new SupabaseUserRepository();
}
