"use client";

import React, { useEffect, useRef, useState } from "react";
import { Incident } from "@/types";

interface IncidentMapProps {
  incidents: Incident[];
  selectedIncidentId?: string | null;
  onSelectIncident: (incident: Incident) => void;
  center?: [number, number];
  zoom?: number;
}

export const IncidentMap: React.FC<IncidentMapProps> = ({
  incidents,
  selectedIncidentId,
  onSelectIncident,
  center = [22.9447, 90.8282], // Lakshmipur center
  zoom = 13,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const leafletModuleRef = useRef<any>(null);
  const renderMarkersRef = useRef<() => void>(() => {});

  const initialView = useRef({ center, zoom });
  const [mapError, setMapError] = useState("");
  const fitted = useRef(false);
  const focusedId = useRef<string | null | undefined>(undefined);

  // Initialize Map
  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return;

    let isMounted = true;
    let resizeObserver: ResizeObserver | undefined;

    import("leaflet")
      .then((leafletModule) => {
        if (!isMounted || !mapContainerRef.current) return;
        const L = leafletModule.default || leafletModule;
        leafletModuleRef.current = L;

        if (!mapInstanceRef.current) {
          const map = L.map(mapContainerRef.current, {
            center: initialView.current.center,
            zoom: initialView.current.zoom,
            zoomControl: false,
            // Role changes may unmount the map before Leaflet's CSS zoom timer ends.
            zoomAnimation: false,
            markerZoomAnimation: false,
          });

          L.control.zoom({ position: "bottomright" }).addTo(map);

          const tiles = L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
              attribution: "&copy; OpenStreetMap contributors",
              maxZoom: 19,
            },
          ).addTo(map);
          tiles.on("tileerror", () => {
            if (isMounted)
              setMapError(
                "Map tiles are unavailable. Use the incident list to select and review incidents.",
              );
          });

          const markersGroup = L.layerGroup().addTo(map);
          markersLayerRef.current = markersGroup;
          mapInstanceRef.current = map;

          renderMarkersRef.current();
          resizeObserver = new ResizeObserver(() => {
            if (isMounted) map.invalidateSize({ pan: false });
          });
          resizeObserver.observe(mapContainerRef.current);
        }
      })
      .catch(() => {
        if (isMounted)
          setMapError(
            "The map could not load. The incident list is still available.",
          );
      });

    return () => {
      isMounted = false;
      resizeObserver?.disconnect();
      if (mapInstanceRef.current) {
        mapInstanceRef.current.stop();
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const renderMarkers = (L: any, map: any, markersGroup: any) => {
    markersGroup.clearLayers();
    const bounds = L.latLngBounds([]);

    incidents.forEach((incident) => {
      const isSelected = incident.id === selectedIncidentId;
      const lat = incident.latitude;
      const lng = incident.longitude;

      bounds.extend([lat, lng]);

      const colors = {
        Critical: {
          bg: "#ef4444",
          ring: "rgba(239, 68, 68, 0.4)",
          text: "#ffffff",
        },
        High: {
          bg: "#f97316",
          ring: "rgba(249, 115, 22, 0.4)",
          text: "#ffffff",
        },
        Medium: {
          bg: "#eab308",
          ring: "rgba(234, 179, 8, 0.4)",
          text: "#1e293b",
        },
        Low: {
          bg: "#10b981",
          ring: "rgba(16, 185, 129, 0.4)",
          text: "#ffffff",
        },
      }[incident.priority_band] || {
        bg: "#64748b",
        ring: "rgba(100, 116, 139, 0.4)",
        text: "#ffffff",
      };

      const markerHtml = `
        <div style="
          width: ${isSelected ? "38px" : "30px"};
          height: ${isSelected ? "38px" : "30px"};
          background-color: ${colors.bg};
          border: 3px solid ${isSelected ? "#ffffff" : colors.ring};
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 ${isSelected ? "20px" : "10px"} ${colors.bg};
          cursor: pointer;
          transition: transform 0.2s ease;
          transform: ${isSelected ? "scale(1.15)" : "scale(1)"};
        ">
          <span style="
            color: ${colors.text};
            font-size: ${isSelected ? "12px" : "10px"};
            font-weight: 700;
            font-family: monospace;
          ">
            ${Math.round(incident.priority_score)}
          </span>
        </div>
      `;

      const customIcon = L.divIcon({
        className: "custom-incident-marker",
        html: markerHtml,
        iconSize: [isSelected ? 38 : 30, isSelected ? 38 : 30],
        iconAnchor: [isSelected ? 19 : 15, isSelected ? 19 : 15],
      });

      const marker = L.marker([lat, lng], {
        icon: customIcon,
        title: incident.title,
        alt: incident.title,
      });

      const popupHtml = `
        <div style="padding: 4px; min-width: 200px; color: #334155; font-family: system-ui, sans-serif;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <span style="
              background: ${colors.bg}25;
              color: ${colors.bg};
              padding: 2px 8px;
              border-radius: 9999px;
              font-size: 11px;
              font-weight: 600;
              border: 1px solid ${colors.bg}60;
            ">
              ${incident.priority_band} (${incident.priority_score.toFixed(1)})
            </span>
            <span style="font-size: 11px; color: #64748b; text-transform: uppercase;">
              ${incident.category.replace("_", " ")}
            </span>
          </div>
          <h4 style="margin: 0 0 6px 0; font-size: 13px; font-weight: 600; color: #0f172a; line-height: 1.3;">
            ${escapeHtml(incident.title)}
          </h4>
          <p style="margin: 0 0 8px 0; font-size: 11px; color: #64748b; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
            ${escapeHtml(incident.description)}
          </p>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px;">
            <span style="color: #2563eb;">Evidence: ${incident.evidence_count || 1} photo(s)</span>
            <span style="color: ${incident.verification_status === "verified" ? "#10b981" : "#f59e0b"};">
              ● ${incident.verification_status}
            </span>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        className: "dark-popup",
        offset: [0, -10],
      });

      marker.on("click", () => {
        onSelectIncident(incident);
      });

      markersGroup.addLayer(marker);
    });

    if (selectedIncidentId && focusedId.current !== selectedIncidentId) {
      const selected = incidents.find((i) => i.id === selectedIncidentId);
      if (selected) {
        fitted.current = true;
        map.flyTo([selected.latitude, selected.longitude], 15, { duration: 1 });
      }
    } else if (!fitted.current && incidents.length > 0 && bounds.isValid()) {
      fitted.current = true;
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
    focusedId.current = selectedIncidentId;
  };

  // Async Leaflet loading must render the latest fetched incidents, not mount-time data.
  renderMarkersRef.current = () => {
    if (
      leafletModuleRef.current &&
      mapInstanceRef.current &&
      markersLayerRef.current
    ) {
      renderMarkers(
        leafletModuleRef.current,
        mapInstanceRef.current,
        markersLayerRef.current,
      );
    }
  };

  // Re-render markers on incidents or selectedIncident change
  useEffect(() => {
    renderMarkersRef.current();
  }, [incidents, selectedIncidentId, onSelectIncident]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-slate-200 shadow-2xl">
      <div ref={mapContainerRef} className="w-full h-full dark-tiles z-0" />

      {mapError && (
        <p
          role="status"
          className="absolute bottom-2 left-2 right-2 z-20 rounded bg-slate-50/95 p-2 text-xs text-amber-700"
        >
          {mapError}
        </p>
      )}
      {/* Map Legend Overlay */}
      <div className="absolute top-4 right-4 z-10 glass-panel px-3 py-2 rounded-lg text-xs space-y-1.5 shadow-lg border border-slate-200/60 pointer-events-auto">
        <div className="font-semibold text-slate-700 mb-1 flex items-center justify-between gap-4">
          <span>Priority Bands</span>
          <span className="text-[10px] text-slate-500 font-mono">0-100</span>
        </div>
        <div className="flex items-center gap-2 text-slate-700">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
          <span>Critical (80-100)</span>
        </div>
        <div className="flex items-center gap-2 text-slate-700">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
          <span>High (60-79.9)</span>
        </div>
        <div className="flex items-center gap-2 text-slate-700">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span>Medium (35-59.9)</span>
        </div>
        <div className="flex items-center gap-2 text-slate-700">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span>Low (0-34.9)</span>
        </div>
      </div>
    </div>
  );
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}
