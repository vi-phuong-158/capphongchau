import { describe, expect, it } from "vitest";

import { emptyOwner, type IntakeDraft } from "@/modules/public-intake/types";
import { normalizeWorkingIdentityTransitions } from "@/modules/submissions/working-identity-transitions";

function makeDraft(
  identityStatus: "QR_CONFIRMED" | "MANUAL_COMPLETE" | "PENDING_CONFIRMATION",
): IntakeDraft {
  return {
    certificate: { issueNumber: "AD 123456", issueDate: "2020-01-01", registryNumber: "CH001" },
    owners: [
      {
        ...emptyOwner("owner_1"),
        fullName: "Nguyen Van A",
        identityNumber: "025080001234",
        dateOfBirth: "1980-01-01",
        gender: "NAM",
        residenceAddress: "Phuong Phong Chau",
        identitySource: identityStatus === "QR_CONFIRMED" ? "QR" : "MANUAL",
        identityStatus,
        identityConfirmedAt:
          identityStatus === "PENDING_CONFIRMATION" ? "" : "2026-07-29T08:00:00.000Z",
      },
    ],
    parcels: [],
    assets: [],
    phone: "0912345678",
    consentAccepted: true,
  };
}

describe("normalizeWorkingIdentityTransitions", () => {
  it("rejects a QR-confirmed identity edit without an override reason", () => {
    const baseline = makeDraft("QR_CONFIRMED");
    const candidate = structuredClone(baseline);
    candidate.owners[0].identityNumber = "025080009999";

    expect(normalizeWorkingIdentityTransitions(baseline, candidate)).toMatchObject({ ok: false });
  });

  it("moves an explained QR-confirmed identity edit to override review", () => {
    const baseline = makeDraft("QR_CONFIRMED");
    const candidate = structuredClone(baseline);
    candidate.owners[0].identityNumber = "025080009999";
    candidate.owners[0].identityOverrideReason = "Đối chiếu CCCD bản gốc tại quầy";

    expect(normalizeWorkingIdentityTransitions(baseline, candidate)).toMatchObject({
      ok: true,
      draft: {
        owners: [
          {
            identityStatus: "QR_OVERRIDE_PENDING_REVIEW",
            identitySource: "MANUAL",
          },
        ],
      },
    });
  });

  it("requires manual confirmation again after a confirmed manual identity is edited", () => {
    const baseline = makeDraft("MANUAL_COMPLETE");
    const candidate = structuredClone(baseline);
    candidate.owners[0].fullName = "Nguyen Van B";

    expect(normalizeWorkingIdentityTransitions(baseline, candidate)).toMatchObject({
      ok: true,
      draft: {
        owners: [
          {
            identityStatus: "PENDING_CONFIRMATION",
            identityConfirmedAt: "",
            identitySource: "MANUAL",
          },
        ],
      },
    });
  });

  it("does not permit working-payload to forge manual confirmation", () => {
    const baseline = makeDraft("PENDING_CONFIRMATION");
    const candidate = structuredClone(baseline);
    candidate.owners[0].identityStatus = "MANUAL_COMPLETE";
    candidate.owners[0].identityConfirmedAt = "2026-07-29T08:00:00.000Z";

    expect(normalizeWorkingIdentityTransitions(baseline, candidate)).toMatchObject({ ok: false });
  });
});
