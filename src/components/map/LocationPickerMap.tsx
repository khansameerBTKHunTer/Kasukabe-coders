"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Crosshair,
  LocateFixed,
  MapPin,
  Navigation,
  Search,
  Square,
} from "lucide-react";
import type * as Leaflet from "leaflet";
import type { AddressMatch } from "@/types/geocoding";
interface Coords {
  lat: number;
  lng: number;
}
interface Props {
  initialLat?: number;
  initialLng?: number;
  onLocationChange: (lat: number, lng: number) => void;
  onReporterLocationFound?: (lat: number, lng: number) => void;
  onAddressChange?: (address: string) => void;
}
export function LocationPickerMap({
  initialLat,
  initialLng,
  onLocationChange,
  onReporterLocationFound,
  onAddressChange,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null),
    marker = useRef<Leaflet.Marker | null>(null);
  const deviceMarker = useRef<Leaflet.CircleMarker | null>(null),
    accuracyCircle = useRef<Leaflet.Circle | null>(null);
  const leaflet = useRef<typeof Leaflet | null>(null);
  const watch = useRef<number | null>(null),
    active = useRef(true),
    followFirstFix = useRef(false);
  const callbacks = useRef({
    onLocationChange,
    onReporterLocationFound,
    onAddressChange,
  });
  callbacks.current = {
    onLocationChange,
    onReporterLocationFound,
    onAddressChange,
  };
  const selected = useRef<Coords | null>(null);
  selected.current =
    initialLat !== undefined && initialLng !== undefined
      ? { lat: initialLat, lng: initialLng }
      : null;
  const device = useRef<(Coords & { accuracy: number }) | null>(null);
  const [gpsStatus, setGpsStatus] = useState(""),
    [tracking, setTracking] = useState(false),
    [locating, setLocating] = useState(false);
  const [address, setAddress] = useState(""),
    [addressLoading, setAddressLoading] = useState(false),
    [addressError, setAddressError] = useState("");
  const [addressQuery, setAddressQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<AddressMatch[]>([]);
  const [searchMessage, setSearchMessage] = useState("");
  const [addressAttribution, setAddressAttribution] = useState("");
  const searchRequest = useRef<AbortController | null>(null);
  const reverseRequest = useRef<AbortController | null>(null);
  const matchedAddress = useRef<AddressMatch | null>(null);
  const cancelSearch = useCallback(() => {
    searchRequest.current?.abort();
    searchRequest.current = null;
    setSearching(false);
  }, []);
  const [mapError, setMapError] = useState(""),
    [mapReady, setMapReady] = useState(false),
    [deviceTime, setDeviceTime] = useState("");
  const chooseRef = useRef<(lat: number, lng: number) => void>(() => {});
  const movePin = useCallback((lat: number, lng: number, pan = false) => {
    const L = leaflet.current,
      instance = map.current;
    if (!L || !instance) return;
    if (marker.current) marker.current.setLatLng([lat, lng]);
    else
      marker.current = L.marker([lat, lng], {
        draggable: true,
        title: "Incident pin—drag to the hazard",
        keyboard: true,
        icon: L.divIcon({
          className: "incident-location-marker",
          html: '<span class="incident-pin"><span></span></span>',
          iconSize: [32, 40],
          iconAnchor: [16, 40],
        }),
      })
        .addTo(instance)
        .on("dragend", () => {
          const p = marker.current!.getLatLng();
          chooseRef.current(p.lat, p.lng);
        });
    if (pan)
      instance.setView([lat, lng], Math.max(instance.getZoom(), 16), {
        animate: false,
      });
  }, []);
  const choose = useCallback(
    (lat: number, lng: number, knownAddress?: string) => {
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      )
        return;
      followFirstFix.current = false;
      cancelSearch();
      const a = Math.round(lat * 1e6) / 1e6,
        b = Math.round(lng * 1e6) / 1e6;
      matchedAddress.current = knownAddress ? { lat: a, lng: b, address: knownAddress } : null;
      if (knownAddress) {
        // Keep the search result's address and avoid a redundant reverse lookup.
        reverseRequest.current?.abort();
        setAddress(knownAddress);
        setAddressLoading(false);
        setAddressError("");
        callbacks.current.onAddressChange?.(knownAddress);
      } else {
        setSearchResults([]);
        setSearchMessage("");
        setAddressAttribution("");
      }
      selected.current = { lat: a, lng: b };
      callbacks.current.onLocationChange(a, b);
      movePin(a, b);
    },
    [movePin, cancelSearch],
  );
  chooseRef.current = choose;
  const selectAddress = (match: AddressMatch) => {
    choose(match.lat, match.lng, match.address);
    movePin(match.lat, match.lng, true);
  };
  const findAddress = async () => {
    cancelSearch();
    setSearchResults([]);
    const query = addressQuery.trim();
    if (query.length < 3) {
      setSearchMessage("Enter an address with at least 3 characters, including the area or city.");
      return;
    }
    // A late GPS fix must not override a location chosen through address search.
    followFirstFix.current = false;
    const controller = new AbortController();
    searchRequest.current = controller;
    setSearching(true);
    setSearchMessage("");
    setAddressAttribution("");
    try {
      const response = await fetch("/api/geocode/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.results))
        throw new Error(data.error || "Address search is unavailable. Retry or drop a pin on the map.");
      if (controller.signal.aborted) return;
      setAddressAttribution(typeof data.attribution === "string" ? data.attribution : "");
      const results: AddressMatch[] = data.results;
      setSearchResults(results);
      if (results.length) {
        selectAddress(results[0]);
        setSearchMessage(results.length > 1
          ? "Best match pinned. Choose another match below if needed."
          : "Address pinned. Drag the pin to fine-tune the incident location.");
      } else {
        setSearchMessage("No address found. Add the city or a nearby landmark, or drop a pin on the map.");
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setSearchMessage(error instanceof Error ? error.message : "Address search is unavailable. Retry or drop a pin on the map.");
    } finally {
      if (!controller.signal.aborted) {
        searchRequest.current = null;
        setSearching(false);
      }
    }
  };
  const renderDevice = useCallback(() => {
    const position = device.current,
      L = leaflet.current,
      instance = map.current;
    if (!position || !L || !instance) return;
    const point: [number, number] = [position.lat, position.lng];
    if (deviceMarker.current) deviceMarker.current.setLatLng(point);
    else
      deviceMarker.current = L.circleMarker(point, {
        radius: 7,
        fillColor: "#4c6680",
        fillOpacity: 1,
        color: "#fff",
        weight: 3,
      })
        .addTo(instance)
        .bindTooltip("Your device location");
    if (accuracyCircle.current)
      accuracyCircle.current
        .setLatLng(point)
        .setRadius(Math.min(position.accuracy, 5000));
    else
      accuracyCircle.current = L.circle(point, {
        radius: Math.min(position.accuracy, 5000),
        color: "#4c6680",
        fillColor: "#798da6",
        fillOpacity: 0.12,
        weight: 1,
      }).addTo(instance);
  }, []);
  const stopTracking = useCallback(() => {
    if (watch.current !== null)
      navigator.geolocation?.clearWatch(watch.current);
    watch.current = null;
    setTracking(false);
    setLocating(false);
  }, []);
  const startTracking = useCallback(() => {
    cancelSearch();
    if (!window.isSecureContext) {
      setGpsStatus(
        "Location requires HTTPS or localhost. You can still drop the incident pin on the map.",
      );
      return;
    }
    if (!navigator.geolocation) {
      setGpsStatus(
        "This browser cannot access device location. Drop the incident pin on the map instead.",
      );
      return;
    }
    if (watch.current !== null) {
      if (device.current) {
        choose(device.current.lat, device.current.lng);
        movePin(device.current.lat, device.current.lng, true);
      }
      return;
    }
    setLocating(true);
    setGpsStatus("Waiting for device location permission…");
    followFirstFix.current = true;
    const success = (position: GeolocationPosition) => {
      if (!active.current) return;
      const { latitude: lat, longitude: lng, accuracy } = position.coords;
      device.current = { lat, lng, accuracy };
      callbacks.current.onReporterLocationFound?.(lat, lng);
      setDeviceTime(
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
      setLocating(false);
      setGpsStatus(
        `Device location updated · accuracy about ${Math.round(accuracy)} m`,
      );
      renderDevice();
      // Only the first requested fix positions the incident. Later live fixes never move a manually selected hazard pin.
      if (followFirstFix.current) {
        choose(lat, lng);
        movePin(lat, lng, true);
      }
    };
    const failure = (error: GeolocationPositionError) => {
      if (!active.current) return;
      followFirstFix.current = false;
      stopTracking();
      setGpsStatus(
        error.code === 1
          ? "Location permission denied. Enable it in browser settings or drop the incident pin manually."
          : error.code === 3
            ? "Location request timed out. Retry near a window or outdoors, or select the incident on the map."
            : "Your device could not determine its location. Enable device location and retry, or drop the pin on the map.",
      );
    };
    const options = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000,
    };
    if (typeof navigator.geolocation.watchPosition === "function") {
      watch.current = navigator.geolocation.watchPosition(
        success,
        failure,
        options,
      );
      setTracking(true);
    } else navigator.geolocation.getCurrentPosition(success, failure, options);
  }, [choose, movePin, renderDevice, stopTracking, cancelSearch]);
  useEffect(() => {
    active.current = true;
    let cancelled = false;
    let resize: ResizeObserver | undefined;
    void import("leaflet")
      .then((module) => {
        if (cancelled || !container.current) return;
        const L = module.default || module;
        leaflet.current = L;
        const point = selected.current || device.current;
        const instance = L.map(container.current, {
          center: point ? [point.lat, point.lng] : [22.9447, 90.8282],
          zoom: point ? 16 : 13,
          zoomControl: false,
          zoomAnimation: false,
          markerZoomAnimation: false,
        });
        map.current = instance;
        L.control.zoom({ position: "bottomright" }).addTo(instance);
        const tiles = L.tileLayer(
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
          },
        ).addTo(instance);
        tiles.on("tileerror", () => {
          if (!cancelled)
            setMapError(
              "Map tiles could not load. Check your connection and retry; the selected location is kept.",
            );
        });
        tiles.on("load", () => {
          if (!cancelled) setMapError("");
        });
        instance.on("click", (event: Leaflet.LeafletMouseEvent) =>
          choose(event.latlng.lat, event.latlng.lng),
        );
        if (selected.current)
          movePin(selected.current.lat, selected.current.lng);
        renderDevice();
        resize = new ResizeObserver(() =>
          instance.invalidateSize({ pan: false }),
        );
        resize.observe(container.current);
        requestAnimationFrame(() => {
          if (!cancelled) instance.invalidateSize({ pan: false });
        });
        setMapReady(true);
      })
      .catch(() => {
        if (!cancelled)
          setMapError(
            "The map could not initialize. Reload the page or use device location.",
          );
      });
    return () => {
      cancelled = true;
      active.current = false;
      searchRequest.current?.abort();
      resize?.disconnect();
      if (watch.current !== null)
        navigator.geolocation?.clearWatch(watch.current);
      watch.current = null;
      map.current?.stop();
      map.current?.remove();
      map.current = null;
      marker.current = null;
      deviceMarker.current = null;
      accuracyCircle.current = null;
    };
  }, [choose, movePin, renderDevice]);
  useEffect(() => {
    if (initialLat !== undefined && initialLng !== undefined)
      movePin(initialLat, initialLng);
    else {
      marker.current?.remove();
      marker.current = null;
    }
  }, [initialLat, initialLng, movePin]);
  useEffect(() => {
    let cancelled = false;
    void navigator.permissions
      ?.query({ name: "geolocation" })
      .then((permission) => {
        if (!cancelled && permission.state === "granted") startTracking();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [startTracking]);
  useEffect(() => {
    if (initialLat === undefined || initialLng === undefined) {
      matchedAddress.current = null;
      setAddress("");
      setAddressLoading(false);
      setAddressError("");
      setAddressAttribution("");
      callbacks.current.onAddressChange?.("");
      return;
    }
    const match = matchedAddress.current;
    if (match && match.lat === initialLat && match.lng === initialLng) {
      setAddress(match.address);
      setAddressLoading(false);
      setAddressError("");
      return;
    }
    const controller = new AbortController();
    reverseRequest.current = controller;
    setAddressLoading(true);
    setAddress("");
    setAddressError("");
    callbacks.current.onAddressChange?.("");
    const timer = setTimeout(() => {
      void fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: initialLat, lng: initialLng }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok || !data.address)
            throw new Error(
              data.error ||
                "Address unavailable. Your selected pin is still saved.",
            );
          if (!controller.signal.aborted) {
            setAddress(data.address);
            setAddressAttribution(typeof data.attribution === "string" ? data.attribution : "");
            callbacks.current.onAddressChange?.(data.address);
          }
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setAddressError(
              error.message ||
                "Address unavailable. Your selected pin is still saved.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setAddressLoading(false);
        });
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [initialLat, initialLng]);
  return (
    <section className="location-card" aria-label="Incident location">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">02 / Location</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">
            Pin the incident
          </h2>
        </div>
        <MapPin className="text-blue-600" size={21} />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">
        Search an address or use your device location, then drag the red pin to the exact hazard.
      </p>
      <div className="mt-4">
        <label htmlFor="incident-address-query" className="text-xs font-semibold text-slate-600">
          Search incident address
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="incident-address-query"
            type="search"
            autoComplete="off"
            maxLength={200}
            value={addressQuery}
            placeholder="Area, street or landmark, city"
            aria-describedby="incident-address-search-status"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
            onChange={(event) => {
              cancelSearch();
              setAddressQuery(event.target.value);
              setSearchResults([]);
              setSearchMessage("");
              setAddressAttribution("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (!event.nativeEvent.isComposing && !searching) void findAddress();
              }
            }}
          />
          <button
            type="button"
            disabled={searching}
            onClick={() => void findAddress()}
            className="primary-button flex shrink-0 items-center gap-1.5"
          >
            <Search size={14} aria-hidden="true" />
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
        <p id="incident-address-search-status" role="status" className="mt-2 text-xs leading-relaxed text-slate-500">
          {searching ? "Finding matching addresses…" : searchMessage}
        </p>
        {addressAttribution && (
          <p className="mt-1 text-[10px] text-slate-500">{addressAttribution}</p>
        )}
        {searchResults.length > 1 && (
          <ul aria-label="Matching addresses" className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-1">
            {searchResults.map((match, index) => (
              <li key={`${match.lat},${match.lng},${index}`}>
                <button
                  type="button"
                  aria-pressed={matchedAddress.current?.address === match.address && matchedAddress.current?.lat === Math.round(match.lat * 1e6) / 1e6 && matchedAddress.current?.lng === Math.round(match.lng * 1e6) / 1e6}
                  className="w-full rounded-md px-2 py-2 text-left text-xs leading-relaxed text-slate-700 hover:bg-slate-100 aria-pressed:bg-blue-50 aria-pressed:text-blue-700"
                  onClick={() => {
                    selectAddress(match);
                    setSearchMessage("Address pinned. Drag the pin to fine-tune the incident location.");
                  }}
                >
                  {match.address}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="location-map-frame" data-testid="location-map-panel">
        <div
          ref={container}
          className="location-map-canvas"
          role="application"
          aria-label="Incident location map—click to drop a pin"
        />
        {!mapReady && !mapError && (
          <div
            role="status"
            className="absolute inset-0 z-[500] flex items-center justify-center bg-slate-100 text-sm text-slate-500"
          >
            Loading map…
          </div>
        )}
        <span className="map-pin-hint">
          <Crosshair size={13} /> Click or drag to set the pin
        </span>
      </div>
      {mapError && (
        <p role="status" className="mt-2 text-xs text-amber-700">
          {mapError}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={startTracking}
          disabled={locating}
          className="primary-button flex flex-1 items-center justify-center gap-2"
        >
          <LocateFixed size={16} />
          {locating
            ? "Locating…"
            : tracking
              ? "Center on device"
              : "Use live location"}
        </button>
        {tracking && (
          <button
            type="button"
            onClick={() => {
              stopTracking();
              setGpsStatus(
                "Live device tracking stopped. Your incident pin is kept.",
              );
            }}
            aria-label="Stop live location"
            className="secondary-button"
          >
            <Square size={14} />
          </button>
        )}
      </div>
      {gpsStatus && (
        <p
          role="status"
          className="mt-2 text-xs leading-relaxed text-slate-500"
        >
          {gpsStatus}
        </p>
      )}
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-slate-600">
          <MapPin size={14} /> Selected incident address
        </div>
        <p
          data-testid="selected-address"
          className="text-sm leading-relaxed text-slate-800"
        >
          {addressLoading
            ? "Finding the nearest mapped address…"
            : address ||
              (selected.current
                ? "Dropped pin selected"
                : "Drop a pin or use your device location")}
        </p>
        {addressError && (
          <p className="mt-1 text-xs text-amber-700">{addressError}</p>
        )}
        {selected.current && (
          <p className="mt-2 text-[11px] text-slate-500">
            Nearest mapped address; confirm the red pin marks the hazard.
          </p>
        )}
      </div>
      {deviceTime && (
        <p
          data-testid="device-location-status"
          className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"
        >
          <Navigation size={12} />
          {tracking ? "Device tracking active" : "Device location saved"} ·
          updated {deviceTime}
        </p>
      )}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className="mt-3 block text-[10px] text-slate-400"
      >
        Map data © OpenStreetMap contributors
      </a>
    </section>
  );
}
