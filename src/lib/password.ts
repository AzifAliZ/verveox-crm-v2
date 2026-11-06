type PasswordClient = {
  updateUser: (attributes: {
    password: string;
    current_password?: string;
  }) => Promise<{ error: { message: string } | null }>;
  signOut: (options: { scope: "global" }) => Promise<{ error: { message: string } | null }>;
};
export async function rotatePassword(
  auth: PasswordClient,
  password: string,
  currentPassword?: string,
) {
  if (password.length < 12 || password.length > 128) throw new Error("Use 12–128 characters");
  const updated = await auth.updateUser({
    password,
    ...(currentPassword ? { current_password: currentPassword } : {}),
  });
  if (updated.error) throw new Error(updated.error.message);
  const revoked = await auth.signOut({ scope: "global" });
  if (revoked.error)
    throw new Error(
      "Password changed, but session revocation failed. Sign out all sessions again.",
    );
}
