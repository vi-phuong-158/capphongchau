import { describe, expect, it } from "vitest";

import {
  accessSecretMatches,
  createSessionToken,
  hashAccessSecret,
  verifySessionToken,
} from "@/modules/public-intake/session";
import { emptyDraft } from "@/modules/public-intake/types";
import {
  hasCompleteExistingRecordLookupIdentity,
  lookupExistingCertificates,
  maskCertificateNumber,
  unauthorizedSupplementChanges,
  type SupplementItem,
} from "@/modules/public-intake/workflow";

describe("public recovery session", () => {
  it("binds a v2 session to its sheet row and access version", () => {
    const now = new Date("2026-07-22T00:00:00.000Z");
    const token = createSessionToken(
      "s".repeat(32),
      {
        submissionId: "sub-1",
        rowIndex: 27,
        accessVersion: 3,
        issuedAt: Math.floor(now.getTime() / 1000),
      },
      now,
    );
    expect(verifySessionToken("s".repeat(32), token, now)).toMatchObject({
      submissionId: "sub-1",
      rowIndex: 27,
      accessVersion: 3,
      tokenVersion: "v2",
    });
    expect(verifySessionToken("x".repeat(32), token, now)).toBeNull();
  });

  it("compares access secrets without storing the clear value", () => {
    const hash = hashAccessSecret("p".repeat(32), "ABCD-EFGH-JKLM-NPQR");
    expect(accessSecretMatches("p".repeat(32), "abcdefghjklmnpqr", hash)).toBe(true);
    expect(accessSecretMatches("p".repeat(32), "ABCD-EFGH-JKLM-WXYZ", hash)).toBe(false);
  });
});

describe("existing record privacy and supplement locks", () => {
  it("chỉ mở tra cứu khi đã quét QR — không cho gõ tay CCCD rồi dò", () => {
    expect(
      hasCompleteExistingRecordLookupIdentity({
        identityNumber: "025092000344",
        fullName: "Vi Ngọc Phương",
        identityStatus: "QR_CONFIRMED",
      }),
    ).toBe(true);
    // Gõ tay (MANUAL_COMPLETE) không đủ — đây là lớp chống dò.
    expect(
      hasCompleteExistingRecordLookupIdentity({
        identityNumber: "025092000344",
        fullName: "Vi Ngọc Phương",
        identityStatus: "MANUAL_COMPLETE",
      }),
    ).toBe(false);
    // Thiếu CCCD hợp lệ cũng không mở.
    expect(
      hasCompleteExistingRecordLookupIdentity({
        identityNumber: "123",
        fullName: "Vi Ngọc Phương",
        identityStatus: "QR_CONFIRMED",
      }),
    ).toBe(false);
  });

  it("che số phát hành GCN chỉ để lộ 4 số cuối", () => {
    expect(maskCertificateNumber("AĐ 266864")).toMatch(/6864$/);
    expect(maskCertificateNumber("AĐ 266864")).not.toContain("266864");
  });

  it("tra cứu GCN đã có trên cache tĩnh — thuần, không cần Sheets", () => {
    const fixture: ExistingCertificatesIndex = {
      index: {
        "hash-1": ["record-1", "record-1"], // trùng lặp không được nhân đôi kết quả
        "hash-2": ["record-missing"], // record không tồn tại trong `records` phải bị bỏ qua
      },
      records: {
        "record-1": { issueNumber: "AB 123", issueDate: "2020-01-01", registryNumber: "S-01" },
      },
    };

    expect(lookupExistingCertificates(fixture, "hash-1")).toEqual([
      { existingRecordId: "record-1", issueNumber: "AB 123", issueDate: "2020-01-01", registryNumber: "S-01" },
    ]);
    expect(lookupExistingCertificates(fixture, "hash-2")).toEqual([]);
    expect(lookupExistingCertificates(fixture, "hash-not-in-index")).toEqual([]);
  });

  it("only permits fields explicitly requested by the officer", () => {
    const previous = emptyDraft("owner-1", "parcel-1", "land-1");
    previous.certificate.issueNumber = "A 123";
    previous.phone = "0966983232";
    const next = structuredClone(previous);
    next.certificate.issueNumber = "A 124";
    next.phone = "0912345678";
    const item: SupplementItem = {
      itemId: "item-1",
      requestId: "request-1",
      itemType: "FIELD",
      targetEntityType: "CERTIFICATE",
      targetEntityId: "",
      fieldPath: "certificate.issueNumber",
      documentType: "",
      reasonCode: "INCONSISTENT_INFORMATION",
      instruction: "Sửa số phát hành.",
      status: "OPEN",
    };
    expect(unauthorizedSupplementChanges(previous, next, [item])).toEqual(["submission.phone"]);
  });
});
