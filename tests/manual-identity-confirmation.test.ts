import { describe, expect, it } from "vitest";

import { emptyOwner } from "@/modules/public-intake/types";
import { manualIdentityConfirmationIssue } from "@/modules/submissions/manual-identity-confirmation";

function eligibleOwner() {
  return {
    ...emptyOwner("owner_1"),
    fullName: "Nguyen Van A",
    identityNumber: "025080001234",
    dateOfBirth: "1980-01-01",
    gender: "NAM" as const,
    residenceAddress: "Phuong Phong Chau",
    identityStatus: "PENDING_CONFIRMATION" as const,
  };
}

describe("manualIdentityConfirmationIssue", () => {
  it("allows a pending citizen identity only when all required identity fields are present", () => {
    expect(manualIdentityConfirmationIssue(eligibleOwner())).toBeNull();
  });

  it("does not allow an already-confirmed identity to be confirmed again", () => {
    expect(
      manualIdentityConfirmationIssue({ ...eligibleOwner(), identityStatus: "MANUAL_COMPLETE" }),
    ).toMatchObject({ code: "IDENTITY_ALREADY_CONFIRMED" });
  });

  it("requires a valid CCCD, date of birth, gender and residence address", () => {
    expect(
      manualIdentityConfirmationIssue({ ...eligibleOwner(), identityNumber: "0123" }),
    ).toMatchObject({ code: "IDENTITY_NUMBER_INVALID" });
    expect(
      manualIdentityConfirmationIssue({ ...eligibleOwner(), dateOfBirth: "1980-02-30" }),
    ).toMatchObject({ code: "DATE_OF_BIRTH_INVALID" });
    expect(manualIdentityConfirmationIssue({ ...eligibleOwner(), gender: "" })).toMatchObject({
      code: "GENDER_MISSING",
    });
    expect(
      manualIdentityConfirmationIssue({ ...eligibleOwner(), residenceAddress: "" }),
    ).toMatchObject({
      code: "RESIDENCE_ADDRESS_MISSING",
    });
  });

  it("excludes organisation and distinct-current-user rows from this confirmation", () => {
    expect(
      manualIdentityConfirmationIssue({ ...eligibleOwner(), ownerType: "TO_CHUC" }),
    ).toMatchObject({ code: "OWNER_NOT_ELIGIBLE" });
    expect(
      manualIdentityConfirmationIssue({ ...eligibleOwner(), hasDistinctCurrentUser: true }),
    ).toMatchObject({ code: "OWNER_NOT_ELIGIBLE" });
  });
});
