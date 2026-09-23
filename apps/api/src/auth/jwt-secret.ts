// Fails fast at process startup instead of silently signing/verifying tokens with a guessable
// fallback ("dev-secret") if the real secret was never configured -- that fallback let anyone
// forge valid access tokens (including admin ones) against a misconfigured deployment.
function requireAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_ACCESS_SECRET is not set. Refusing to start with an insecure default -- set it in .env.",
    );
  }
  return secret;
}

export const ACCESS_TOKEN_SECRET = requireAccessSecret();
