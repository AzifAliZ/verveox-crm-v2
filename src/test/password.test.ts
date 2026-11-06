import { describe, expect, it, vi } from "vitest";
import { rotatePassword } from "@/lib/password";
describe("password rotation", () => {
  it("requires bounded password length", async () => {
    const auth = { updateUser: vi.fn(), signOut: vi.fn() };
    await expect(rotatePassword(auth, "short")).rejects.toThrow();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it("globally revokes refresh sessions only after successful update", async () => {
    const auth = {
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    };
    await rotatePassword(auth, "fixture-password-only", "current-fixture");
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(auth.updateUser).toHaveBeenCalledWith({
      password: "fixture-password-only",
      current_password: "current-fixture",
    });
  });
  it("reports failed update and partial revocation truthfully", async () => {
    const auth = {
      updateUser: vi.fn().mockResolvedValue({ error: { message: "denied" } }),
      signOut: vi.fn(),
    };
    await expect(rotatePassword(auth, "fixture-password-only")).rejects.toThrow("denied");
    expect(auth.signOut).not.toHaveBeenCalled();
    auth.updateUser.mockResolvedValue({ error: null });
    auth.signOut.mockResolvedValue({ error: { message: "failed" } });
    await expect(rotatePassword(auth, "fixture-password-only")).rejects.toThrow(
      "revocation failed",
    );
  });
});
