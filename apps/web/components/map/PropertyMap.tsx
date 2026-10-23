"use client";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import L from "leaflet";
import "leaflet.markercluster";
import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import type { ListingSummary } from "@novoseminovo/shared-types";

// Mapa da busca de imóveis (Leaflet + mapa da CARTO sobre dados do
// OpenStreetMap — grátis, sem chave; NEXT_PUBLIC_MAP_TILE_URL troca o
// fornecedor se o volume crescer). Marcadores com o preço, agrupados com a
// contagem quando estão perto (como no QuintoAndar). Os pontos já chegam
// aproximados da API.

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
// Sem anúncios com ponto, o mapa abre no Brasil inteiro (atuação nacional);
// com resultados, enquadra os pins (fitOnLoad).
const BRASIL: [number, number] = [-14.235, -51.9253];

export type Bbox = string; // "oeste,sul,leste,norte"

function shortPrice(value?: number): string {
  if (!value) return "—";
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: value >= 10_000 ? 0 : 1 })} mil`;
  return `R$ ${value.toLocaleString("pt-BR")}`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function popupHtml(listing: ListingSummary): string {
  const image = listing.image ? `<img src="${escapeHtml(listing.image)}" alt="" class="ns-popup-img" />` : "";
  return `<a href="/anuncio/${encodeURIComponent(listing.id)}" class="ns-popup">${image}<span class="ns-popup-body"><strong>${escapeHtml(
    listing.priceLabel,
  )}</strong><span>${escapeHtml(listing.title)}</span>${listing.subtitle ? `<small>${escapeHtml(listing.subtitle)}</small>` : ""}<small>${escapeHtml(
    listing.location,
  )}</small></span></a>`;
}

function Markers({
  listings,
  hoveredId,
  fitOnLoad,
  onBoundsChange,
}: {
  listings: ListingSummary[];
  hoveredId?: string;
  fitOnLoad: boolean;
  onBoundsChange: (bbox: Bbox) => void;
}) {
  const map = useMap();
  const groupRef = useRef<L.MarkerClusterGroup>();
  const markersRef = useRef(new Map<string, L.Marker>());
  const programmatic = useRef(false);
  const fitted = useRef(false);

  useEffect(() => {
    const group = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      iconCreateFunction: (cluster) =>
        L.divIcon({ html: `<span>${cluster.getChildCount()}</span>`, className: "ns-cluster", iconSize: [44, 44] }),
    });
    map.addLayer(group);
    groupRef.current = group;
    const handleMove = () => {
      if (programmatic.current) {
        programmatic.current = false;
        return;
      }
      const b = map.getBounds();
      onBoundsChange([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((n) => n.toFixed(5)).join(","));
    };
    map.on("moveend", handleMove);
    return () => {
      map.off("moveend", handleMove);
      map.removeLayer(group);
    };
    // onBoundsChange vem estável do pai (useCallback)
  }, [map, onBoundsChange]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();
    markersRef.current.clear();
    const located = listings.filter((listing) => listing.lat != null && listing.lng != null);
    for (const listing of located) {
      const marker = L.marker([listing.lat!, listing.lng!], {
        icon: L.divIcon({ html: `<span>${escapeHtml(shortPrice(listing.price))}</span>`, className: "ns-pin", iconSize: undefined }),
        title: listing.title,
      });
      marker.bindPopup(popupHtml(listing), { closeButton: false, minWidth: 220, maxWidth: 240 });
      group.addLayer(marker);
      markersRef.current.set(listing.id, marker);
    }
    if (fitOnLoad && !fitted.current && located.length > 0) {
      fitted.current = true;
      programmatic.current = true;
      map.fitBounds(L.latLngBounds(located.map((listing) => [listing.lat!, listing.lng!] as [number, number])), { padding: [40, 40], maxZoom: 15 });
    }
  }, [listings, fitOnLoad, map]);

  useEffect(() => {
    for (const [id, marker] of markersRef.current) marker.getElement()?.classList.toggle("ns-pin-active", id === hoveredId);
  }, [hoveredId]);

  return null;
}

export default function PropertyMap(props: {
  listings: ListingSummary[];
  hoveredId?: string;
  onBoundsChange: (bbox: Bbox) => void;
}) {
  return (
    <MapContainer center={BRASIL} zoom={4} scrollWheelZoom className="h-full w-full" attributionControl>
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} subdomains="abcd" maxZoom={19} />
      <Markers listings={props.listings} hoveredId={props.hoveredId} fitOnLoad onBoundsChange={props.onBoundsChange} />
    </MapContainer>
  );
}
