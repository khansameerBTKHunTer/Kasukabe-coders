import { ApiError } from "@/lib/auth/server";
const globals = globalThis as typeof globalThis & {
  civiscopeGeocoder?: {
    cache: Map<string, { address: string; expires: number }>;
    queue: Promise<void>;
    next: number;
    waiting: number;
  };
};
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string> {
  const state = (globals.civiscopeGeocoder ??= {
    cache: new Map(),
    queue: Promise.resolve(),
    next: 0,
    waiting: 0,
  });
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = state.cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.address;
  if (state.waiting >= 4)
    throw new ApiError(
      429,
      "Address lookup is busy. Your selected pin is saved; retry shortly.",
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
    if (repeated && repeated.expires > Date.now()) return repeated.address;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, state.next - Date.now())),
    );
    state.next = Date.now() + 1100;
    const base =
      process.env.GEOCODING_BASE_URL || "https://nominatim.openstreetmap.org";
    const url = new URL("reverse", base.replace(/\/?$/, "/"));
    url.search = new URLSearchParams({
      format: "jsonv2",
      lat: String(lat),
      lon: String(lng),
      zoom: "18",
      addressdetails: "1",
    }).toString();
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
    if (!response.ok)
      throw new ApiError(
        503,
        "The address service is unavailable. Your map pin is still saved.",
      );
    const data = await response.json();
    if (typeof data.display_name !== "string" || !data.display_name.trim())
      throw new ApiError(
        404,
        "No mapped address was found here. Your dropped pin is still saved.",
      );
    const address = data.display_name.trim().slice(0, 600);
    if (state.cache.size >= 256)
      state.cache.delete(state.cache.keys().next().value!);
    state.cache.set(key, { address, expires: Date.now() + 24 * 3600_000 });
    return address;
  } finally {
    state.waiting--;
    release();
  }
}
