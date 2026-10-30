'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Locate, MapPin, AlertCircle } from 'lucide-react';

interface LocationPickerProps {
  initialLat?: number;
  initialLng?: number;
  onLocationChange: (lat: number, lng: number) => void;
  onReporterLocationFound?: (lat: number, lng: number) => void;
}

export const LocationPickerMap: React.FC<LocationPickerProps> = ({
  initialLat = 22.9447,
  initialLng = 90.8282,
  onLocationChange,
  onReporterLocationFound,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const reporterMarkerRef = useRef<any>(null);
  const leafletModuleRef = useRef<any>(null);
  const locationChangeRef = useRef(onLocationChange);
  locationChangeRef.current = onLocationChange;

  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: initialLat,
    lng: initialLng,
  });
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current) return;

    let isMounted = true;

    import('leaflet').then((leafletModule) => {
      if (!isMounted || !mapContainerRef.current) return;
      const L = leafletModule.default || leafletModule;
      leafletModuleRef.current = L;

      if (!mapRef.current) {
        const map = L.map(mapContainerRef.current, {
          center: [initialLat, initialLng],
          zoom: 14,
          zoomControl: false,
          zoomAnimation: false,
          markerZoomAnimation: false,
        });

        L.control.zoom({ position: 'bottomright' }).addTo(map);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);

        // Custom draggable red pin for the incident location
        const incidentIcon = L.divIcon({
          className: 'incident-picker-marker',
          html: `
            <div style="
              width: 32px;
              height: 32px;
              background: #ef4444;
              border: 2px solid #ffffff;
              border-radius: 50% 50% 50% 0;
              transform: rotate(-45deg);
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 0 12px rgba(239,68,68,0.7);
            ">
              <div style="width: 10px; height: 10px; background: #ffffff; border-radius: 50%;"></div>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });

        const marker = L.marker([initialLat, initialLng], {
          icon: incidentIcon,
          draggable: true,
        }).addTo(map);

        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          const updated = {
            lat: Math.round(pos.lat * 10000) / 10000,
            lng: Math.round(pos.lng * 10000) / 10000,
          };
          setCoords(updated);
          locationChangeRef.current(updated.lat, updated.lng);
        });

        // Map click moves marker to clicked position
        map.on('click', (e: any) => {
          const updated = {
            lat: Math.round(e.latlng.lat * 10000) / 10000,
            lng: Math.round(e.latlng.lng * 10000) / 10000,
          };
          marker.setLatLng([updated.lat, updated.lng]);
          setCoords(updated);
          locationChangeRef.current(updated.lat, updated.lng);
        });

        markerRef.current = marker;
        mapRef.current = map;
      }
    });

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.stop();
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Preset changes must move both the displayed pin and the submitted coordinates.
  useEffect(() => {
    setCoords({ lat: initialLat, lng: initialLng });
    if (mapRef.current && markerRef.current) {
      markerRef.current.setLatLng([initialLat, initialLng]);
      mapRef.current.panTo([initialLat, initialLng]);
    }
  }, [initialLat, initialLng]);

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGpsStatus('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    setGpsStatus('Requesting GPS location...');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        const repLat = Math.round(position.coords.latitude * 10000) / 10000;
        const repLng = Math.round(position.coords.longitude * 10000) / 10000;

        setGpsStatus(`GPS located (${repLat}, ${repLng}). Drag red pin to exact incident hazard spot.`);

        if (onReporterLocationFound) {
          onReporterLocationFound(repLat, repLng);
        }

        const map = mapRef.current;
        const L = leafletModuleRef.current;
        if (map && L) {
          const reporterIcon = L.divIcon({
            className: 'reporter-gps-marker',
            html: `
              <div style="
                width: 20px;
                height: 20px;
                background: #38bdf8;
                border: 3px solid #ffffff;
                border-radius: 50%;
                box-shadow: 0 0 10px #38bdf8;
              "></div>
            `,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          });

          if (reporterMarkerRef.current) {
            reporterMarkerRef.current.setLatLng([repLat, repLng]);
          } else {
            reporterMarkerRef.current = L.marker([repLat, repLng], {
              icon: reporterIcon,
            })
              .addTo(map)
              .bindPopup('Your Current GPS Location (Reporter)');
          }

          map.flyTo([repLat, repLng], 16);
          if (markerRef.current) {
            markerRef.current.setLatLng([repLat, repLng]);
          }
          setCoords({ lat: repLat, lng: repLng });
          onLocationChange(repLat, repLng);
        }
      },
      (error) => {
        setIsLocating(false);
        let errorMsg = 'GPS permission denied or unavailable.';
        if (error.code === error.PERMISSION_DENIED) {
          errorMsg = 'GPS access denied by user. Please click on the map to set the incident location manually.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          errorMsg = 'GPS position unavailable. Please pick location manually on the map.';
        }
        setGpsStatus(errorMsg);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <MapPin className="w-4 h-4 text-red-400" />
          <span className="text-xs font-semibold text-slate-300">
            Selected Incident Coordinates:
          </span>
          <span className="text-xs font-mono bg-slate-800 text-sky-400 px-2 py-0.5 rounded border border-slate-700">
            {coords.lat.toFixed(4)}°N, {coords.lng.toFixed(4)}°E
          </span>
        </div>

        <button
          type="button"
          onClick={handleGetCurrentLocation}
          disabled={isLocating}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-colors disabled:opacity-50"
        >
          <Locate className={`w-3.5 h-3.5 text-sky-400 ${isLocating ? 'animate-spin' : ''}`} />
          {isLocating ? 'Acquiring GPS...' : 'Use My Current Location'}
        </button>
      </div>

      {gpsStatus && (
        <div className="text-[11px] flex items-center gap-1.5 text-slate-400 bg-slate-900/80 px-2.5 py-1.5 rounded border border-slate-800">
          <AlertCircle className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span>{gpsStatus}</span>
        </div>
      )}

      {/* Map Element */}
      <div className="relative w-full h-64 rounded-xl overflow-hidden border border-slate-700/80">
        <div ref={mapContainerRef} className="w-full h-full dark-tiles z-0" />
        <div className="absolute bottom-2 left-2 z-10 glass-panel px-2.5 py-1 rounded text-[11px] text-slate-300 pointer-events-none">
          Click map or drag the <span className="text-red-400 font-bold">Red Marker</span> to specify the hazard site
        </div>
      </div>
    </div>
  );
};
