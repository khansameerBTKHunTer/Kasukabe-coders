import { ApiError } from "@/lib/auth/server";
import type { AddressMatch } from "@/types/geocoding";

const globals = globalThis as typeof globalThis & {
  civiscopeAddressLookups?: {
    cache: Map<string, { value: unknown; expires: number }>;
    queue: Promise<void>;
    next: number;
    waiting: number;
  };
};
// Both lookup directions share this queue: public Nominatim allows at most
// one request per second for the entire app (single-server demo deployment).
async function lookup<T>(
  path: string,
  params: Record<string, string>,
  parse: (data: unknown) => T,
): Promise<T> {
  const state = (globals.civiscopeAddressLookups ??= {
    cache: new Map(),
    queue: Promise.resolve(),
    next: 0,
    waiting: 0,
  });
  const base = process.env.GEOCODING_BASE_URL || "https://nominatim.openstreetmap.org";
  const url = new URL(path, base.replace(/\/?$/, "/"));
  url.search = new URLSearchParams({ format: "jsonv2", ...params }).toString();
  const key = url.href;
  const cached = state.cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value as T;
  if (state.waiting >= 4)
    throw new ApiError(
      429,
      "Address lookup is busy. Retry shortly; your selected pin is kept.",
    );
  state.waiting++;
  const previous = state.queue;
  let release!: () => void;
  state.queue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    const repeated = state.cache.get(key);
    if (repeated && repeated.expires > Date.now()) return repeated.value as T;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, state.next - Date.now())),
    );
    state.next = Date.now() + 1100;
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          process.env.GEOCODING_USER_AGENT ||
          "CIVISCOPE-DamageMapper/1.0 (small civic-response demonstration)",
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(7000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Geocoding service unavailable");
    const value = parse(await response.json());
    if (state.cache.size >= 256)
      state.cache.delete(state.cache.keys().next().value!);
    state.cache.set(key, { value, expires: Date.now() + 24 * 3600_000 });
    return value;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, "The address service is unavailable. Retry or drop a pin on the map; your selected location is kept.");
  } finally {
    state.waiting--;
    release();
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  return lookup("reverse", {
    lat: lat.toFixed(5), lon: lng.toFixed(5), zoom: "18", addressdetails: "1",
  }, (data) => {
    const address = data && typeof data === "object" && "display_name" in data
      ? data.display_name : undefined;
    if (typeof address !== "string" || !address.trim())
      throw new ApiError(404, "No mapped address was found here. Your dropped pin is still saved.");
    return address.trim().slice(0, 600);
  });
}

export async function searchAddress(query: string): Promise<AddressMatch[]> {
  const normalized = query.trim().replace(/\s+/g, " ").toLowerCase();
  if (normalized.length < 3 || normalized.length > 200)
    throw new ApiError(400, "Enter an address between 3 and 200 characters, including the area or city.");
  return lookup("search", { q: normalized, limit: "5" }, (data) => {
    if (!Array.isArray(data)) throw new Error("Invalid geocoding response");
    const matches: AddressMatch[] = [];
    for (const item of data.slice(0, 5)) {
      if (!item || typeof item.display_name !== "string" || !item.display_name.trim()) continue;
      const coordinate = (value: unknown) =>
        typeof value === "number" || (typeof value === "string" && value.trim())
          ? Number(value) : NaN;
      const lat = coordinate(item.lat), lng = coordinate(item.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
          Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
      const match = { address: item.display_name.trim().slice(0, 600), lat, lng };
      if (!matches.some((other) => other.lat === lat && other.lng === lng && other.address === match.address))
        matches.push(match);
    }
    return matches;
  });
}
