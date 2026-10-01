import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { readConsent, useConsent, writeConsent } from "./consent";

describe("analytics consent", () => {
  beforeEach(() => localStorage.clear());

  it("has no answer until the visitor chooses", () => {
    expect(readConsent()).toBeNull();
  });

  it("keeps honouring the old banner's 'accepted' value under the same key", () => {
    localStorage.setItem("gulyaly_cookie_consent", "accepted");
    expect(readConsent()).toBe("accepted");
  });

  it("ignores anything that isn't a known answer", () => {
    localStorage.setItem("gulyaly_cookie_consent", "maybe");
    expect(readConsent()).toBeNull();
  });

  it("notifies mounted listeners the moment the visitor chooses, without a reload", () => {
    const { result } = renderHook(() => useConsent());
    expect(result.current).toEqual({ consent: null, ready: true });

    act(() => writeConsent("accepted"));

    expect(result.current.consent).toBe("accepted");
    expect(localStorage.getItem("gulyaly_cookie_consent")).toBe("accepted");
  });

  it("records a decline as a real answer, so the banner does not come back", () => {
    act(() => writeConsent("declined"));
    expect(readConsent()).toBe("declined");
  });
});
