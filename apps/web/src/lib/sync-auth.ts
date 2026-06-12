import { getIngestApiKey } from "./env";

/** Watcher sends x-ingest-key; the local UI syncs via same-origin fetch without it. */
export function isSyncAuthorized(request: Request): boolean {
  const expectedKey = getIngestApiKey();
  const apiKey = request.headers.get("x-ingest-key");

  if (expectedKey && apiKey === expectedKey) return true;

  const site = request.headers.get("sec-fetch-site");
  if (site === "same-origin" || site === "none") return true;

  return !expectedKey;
}
