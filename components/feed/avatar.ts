const X_PLATFORMS = new Set(["x", "twitter", "x.com", "twitter.com"]);
const INSTAGRAM_PLATFORMS = new Set(["instagram", "ig", "instagram.com"]);

function providerFor(platform: unknown): "x" | "instagram" | null {
  if (typeof platform !== "string") return null;
  const value = platform.trim().toLowerCase().replace(/^https?:\/\/(?:www\.)?/, "").replace(/\/$/, "");
  if (X_PLATFORMS.has(value)) return "x";
  if (INSTAGRAM_PLATFORMS.has(value)) return "instagram";
  return null;
}

export function avatarUrlFor(platform: unknown, handle: unknown): string | null {
  const provider = providerFor(platform);
  if (!provider || typeof handle !== "string") return null;
  const username = handle.trim().replace(/^@/, "").split(/[/?#]/)[0]?.trim();
  if (!username) return null;
  return `https://unavatar.io/${provider}/${encodeURIComponent(username)}`;
}
