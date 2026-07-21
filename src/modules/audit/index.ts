/** Audit log là append-only; chi tiết lưu trữ sẽ được hiện thực qua DataRepository. */
export interface AuditEventReference {
  readonly action: string;
  readonly actorEmail: string;
  readonly requestId: string;
  readonly occurredAt: string;
}
