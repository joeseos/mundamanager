'use client';

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { renderToStaticMarkup } from 'react-dom/server';
import { Badge } from '@/components/ui/badge';
import {
  generateHexGrid,
  getHexCornersLatLng,
  hexKey,
  type HexCoord,
} from '@/utils/campaigns/hex-grid';
import { MARKER_ICONS, DEFAULT_MARKER_ICON } from '@/utils/campaigns/map-markers';

interface Gang {
  id: string;
  name: string;
  gang_type: string;
  gang_colour: string;
  allegiance?: {
    id: string;
    name: string;
    is_custom: boolean;
  } | null;
}

interface Territory {
  id: string;
  territory_name: string;
  playing_card?: string | null;
  description?: string | null;
  gang_id: string | null;
  map_object_id?: string | null;
  map_hex_coords?: { x: number; y: number; z: number } | null;
  show_name_on_map?: boolean;
  owning_gangs?: Gang[];
}

interface MapData {
  id: string;
  background_image_url: string;
  hex_grid_enabled: boolean;
  hex_size: number;
}

interface MapObject {
  id: string;
  object_type: string;
  geometry: Record<string, unknown>;
  properties: Record<string, unknown>;
}

interface CampaignMapCanvasProps {
  mapData: MapData;
  mapObjects: MapObject[];
  territories: Territory[];
  allGangs: Gang[];
  onObjectClick: (objectId: string | null, hexCoords?: HexCoord) => void;
  selectedTerritoryId?: string | null;
  editable?: boolean;
  onMapReady?: (map: L.Map) => void;
}

const UNASSIGNED_COLOUR = '#0a0a0a';
const ASSIGNED_HEX_FILL_OPACITY = 0.15;
const ASSIGNED_HEX_STROKE_OPACITY = 0.4;
const UNASSIGNED_HEX_FILL_OPACITY = 0;
const UNASSIGNED_HEX_STROKE_OPACITY = 0.2;
const UNASSIGNED_HEX_STROKE_COLOUR = '#0a0a0a';
const HIGHLIGHT_COLOUR = '#ffffff';

function getGangColour(territory: Territory | undefined, allGangs: Gang[]): string {
  if (!territory?.gang_id) return UNASSIGNED_COLOUR;
  const owning = territory.owning_gangs?.[0];
  if (owning) return owning.gang_colour;
  const gang = allGangs.find(g => g.id === territory.gang_id);
  return gang?.gang_colour ?? UNASSIGNED_COLOUR;
}

function buildTooltipContent(territory: Territory, allGangs: Gang[]): string {
  const card = territory.playing_card ? `${territory.playing_card} ` : '';
  const owningGang = territory.owning_gangs?.[0];
  const isUnallocated = !territory.gang_id || !owningGang;
  if (isUnallocated) {
    return `<div class="text-sm font-semibold">${card}${territory.territory_name}</div><div class="text-xs mt-1">Unallocated</div>`;
  }

  // `territory.owning_gangs` (from _getCampaignTerritories) only carries
  // basic gang info, so look up allegiance from the richer `allGangs` set
  // that was built from campaign members.
  const enrichedGang = allGangs.find(g => g.id === territory.gang_id);

  const gangName = owningGang?.name ?? 'Unallocated';
  const gangColour = owningGang?.gang_colour ?? '#6b7280';
  const gangType = owningGang?.gang_type ?? 'Unknown';
  const gangAllegiance = enrichedGang?.allegiance?.name ?? owningGang?.allegiance?.name ?? 'None';
  const desc = territory.description ? `<div class="text-[0.7rem] mt-1 opacity-80" style="white-space: pre-wrap;">${territory.description}</div>` : '';
  const gangNameBadge = renderToStaticMarkup(
    <Badge
      variant="secondary"
      style={{
        color: gangColour,
        fontWeight: 700,
        backgroundColor: 'hsl(0 0% 20%)',
      }}
    >
      {gangName}
    </Badge>
  );
  const gangBadge = `<div class="text-xs mt-1 flex items-center gap-1"><span>Gang:</span>${gangNameBadge}</div>`;
  const gangTypeBadge = renderToStaticMarkup(
    <Badge variant="secondary"
      style={{
        color: '#ffffff',
        backgroundColor: 'hsl(0 0% 20%)',
      }}
    >
      {gangType}
    </Badge>
  );
  const gangAllegianceBadge = renderToStaticMarkup(
    <Badge variant="secondary"
      style={{
        color: '#ffffff',
        backgroundColor: 'hsl(0 0% 20%)',
      }}
    >
      {gangAllegiance}
    </Badge>
  );
  const gangDetails = `<div class="mt-1 space-y-1"><div class="text-xs flex items-center gap-1"><span>Type:</span>${gangTypeBadge}</div><div class="text-xs flex items-center gap-1"><span>Allegiance:</span>${gangAllegianceBadge}</div></div>`;
  return `<div class="text-sm font-semibold">${card}${territory.territory_name}</div>${gangBadge}${gangDetails}${desc}`;
}

function getDashArray(lineStyle?: string): string | undefined {
  switch (lineStyle) {
    case 'dashed': return '12, 8';
    case 'dotted': return '4, 6';
    default: return undefined;
  }
}

// Stable JSON signature for a map object + its current territory binding.
// Two objects with the same signature render identically on the map, so the
// diff effect can skip re-creating their Leaflet layers.
function computeObjectSignature(
  obj: MapObject,
  territory: Territory | undefined,
  allGangs: Gang[],
  colour: string
): string {
  const owning = territory?.owning_gangs?.[0] ?? null;
  const enrichedAllegiance = territory?.gang_id
    ? allGangs.find(g => g.id === territory.gang_id)?.allegiance?.name ?? null
    : null;
  return JSON.stringify({
    t: obj.object_type,
    g: obj.geometry,
    p: obj.properties,
    tid: territory?.id ?? null,
    tname: territory?.territory_name ?? null,
    tcard: territory?.playing_card ?? null,
    tdesc: territory?.description ?? null,
    tshow: territory?.show_name_on_map ?? true,
    tgid: territory?.gang_id ?? null,
    og: owning ? { n: owning.name, c: owning.gang_colour, t: owning.gang_type } : null,
    all: enrichedAllegiance,
    c: colour,
  });
}

interface ObjectEntry {
  layer: L.Layer;
  nameLayer?: L.Tooltip;
  signature: string;
  territoryId?: string;
}

export default function CampaignMapCanvas({
  mapData,
  mapObjects,
  territories,
  allGangs,
  onObjectClick,
  selectedTerritoryId,
  onMapReady,
}: CampaignMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const hexGroupRef = useRef<L.FeatureGroup | null>(null);
  const objectsGroupRef = useRef<L.FeatureGroup | null>(null);

  const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number } | null>(null);

  // Bumped after the Leaflet instance is (re)created so downstream effects
  // know to populate the fresh map.
  const [mapReadyTick, setMapReadyTick] = useState(0);
  // Bumped when layer setters change so the selection highlight effect re-runs.
  const [mapBuildTick, setMapBuildTick] = useState(0);

  // Persistent layer/state registries (survive across re-renders within the
  // same Leaflet instance; cleared on map teardown).
  const hexPolygonsRef = useRef<Map<string, { poly: L.Polygon; centre: { x: number; y: number }; coord: HexCoord }>>(new Map());
  const hexTerritoryNameLayersRef = useRef<Map<string, L.Tooltip>>(new Map());
  const hexSelectionSettersRef = useRef<Map<string, (selected: boolean) => void>>(new Map());

  const objectLayersRef = useRef<Map<string, ObjectEntry>>(new Map());
  const objectSelectionSettersRef = useRef<Map<string, (selected: boolean) => void>>(new Map());

  // Track last hex "structural" config so the hex effect can distinguish
  // "grid geometry changed (rebuild polys)" from "only territory data
  // changed (just restyle)".
  const lastHexConfigRef = useRef<string>('');

  // Keep latest prop callbacks in refs so layer click handlers never need
  // re-wiring when the parent rerenders.
  const onObjectClickRef = useRef(onObjectClick);
  const onMapReadyRef = useRef(onMapReady);
  useEffect(() => { onObjectClickRef.current = onObjectClick; }, [onObjectClick]);
  useEffect(() => { onMapReadyRef.current = onMapReady; }, [onMapReady]);

  // Territory lookup maps derived from the current `territories` prop.
  const territoryByObjectId = React.useMemo(() => {
    const map = new Map<string, Territory>();
    territories.forEach(t => {
      if (t.map_object_id) map.set(t.map_object_id, t);
    });
    return map;
  }, [territories]);

  const territoryByHexKey = React.useMemo(() => {
    const map = new Map<string, Territory>();
    territories.forEach(t => {
      if (t.map_hex_coords) {
        map.set(hexKey(t.map_hex_coords as HexCoord), t);
      }
    });
    return map;
  }, [territories]);

  // --- Effect: load background image dimensions ---
  useEffect(() => {
    const img = new window.Image();
    img.onload = () => setImageDimensions({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => setImageDimensions({ w: 1920, h: 1080 });
    img.src = mapData.background_image_url;
  }, [mapData.background_image_url]);

  // --- Effect 1: create the Leaflet map (once per imageDimensions) ---
  useEffect(() => {
    if (!containerRef.current || !imageDimensions) return;

    const { w, h } = imageDimensions;
    const bounds: L.LatLngBoundsExpression = [[0, 0], [h, w]];

    const map = L.map(containerRef.current, {
      crs: L.CRS.Simple,
      minZoom: -3,
      maxZoom: 4,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      attributionControl: false,
      maxBounds: L.latLngBounds([[-h * 0.1, -w * 0.1], [h * 1.1, w * 1.1]]),
      maxBoundsViscosity: 0.8,
    });

    L.imageOverlay(mapData.background_image_url, bounds).addTo(map);
    map.fitBounds(bounds);

    const hexGroup = L.featureGroup().addTo(map);
    const objectsGroup = L.featureGroup().addTo(map);

    mapRef.current = map;
    hexGroupRef.current = hexGroup;
    objectsGroupRef.current = objectsGroup;
    lastHexConfigRef.current = '';

    onMapReadyRef.current?.(map);
    setMapReadyTick(t => t + 1);

    return () => {
      map.remove();
      mapRef.current = null;
      hexGroupRef.current = null;
      objectsGroupRef.current = null;
      hexPolygonsRef.current.clear();
      hexTerritoryNameLayersRef.current.clear();
      hexSelectionSettersRef.current.clear();
      objectLayersRef.current.clear();
      objectSelectionSettersRef.current.clear();
      lastHexConfigRef.current = '';
    };
    // `mapData.background_image_url` is already captured through
    // `imageDimensions` (the image-loading effect reacts to URL changes), so
    // depending on it here would force a double teardown/rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageDimensions]);

  // --- Effect 2: build/restyle the hex grid ---
  useEffect(() => {
    if (!mapReadyTick) return;
    const map = mapRef.current;
    const hexGroup = hexGroupRef.current;
    if (!map || !hexGroup || !imageDimensions) return;

    const configSignature = `${imageDimensions.w}x${imageDimensions.h}|${mapData.hex_grid_enabled}|${mapData.hex_size}`;
    const configChanged = configSignature !== lastHexConfigRef.current;
    lastHexConfigRef.current = configSignature;

    // Always clear per-territory hex state (name labels + selection setters);
    // the styling loop below will repopulate from the current territory map.
    hexTerritoryNameLayersRef.current.forEach(t => map.removeLayer(t));
    hexTerritoryNameLayersRef.current.clear();
    hexSelectionSettersRef.current.clear();

    if (configChanged) {
      // Geometry changed — tear down and rebuild the polygon set.
      hexGroup.clearLayers();
      hexPolygonsRef.current.clear();

      if (mapData.hex_grid_enabled && mapData.hex_size > 0) {
        const { w, h } = imageDimensions;
        const hexes = generateHexGrid(w, h, mapData.hex_size);
        hexes.forEach(({ coord, centre }) => {
          const corners = getHexCornersLatLng(centre, mapData.hex_size);
          const poly = L.polygon(corners, { interactive: true }).addTo(hexGroup);
          const key = hexKey(coord);
          hexPolygonsRef.current.set(key, { poly, centre, coord });
          poly.on('click', () => onObjectClickRef.current(null, coord));
        });
      }
    }

    // Restyle every hex polygon with its current territory binding.
    hexPolygonsRef.current.forEach(({ poly, centre, coord }, key) => {
      const territory = territoryByHexKey.get(key);
      const colour = getGangColour(territory, allGangs);

      const baseHexStyle: L.PathOptions = {
        color: territory ? colour : UNASSIGNED_HEX_STROKE_COLOUR,
        weight: territory ? 4 : 1,
        opacity: territory ? ASSIGNED_HEX_STROKE_OPACITY : UNASSIGNED_HEX_STROKE_OPACITY,
        fillColor: colour,
        fillOpacity: territory ? ASSIGNED_HEX_FILL_OPACITY * 2 : UNASSIGNED_HEX_FILL_OPACITY,
      };
      poly.setStyle(baseHexStyle);
      poly.unbindTooltip();

      if (!territory) return;

      const tooltipContent = buildTooltipContent(territory, allGangs) +
        `<div class="text-xs mt-1 opacity-60">Coords: ${coord.x}, ${coord.y}, ${coord.z}</div>`;
      poly.bindTooltip(tooltipContent, { sticky: true, className: 'campaign-map-tooltip' });

      if (territory.show_name_on_map !== false) {
        const nameTooltip = L.tooltip({
          permanent: true,
          direction: 'center',
          className: 'campaign-map-territory-name',
        })
          .setContent(territory.territory_name)
          .setLatLng(L.latLng(centre.y, centre.x))
          .addTo(map);
        hexTerritoryNameLayersRef.current.set(key, nameTooltip);
      }

      hexSelectionSettersRef.current.set(territory.id, (selected: boolean) => {
        if (selected) {
          poly.setStyle({
            color: HIGHLIGHT_COLOUR,
            weight: 3,
            opacity: 0.9,
            fillColor: HIGHLIGHT_COLOUR,
            fillOpacity: 0.25,
          });
          poly.bringToFront();
        } else {
          poly.setStyle(baseHexStyle);
        }
      });
    });

    setMapBuildTick(t => t + 1);
  }, [mapReadyTick, imageDimensions, mapData.hex_grid_enabled, mapData.hex_size, territoryByHexKey, allGangs]);

  // --- Effect 3: diff map objects against `mapObjects` ---
  useEffect(() => {
    if (!mapReadyTick) return;
    const map = mapRef.current;
    const objectsGroup = objectsGroupRef.current;
    if (!map || !objectsGroup) return;

    const seenIds = new Set<string>();

    mapObjects.forEach(obj => {
      seenIds.add(obj.id);

      const territory = territoryByObjectId.get(obj.id);
      const colour = getGangColour(territory, allGangs);
      const signature = computeObjectSignature(obj, territory, allGangs, colour);

      const existing = objectLayersRef.current.get(obj.id);
      if (existing && existing.signature === signature) return;

      // Signature mismatch (or new object) — remove old entry (if any) and
      // rebuild from scratch. Full replacement keeps the code simple and
      // correctness-preserving; performance is still fine because we only
      // touch the layers that actually changed.
      if (existing) {
        objectsGroup.removeLayer(existing.layer);
        if (existing.nameLayer) map.removeLayer(existing.nameLayer);
        if (existing.territoryId) objectSelectionSettersRef.current.delete(existing.territoryId);
        objectLayersRef.current.delete(obj.id);
      }

      const built = buildObjectEntry(obj, territory, colour);
      if (!built) return;

      built.layer.addTo(objectsGroup);
      built.layer.on('click', () => onObjectClickRef.current(obj.id));
      built.nameLayer?.addTo(map);

      if (territory) {
        const tooltipContent = buildTooltipContent(territory, allGangs) +
          `<div class="text-xs mt-1 opacity-60">ID: ${obj.id.slice(0, 8)}</div>`;
        built.layer.bindTooltip(tooltipContent, { sticky: true, className: 'campaign-map-tooltip' });

        if (built.setSelected) {
          objectSelectionSettersRef.current.set(territory.id, built.setSelected);
        }
      }

      objectLayersRef.current.set(obj.id, {
        layer: built.layer,
        nameLayer: built.nameLayer,
        signature,
        territoryId: territory?.id,
      });
    });

    // Remove objects that no longer exist in the incoming data.
    Array.from(objectLayersRef.current.keys()).forEach(id => {
      if (seenIds.has(id)) return;
      const entry = objectLayersRef.current.get(id);
      if (!entry) return;
      objectsGroup.removeLayer(entry.layer);
      if (entry.nameLayer) map.removeLayer(entry.nameLayer);
      if (entry.territoryId) objectSelectionSettersRef.current.delete(entry.territoryId);
      objectLayersRef.current.delete(id);
    });

    setMapBuildTick(t => t + 1);
  }, [mapReadyTick, mapObjects, territoryByObjectId, allGangs]);

  // --- Effect 4: apply selection highlight ---
  useEffect(() => {
    hexSelectionSettersRef.current.forEach((setSelected, territoryId) => {
      setSelected(territoryId === selectedTerritoryId);
    });
    objectSelectionSettersRef.current.forEach((setSelected, territoryId) => {
      setSelected(territoryId === selectedTerritoryId);
    });
  }, [selectedTerritoryId, mapBuildTick]);

  return (
    <>
      <style>{`
        .leaflet-container {
          background: hsl(var(--background)) !important;
        }

        .campaign-map-tooltip {
          background: rgba(0,0,0,0.85) !important;
          color: #fff !important;
          border: none !important;
          border-radius: 6px !important;
          padding: 8px 12px !important;
          font-size: 13px !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
          width: 18rem !important;
          max-width: 18rem !important;
          max-height: 50vh !important;
          overflow-y: auto !important;
          overflow-x: hidden !important;
          white-space: normal !important;
        }
        @media (max-width: 640px) {
          .campaign-map-tooltip {
            width: 18rem !important;
            max-width: 18rem !important;
            padding: 6px 8px !important;
            font-size: 12px !important;
          }
        }
        .campaign-map-tooltip::before {
          border-top-color: rgba(0,0,0,0.85) !important;
        }
        .campaign-map-territory-name {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          color: #fff !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          text-shadow: 0 1px 3px rgba(0,0,0,0.8), 0 0px 6px rgba(0,0,0,0.5) !important;
          padding: 0 !important;
          white-space: nowrap !important;
        }
        .campaign-map-territory-name::before {
          display: none !important;
        }
        .campaign-map-div-icon {
          background: transparent !important;
          border: none !important;
        }
        /* Suppress the browser's default focus ring (black/white dashed rectangle)
           that appears around SVG paths and markers when they are clicked. */
        .leaflet-container .leaflet-interactive:focus,
        .leaflet-container .leaflet-interactive:focus-visible,
        .leaflet-container path.leaflet-interactive:focus,
        .leaflet-container path.leaflet-interactive:focus-visible,
        .leaflet-container .leaflet-marker-icon:focus,
        .leaflet-container .leaflet-marker-icon:focus-visible {
          outline: none !important;
        }
      `}</style>
      <div ref={containerRef} className="w-full h-[70vh]" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface BuiltObject {
  layer: L.Layer;
  nameLayer?: L.Tooltip;
  setSelected?: (selected: boolean) => void;
}

function buildObjectEntry(
  obj: MapObject,
  territory: Territory | undefined,
  colour: string
): BuiltObject | null {
  const props = obj.properties as Record<string, unknown>;
  const showTerritoryName = !!territory && territory.show_name_on_map !== false;

  switch (obj.object_type) {
    case 'landmark': {
      const geo = obj.geometry as { latlng: [number, number] };
      const iconName = (props.icon as string) ?? DEFAULT_MARKER_ICON;
      const markerDef = MARKER_ICONS[iconName] ?? MARKER_ICONS[DEFAULT_MARKER_ICON];
      const makeIcon = (iconColour: string) => L.divIcon({
        html: `<div class="campaign-map-landmark">${markerDef.html(iconColour)}</div>`,
        className: 'campaign-map-div-icon',
        iconSize: markerDef.iconSize,
        iconAnchor: markerDef.iconAnchor,
      });
      const marker = L.marker(geo.latlng, { icon: makeIcon(colour) });

      let nameLayer: L.Tooltip | undefined;
      if (showTerritoryName && territory) {
        const isReactIcon = markerDef.isReactIcon ?? false;
        const offsetY = isReactIcon ? 6 : 10;
        nameLayer = L.tooltip({
          permanent: true,
          direction: 'bottom',
          offset: L.point(0, offsetY),
          className: 'campaign-map-territory-name',
        })
          .setContent(territory.territory_name)
          .setLatLng(geo.latlng);
      }

      return {
        layer: marker,
        nameLayer,
        setSelected: (selected: boolean) => {
          marker.setIcon(makeIcon(selected ? HIGHLIGHT_COLOUR : colour));
        },
      };
    }
    case 'route': {
      const geo = obj.geometry as { latlngs: [number, number][] };
      const dashArray = getDashArray(props.lineStyle as string | undefined);
      const weight = (props.strokeWidth as number) ?? 3;
      const baseStyle: L.PathOptions = { color: colour, weight, dashArray };
      const polyline = L.polyline(geo.latlngs, baseStyle);

      let nameLayer: L.Tooltip | undefined;
      if (showTerritoryName && territory && geo.latlngs.length >= 2) {
        const midIdx = Math.floor(geo.latlngs.length / 2);
        const midPoint = geo.latlngs[midIdx];
        nameLayer = L.tooltip({
          permanent: true,
          direction: 'top',
          offset: L.point(0, -8),
          className: 'campaign-map-territory-name',
        })
          .setContent(territory.territory_name)
          .setLatLng(midPoint);
      }

      return {
        layer: polyline,
        nameLayer,
        setSelected: (selected: boolean) => {
          if (selected) {
            polyline.setStyle({ color: HIGHLIGHT_COLOUR, weight: weight + 1, opacity: 0.9, dashArray });
            polyline.bringToFront();
          } else {
            polyline.setStyle(baseStyle);
          }
        },
      };
    }
    case 'area_polygon': {
      const geo = obj.geometry as { latlngs: [number, number][] };
      const baseStyle: L.PathOptions = {
        color: colour,
        fillColor: colour,
        fillOpacity: (props.fillOpacity as number) ?? 0.3,
        weight: 2,
      };
      const polygon = L.polygon(geo.latlngs, baseStyle);

      let nameLayer: L.Tooltip | undefined;
      if (showTerritoryName && territory) {
        const centre = polygon.getBounds().getCenter();
        nameLayer = L.tooltip({
          permanent: true,
          direction: 'center',
          className: 'campaign-map-territory-name',
        })
          .setContent(territory.territory_name)
          .setLatLng(centre);
      }

      return {
        layer: polygon,
        nameLayer,
        setSelected: (selected: boolean) => {
          if (selected) {
            polygon.setStyle({
              color: HIGHLIGHT_COLOUR,
              fillColor: HIGHLIGHT_COLOUR,
              fillOpacity: 0.25,
              weight: 4,
              opacity: 0.9,
            });
            polygon.bringToFront();
          } else {
            polygon.setStyle(baseStyle);
          }
        },
      };
    }
    case 'area_circle': {
      const geo = obj.geometry as { latlng: [number, number]; radius: number };
      const baseStyle: L.PathOptions = {
        color: colour,
        fillColor: colour,
        fillOpacity: (props.fillOpacity as number) ?? 0.3,
        weight: 2,
      };
      const circle = L.circle(geo.latlng, { radius: geo.radius, ...baseStyle });

      let nameLayer: L.Tooltip | undefined;
      if (showTerritoryName && territory) {
        nameLayer = L.tooltip({
          permanent: true,
          direction: 'center',
          className: 'campaign-map-territory-name',
        })
          .setContent(territory.territory_name)
          .setLatLng(geo.latlng);
      }

      return {
        layer: circle,
        nameLayer,
        setSelected: (selected: boolean) => {
          if (selected) {
            circle.setStyle({
              color: HIGHLIGHT_COLOUR,
              fillColor: HIGHLIGHT_COLOUR,
              fillOpacity: 0.25,
              weight: 4,
              opacity: 0.9,
            });
            circle.bringToFront();
          } else {
            circle.setStyle(baseStyle);
          }
        },
      };
    }
    case 'label': {
      const geo = obj.geometry as { latlng: [number, number] };
      const text = (props.text as string) ?? '';
      const fontSize = (props.fontSize as number) ?? 14;
      const lineCount = text.split(/\r?\n/).length;
      const lineHeightPx = fontSize;
      const offsetY = (Math.max(1, lineCount) - 1) * (lineHeightPx / 2);
      const makeLabelIcon = (labelColour: string) => L.divIcon({
        html: `<div style="display:inline-block;color:${labelColour};font-size:${fontSize}px;font-weight:600;line-height:1;white-space:pre;transform:translate(-50%, -50%);text-shadow:0 1px 3px rgba(255, 255, 255, 0.7);">${text}</div>`,
        className: 'campaign-map-div-icon',
        iconAnchor: [0, 0],
      });
      const marker = L.marker(geo.latlng, { icon: makeLabelIcon(colour) });

      let nameLayer: L.Tooltip | undefined;
      if (showTerritoryName && territory) {
        nameLayer = L.tooltip({
          permanent: true,
          direction: 'bottom',
          offset: L.point(0, offsetY),
          className: 'campaign-map-territory-name',
        })
          .setContent(territory.territory_name)
          .setLatLng(geo.latlng);
      }

      return {
        layer: marker,
        nameLayer,
        setSelected: (selected: boolean) => {
          marker.setIcon(makeLabelIcon(selected ? HIGHLIGHT_COLOUR : colour));
        },
      };
    }
    default:
      return null;
  }
}
