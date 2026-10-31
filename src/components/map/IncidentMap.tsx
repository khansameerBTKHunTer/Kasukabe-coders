"use client";

import React, { useEffect, useRef, useState } from "react";
import { Incident } from "@/types";
import { mapPriority, PRIORITY_MARKERS } from "@/lib/map-priority";

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
          let tileBatchFailed = false;
          tiles.on("loading", () => { tileBatchFailed = false; });
          tiles.on("tileerror", () => {
            tileBatchFailed = true;
            if (isMounted)
              setMapError(
                "Map tiles are unavailable. Use the incident list to select and review incidents.",
              );
          });
          // Leaflet also emits load after failed tiles finish. Keep the warning
          // until a later tile batch actually succeeds.
          tiles.on("load", () => { if (isMounted && !tileBatchFailed) setMapError(""); });

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

    incidents.filter(hasValidLocation).forEach((incident) => {
      const isSelected = incident.id === selectedIncidentId;
      const lat = incident.latitude;
      const lng = incident.longitude;

      bounds.extend([lat, lng]);

      const colors = mapPriority(incident.priority_band);
      const score = Number.isFinite(incident.priority_score) ? incident.priority_score : 0;
      const label = `${colors.label} priority: ${incident.title}. Score ${score.toFixed(1)} of 100.`;
      const markerHtml = `<div class="priority-map-marker priority-${colors.className}${isSelected ? " is-selected" : ""}"
        data-priority="${colors.label}" aria-hidden="true" style="--marker-color:${colors.bg};--marker-ring:${colors.ring};--marker-text:${colors.text};--marker-size:${colors.size}px">
        <span class="priority-marker-halo"></span>
        <span class="priority-marker-body"><span class="priority-marker-content"><small>${colors.symbol}</small><strong>${Math.round(score)}</strong></span></span>
        <span class="priority-marker-label">${colors.label}</span>
      </div>`;

      const customIcon = L.divIcon({
        className: "custom-incident-marker",
        html: markerHtml,
        iconSize: [96, 82],
        iconAnchor: [48, 30],
      });

      const marker = L.marker([lat, lng], {
        icon: customIcon,
        title: label,
        alt: label,
        keyboard: true,
        zIndexOffset: isSelected ? 1200 : colors.rank * 200,
      });
      marker.on("add", () => {
        const element = marker.getElement();
        element?.setAttribute("role", "button");
        element?.setAttribute("aria-label", label);
        element?.setAttribute("aria-pressed", String(isSelected));
        element?.addEventListener("keydown", (event: KeyboardEvent) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            marker.fire("click");
          }
        });
      });

      const popupHtml = `
        <div style="padding: 4px; min-width: 200px; color: #4f3c30; font-family: system-ui, sans-serif;">
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
              ${colors.label} (${score.toFixed(1)})
            </span>
            <span style="font-size: 11px; color: #6d5947; text-transform: uppercase;">
              ${escapeHtml(incident.category).replaceAll("_", " ")}
            </span>
          </div>
          <h4 style="margin: 0 0 6px 0; font-size: 13px; font-weight: 600; color: #142841; line-height: 1.3;">
            ${escapeHtml(incident.title)}
          </h4>
          <p style="margin: 0 0 8px 0; font-size: 11px; color: #6d5947; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
            ${escapeHtml(incident.description)}
          </p>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px;">
            <span style="color: #4c6680;">Evidence: ${incident.evidence_count || 1} photo(s)</span>
            <span style="color: ${incident.verification_status === "verified" ? "#10b981" : "#f59e0b"};">
              ● ${escapeHtml(incident.verification_status)}
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
      if (isSelected) marker.openPopup();
    });

    if (selectedIncidentId && focusedId.current !== selectedIncidentId) {
      const selected = incidents.find((i) => i.id === selectedIncidentId && hasValidLocation(i));
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
      {incidents.some(incident => !hasValidLocation(incident)) && (
        <p role="status" className="absolute bottom-2 left-2 z-20 max-w-[70%] rounded bg-slate-50 p-2 text-xs text-amber-700">
          Some reports have invalid coordinates. Review those incidents in the list.
        </p>
      )}
      {/* Map Legend Overlay */}
      <div className="absolute top-4 right-4 z-10 glass-panel px-3 py-2 rounded-lg text-xs space-y-1.5 shadow-lg border border-slate-200/60 pointer-events-auto">
        <div className="font-semibold text-slate-700 mb-1 flex items-center justify-between gap-4">
          <span>Priority Bands</span>
          <span className="text-[10px] text-slate-500 font-mono">0-100</span>
        </div>
        {Object.entries(PRIORITY_MARKERS).map(([band, style], index) => (
          <div key={band} className="flex items-center gap-2 text-slate-700">
            <span aria-hidden="true" className={`priority-legend-symbol priority-${band.toLowerCase()}`} style={{ background: style.bg, color: style.text }}>{style.symbol}</span>
            <span>{band} ({["80–100", "60–79.9", "35–59.9", "0–34.9"][index]})</span>
          </div>
        ))}
      </div>
    </div>
  );
};

function hasValidLocation(incident: Incident) {
  return typeof incident.latitude === "number" && typeof incident.longitude === "number" &&
    Number.isFinite(incident.latitude) && Number.isFinite(incident.longitude) &&
    Math.abs(incident.latitude) <= 90 && Math.abs(incident.longitude) <= 180;
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}
