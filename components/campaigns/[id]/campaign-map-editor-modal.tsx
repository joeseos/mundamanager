'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Modal from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { createClient } from '@/utils/supabase/client';
import {
  validateImageFile,
  processImageFile,
  createImage,
  compressImage,
} from '@/utils/image-processing';
import {
  createCampaignMap,
  updateCampaignMap,
  upsertMapObjects,
  bulkDeleteMapObjects,
  bulkUpdateTerritoryMapAssociations,
  deleteCampaignMap,
} from '@/app/actions/campaigns/[id]/campaign-map';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import type { HexCoord } from '@/utils/campaigns/hex-grid';
import { generateHexGrid, getHexCornersLatLng, hexKey } from '@/utils/campaigns/hex-grid';
import { MARKER_ICONS, MARKER_ICON_KEYS, DEFAULT_MARKER_ICON } from '@/utils/campaigns/map-markers';

const HIGHLIGHT_COLOUR = '#ffffff';
const LINKED_COLOUR = '#8a203a';
const NON_LINKED_OBJECT_COLOUR = '#3388ff';
const EDITOR_TEXT_CLASSNAME = 'campaign-map-editor-label';

const UNASSIGNED_HEX_STROKE_COLOUR = '#888';
const UNASSIGNED_HEX_STROKE_OPACITY = 0.3;
const UNASSIGNED_HEX_FILL_COLOUR = '#888';
const UNASSIGNED_HEX_FILL_OPACITY = 0;

const DEFAULT_MAP_IMAGES = [
  'https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/campaigns/map/default-maps/ash-wastes-cinderak-burning.png',
  'https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/campaigns/map/default-maps/underhive-sector-01_web.webp',
];

interface Gang {
  id: string;
  name: string;
  gang_type: string;
  gang_colour: string;
}

interface Territory {
  id: string;
  territory_name: string;
  playing_card?: string | null;
  gang_id: string | null;
  map_object_id?: string | null;
  map_hex_coords?: { x: number; y: number; z: number } | null;
  show_name_on_map?: boolean;
}

interface MapData {
  id: string;
  campaign_id: string;
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

interface LocalMapObject {
  id?: string;
  tempId: string;
  object_type: string;
  geometry: Record<string, unknown>;
  properties: Record<string, unknown>;
  layer?: L.Layer;
}

interface TerritoryAssociation {
  territoryId: string;
  mapObjectTempId?: string | null;
  mapHexCoords?: HexCoord | null;
  showNameOnMap: boolean;
}

interface CampaignMapEditorModalProps {
  campaignId: string;
  mapData: MapData | null;
  mapObjects: MapObject[];
  territories: Territory[];
  allGangs: Gang[];
  onClose: () => void;
  onSave: () => void;
}

type EditorStep = 'image' | 'editor';

const MarkerPaletteButton = React.memo(function MarkerPaletteButton({
  iconKey,
  label,
  html,
  isActive,
  onToggle,
}: {
  iconKey: string;
  label: string;
  html: string;
  isActive: boolean;
  onToggle: (key: string) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = html;
  }, [html]);

  return (
    <button
      ref={ref}
      type="button"
      title={label}
      onClick={() => onToggle(iconKey)}
      className={`w-8 h-8 flex items-center justify-center rounded border-2 transition-colors ${
        isActive
          ? 'border-foreground bg-foreground/10'
          : 'border-transparent hover:border-muted-foreground/50'
      }`}
    />
  );
});

export default function CampaignMapEditorModal({
  campaignId,
  mapData,
  mapObjects,
  territories,
  allGangs,
  onClose,
  onSave,
}: CampaignMapEditorModalProps) {
  const isEditing = !!mapData;

  // Step management: skip to editor if already has a map
  const [step, setStep] = useState<EditorStep>(isEditing ? 'editor' : 'image');
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>(mapData?.background_image_url ?? '');
  const [hexGridEnabled, setHexGridEnabled] = useState(mapData?.hex_grid_enabled ?? false);
  const [hexSize, setHexSize] = useState(mapData?.hex_size ?? 50);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Local map objects state
  const [localObjects, setLocalObjects] = useState<LocalMapObject[]>(
    () => mapObjects.map(object => ({ ...object, tempId: object.id }))
  );
  const [deletedObjectIds, setDeletedObjectIds] = useState<string[]>([]);

  // Territory associations
  const [associations, setAssociations] = useState<TerritoryAssociation[]>(
    territories.map(t => ({
      territoryId: t.id,
      mapObjectTempId: t.map_object_id ?? null,
      mapHexCoords: t.map_hex_coords as HexCoord | null,
      showNameOnMap: t.show_name_on_map ?? true,
    }))
  );

  // Leaflet map ref for the editor
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorMapRef = useRef<L.Map | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [selectedObjectTempId, setSelectedObjectTempId] = useState<string | null>(null);
  const [selectedHexCoord, setSelectedHexCoord] = useState<HexCoord | null>(null);
  const [selectedMarkerIcon, setSelectedMarkerIcon] = useState<string>(DEFAULT_MARKER_ICON);
  const [placingMarker, setPlacingMarker] = useState(false);

  // Refs for visual highlighting (linked + selected states)
  const hexLayersRef = useRef<Map<string, L.Polygon>>(new Map());
  const styledObjectRingsRef = useRef<Map<string, L.Layer>>(new Map());
  const objectLayersRef = useRef<Map<string, L.Layer>>(new Map());
  const placingMarkerRef = useRef(false);
  const selectedMarkerIconRef = useRef(DEFAULT_MARKER_ICON);
  const markerColourRef = useRef<Map<string, string>>(new Map());
  const hexCentresRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const territoryNameLayersRef = useRef<Map<string, L.Tooltip>>(new Map());

  // Handle custom image upload with original dimensions preserved
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      toast.error(validation.error ?? 'Invalid file');
      return;
    }

    setIsUploading(true);
    try {
      // Process file (handles HEIC conversion)
      const processedFile = await processImageFile(file);

      // Read file as data URL to get dimensions and for processing
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(processedFile);
      });

      // Load image to get original dimensions
      const img = await createImage(dataUrl);
      const originalWidth = img.naturalWidth;
      const originalHeight = img.naturalHeight;

      // Compress image to target size (800KB) maintaining original dimensions
      const compressedBlob = await compressImage(
        await (await fetch(dataUrl)).blob(),
        800 * 1024, // target 800KB
        originalWidth,
        originalHeight
      );

      // Upload to Supabase Storage (subfolder path for campaign maps)
      const supabase = createClient();
      const timestamp = Date.now();
      const fileName = `map_${campaignId}_${timestamp}.webp`;
      const filePath = `campaigns/${campaignId}/map/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('users-images')
        .upload(filePath, compressedBlob, {
          contentType: 'image/webp',
          cacheControl: 'no-cache',
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Clean up old map images for this campaign
      const { data: existingFiles } = await supabase.storage
        .from('users-images')
        .list(`campaigns/${campaignId}/map/`);

      if (existingFiles) {
        const filesToRemove = existingFiles
          .filter(f => f.name.startsWith(`map_${campaignId}_`) && f.name !== fileName)
          .map(f => `campaigns/${campaignId}/map/${f.name}`);

        if (filesToRemove.length > 0) {
          await supabase.storage.from('users-images').remove(filesToRemove);
        }
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('users-images')
        .getPublicUrl(filePath);

      setSelectedImageUrl(urlData.publicUrl);
      toast.success('Map image uploaded successfully');
    } catch (error) {
      console.error('Error uploading map image:', error);
      toast.error('Failed to upload image', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [campaignId]);

  // Initialise the Leaflet editor when step is 'editor'
  useEffect(() => {
    if (step !== 'editor' || !editorContainerRef.current || !selectedImageUrl) return;

    if (editorMapRef.current) {
      editorMapRef.current.remove();
      editorMapRef.current = null;
    }

    let aborted = false;
    let cleanupKeyDown: (() => void) | null = null;

    const img = new window.Image();
    img.onload = () => {
      if (aborted || !editorContainerRef.current) return;

      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const bounds: L.LatLngBoundsExpression = [[0, 0], [h, w]];

      const map = L.map(editorContainerRef.current, {
        crs: L.CRS.Simple,
        minZoom: -3,
        maxZoom: 4,
        zoomSnap: 0.25,
        attributionControl: false,
      });

      L.imageOverlay(selectedImageUrl, bounds).addTo(map);
      map.fitBounds(bounds);

      // Draw hex grid overlay – interactive in the editor so hexes can be
      // selected and associated with territories.
      hexLayersRef.current.clear();
      hexCentresRef.current.clear();
      if (hexGridEnabled && hexSize > 0) {
        const hexes = generateHexGrid(w, h, hexSize);
        const hexGroup = L.featureGroup().addTo(map);
        hexes.forEach(({ coord, centre }) => {
          hexCentresRef.current.set(hexKey(coord), centre);
          const corners = getHexCornersLatLng(centre, hexSize);
          const poly = L.polygon(corners, {
            color: UNASSIGNED_HEX_STROKE_COLOUR,
            weight: 1,
            opacity: UNASSIGNED_HEX_STROKE_OPACITY,
            fillColor: UNASSIGNED_HEX_FILL_COLOUR,
            fillOpacity: UNASSIGNED_HEX_FILL_OPACITY,
            interactive: true,
            pmIgnore: true,
          }).addTo(hexGroup);

          hexLayersRef.current.set(hexKey(coord), poly);

          poly.on('click', (evt: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(evt);
            layerClickedRecently = true;
            setSelectedObjectTempId(null);
            setSelectedHexCoord(coord);
            setTimeout(() => { layerClickedRecently = false; }, 50);
          });
        });
      }

      // Initialise Geoman for drawing
      map.pm.setGlobalOptions({
        textOptions: {
          text: 'Text',
          focusAfterDraw: true,
          removeIfEmpty: false,
          className: EDITOR_TEXT_CLASSNAME,
        },
      });

      map.pm.addControls({
        position: 'topleft',
        drawMarker: false,
        drawPolyline: true,
        drawPolygon: true,
        drawCircle: true,
        drawText: true,
        editMode: true,
        dragMode: true,
        removalMode: true,
        drawRectangle: false,
        drawCircleMarker: false,
        cutPolygon: false,
        rotateMode: false,
      });

      // When Geoman enters draw mode, disable pointer events on hex polygons
      // and existing shapes so clicks pass through to the drawing handler.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on('pm:globaldrawmodetoggled', (e: any) => {
        const isDrawing = e.enabled as boolean;

        if (isDrawing && placingMarkerRef.current) {
          placingMarkerRef.current = false;
          setPlacingMarker(false);
          map.getContainer().style.cursor = '';
        }

        hexLayersRef.current.forEach((poly) => {
          const el = poly.getElement() as HTMLElement | undefined;
          if (el) el.style.pointerEvents = isDrawing ? 'none' : '';
        });

        map.eachLayer((layer) => {
          if ((layer as L.Layer & { options: Record<string, unknown> }).options?.objectTempId) {
            const el = (layer as L.Marker | L.Path).getElement?.() as HTMLElement | undefined;
            if (el) el.style.pointerEvents = isDrawing ? 'none' : '';
          }
        });
      });

      // Track whether a layer click just happened so the map click
      // handler can skip deselection (Leaflet fires both events).
      let layerClickedRecently = false;

      function attachLayerClickHandler(layer: L.Layer, tempId: string) {
        layer.on('click', (evt: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(evt);
          layerClickedRecently = true;
          setSelectedObjectTempId(tempId);
          setSelectedHexCoord(null);
          setTimeout(() => { layerClickedRecently = false; }, 50);
        });

        // For text layers, allow direct text editing after creation/restoration.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        layer.on('dblclick', (evt: any) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const marker = layer as any;
          if (typeof marker?.pm?.getText !== 'function') return;

          L.DomEvent.stop(evt);
          try {
            if (!marker.pm.enabled?.()) {
              marker.pm.enable();
            }
            marker.pm.focus?.();
          } catch {
            // No-op: if Geoman can't enable text edit for this layer, keep map stable.
          }
        });
      }

      function attachDragEndHandler(layer: L.Layer, tempId: string) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        layer.on('pm:dragend' as any, () => {
          setLocalObjects(prev => prev.map(obj => {
            if (obj.tempId !== tempId) return obj;
            let geometry = obj.geometry;

            if (layer instanceof L.Marker) {
              const ll = layer.getLatLng();
              geometry = { latlng: [ll.lat, ll.lng] };
            } else if (layer instanceof L.Circle) {
              geometry = { latlng: [layer.getLatLng().lat, layer.getLatLng().lng], radius: layer.getRadius() };
            } else if (layer instanceof L.Polygon) {
              const latlngs = (layer.getLatLngs()[0] as L.LatLng[]);
              geometry = { latlngs: latlngs.map(ll => [ll.lat, ll.lng]) };
            } else if (layer instanceof L.Polyline) {
              const latlngs = layer.getLatLngs() as L.LatLng[];
              geometry = { latlngs: latlngs.map(ll => [ll.lat, ll.lng]) };
            }

            return { ...obj, geometry };
          }));
        });
      }

      function attachTextChangeHandler(layer: L.Layer, tempId: string) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        layer.on('pm:textchange', (evt: any) => {
          const nextText = typeof evt?.text === 'string' ? evt.text : 'Text';
          setLocalObjects(prev => prev.map(obj => (
            obj.tempId === tempId
              ? { ...obj, properties: { ...obj.properties, text: nextText } }
              : obj
          )));
        });
      }

      function applyTextLayerVisualStyle(layer: L.Layer) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const marker = layer as any;
        if (typeof marker?.pm?.getText !== 'function') return;
        const textArea = marker.pm?.textArea as HTMLTextAreaElement | undefined;
        if (!textArea) return;
        textArea.classList.add(EDITOR_TEXT_CLASSNAME);
      }

      function attachTextStyleHandlers(layer: L.Layer) {
        applyTextLayerVisualStyle(layer);
        layer.on('add', () => applyTextLayerVisualStyle(layer));
        // Keep styling consistent while switching between focused and blurred states.
        layer.on('pm:textfocus', () => applyTextLayerVisualStyle(layer));
        layer.on('pm:textblur', () => applyTextLayerVisualStyle(layer));
      }

      // Restore existing objects onto the map
      objectLayersRef.current.clear();
      const linkedObjectIdsInit = new Set(
        associations.filter(a => a.mapObjectTempId).map(a => a.mapObjectTempId!)
      );

      localObjects.forEach(obj => {
        let layer: L.Layer | null = null;
        const isLinked = linkedObjectIdsInit.has(obj.tempId);
        const pathStyle = {
          color: isLinked ? LINKED_COLOUR : NON_LINKED_OBJECT_COLOUR,
          weight: 3,
          opacity: isLinked ? 0.7 : 1,
          fillColor: isLinked ? LINKED_COLOUR : NON_LINKED_OBJECT_COLOUR,
          fillOpacity: 0.2,
        };

        switch (obj.object_type) {
          case 'landmark': {
            const geo = obj.geometry as { latlng: [number, number] };
            const iconName = (obj.properties as Record<string, unknown>).icon as string ?? DEFAULT_MARKER_ICON;
            const markerDef = MARKER_ICONS[iconName] ?? MARKER_ICONS[DEFAULT_MARKER_ICON];
            const icon = L.divIcon({
              html: markerDef.html(isLinked ? LINKED_COLOUR : NON_LINKED_OBJECT_COLOUR),
              className: 'campaign-map-div-icon',
              iconSize: markerDef.iconSize,
              iconAnchor: markerDef.iconAnchor,
            });
            layer = L.marker(geo.latlng, { icon }).addTo(map);
            break;
          }
          case 'route': {
            const geo = obj.geometry as { latlngs: [number, number][] };
            const dashArray = (() => {
              const ls = (obj.properties as Record<string, unknown>).lineStyle;
              if (ls === 'dashed') return '12, 8';
              if (ls === 'dotted') return '4, 6';
              return undefined;
            })();
            layer = L.polyline(geo.latlngs, { ...pathStyle, dashArray }).addTo(map);
            break;
          }
          case 'area_polygon': {
            const geo = obj.geometry as { latlngs: [number, number][] };
            layer = L.polygon(geo.latlngs, pathStyle).addTo(map);
            break;
          }
          case 'area_circle': {
            const geo = obj.geometry as { latlng: [number, number]; radius: number };
            layer = L.circle(geo.latlng, { radius: geo.radius, ...pathStyle }).addTo(map);
            break;
          }
          case 'label': {
            const geo = obj.geometry as { latlng: [number, number] };
            const text = (obj.properties as Record<string, unknown>).text as string ?? 'Text';
            layer = L.marker(geo.latlng, {
              // Geoman recognises these options and initialises a text marker.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              textMarker: true as any,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              text: text as any,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              className: EDITOR_TEXT_CLASSNAME as any,
            } as L.MarkerOptions).addTo(map);
            break;
          }
        }

        if (layer) {
          (layer as L.Layer & { options: Record<string, unknown> }).options.objectTempId = obj.tempId;
          objectLayersRef.current.set(obj.tempId, layer);
          attachLayerClickHandler(layer, obj.tempId);
          attachDragEndHandler(layer, obj.tempId);
          if (obj.object_type === 'label') {
            attachTextChangeHandler(layer, obj.tempId);
            attachTextStyleHandlers(layer);
          }
        }
      });

      // Listen for new shapes created via Geoman
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on('pm:create', (e: any) => {
        const layer = e.layer as L.Layer;
        const tempId = crypto.randomUUID();
        (layer as L.Layer & { options: Record<string, unknown> }).options.objectTempId = tempId;

        let object_type = 'landmark';
        let geometry: Record<string, unknown> = {};
        const properties: Record<string, unknown> = {};

        const shape = e.shape as string;

        if (shape === 'Marker') {
          object_type = 'landmark';
          const ll = (layer as L.Marker).getLatLng();
          geometry = { latlng: [ll.lat, ll.lng] };
          properties.icon = 'pin';
        } else if (shape === 'Line') {
          object_type = 'route';
          const latlngs = (layer as L.Polyline).getLatLngs() as L.LatLng[];
          geometry = { latlngs: latlngs.map(ll => [ll.lat, ll.lng]) };
          properties.strokeWidth = 3;
          properties.lineStyle = 'full';
        } else if (shape === 'Polygon') {
          object_type = 'area_polygon';
          const latlngs = ((layer as L.Polygon).getLatLngs()[0] as L.LatLng[]);
          geometry = { latlngs: latlngs.map(ll => [ll.lat, ll.lng]) };
          properties.fillOpacity = 0.3;
        } else if (shape === 'Circle') {
          object_type = 'area_circle';
          const c = (layer as L.Circle);
          geometry = { latlng: [c.getLatLng().lat, c.getLatLng().lng], radius: c.getRadius() };
          properties.fillOpacity = 0.3;
        } else if (shape === 'Text') {
          object_type = 'label';
          const textLayer = layer as L.Marker;
          const ll = textLayer.getLatLng();
          geometry = { latlng: [ll.lat, ll.lng] };
          // Geoman creates a text marker that users can edit directly after placing it.
          const textContent = (layer as any).pm?.getText?.() || 'Text';
          properties.text = textContent;
          properties.fontSize = 14;

          objectLayersRef.current.set(tempId, textLayer);
          attachLayerClickHandler(textLayer, tempId);
          attachDragEndHandler(textLayer, tempId);
          attachTextChangeHandler(textLayer, tempId);
          attachTextStyleHandlers(textLayer);
          setLocalObjects(prev => [...prev, { tempId, object_type, geometry, properties, layer: textLayer }]);
          setSelectedObjectTempId(tempId);
          return;
        }

        objectLayersRef.current.set(tempId, layer);
        attachLayerClickHandler(layer, tempId);
        attachDragEndHandler(layer, tempId);
        setLocalObjects(prev => [...prev, { tempId, object_type, geometry, properties, layer }]);
        setSelectedObjectTempId(tempId);
      });

      // Listen for edits
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on('pm:edit' as any, (e: any) => {
        const layer = e.layer as L.Layer;
        const tempId = (layer as L.Layer & { options: Record<string, unknown> }).options.objectTempId as string;
        if (!tempId) return;

        setLocalObjects(prev => prev.map(obj => {
          if (obj.tempId !== tempId) return obj;
          let geometry = obj.geometry;

          if (layer instanceof L.Marker) {
            const ll = layer.getLatLng();
            geometry = { latlng: [ll.lat, ll.lng] };
          } else if (layer instanceof L.Circle) {
            geometry = { latlng: [layer.getLatLng().lat, layer.getLatLng().lng], radius: layer.getRadius() };
          } else if (layer instanceof L.Polygon) {
            const latlngs = (layer.getLatLngs()[0] as L.LatLng[]);
            geometry = { latlngs: latlngs.map(ll => [ll.lat, ll.lng]) };
          } else if (layer instanceof L.Polyline) {
            const latlngs = layer.getLatLngs() as L.LatLng[];
            geometry = { latlngs: latlngs.map(ll => [ll.lat, ll.lng]) };
          }

          return { ...obj, geometry };
        }));
      });

      // Listen for removals
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on('pm:remove', (e: any) => {
        const tempId = (e.layer as L.Layer & { options: Record<string, unknown> }).options.objectTempId as string;
        if (!tempId) return;

        objectLayersRef.current.delete(tempId);
        setLocalObjects(prev => {
          const obj = prev.find(o => o.tempId === tempId);
          if (obj?.id) setDeletedObjectIds(d => [...d, obj.id!]);
          return prev.filter(o => o.tempId !== tempId);
        });

        // Clear any associations to this object
        setAssociations(prev => prev.map(a =>
          a.mapObjectTempId === tempId ? { ...a, mapObjectTempId: null } : a
        ));

        setSelectedObjectTempId(prev => prev === tempId ? null : prev);
      });

      // Click on map background: either place a marker (if in placement
      // mode) or deselect the current selection.
      map.on('click', (evt: L.LeafletMouseEvent) => {
        if (placingMarkerRef.current) {
          const iconKey = selectedMarkerIconRef.current;
          const markerDef = MARKER_ICONS[iconKey] ?? MARKER_ICONS[DEFAULT_MARKER_ICON];
          const tempId = crypto.randomUUID();
          const latlng: [number, number] = [evt.latlng.lat, evt.latlng.lng];

          const icon = L.divIcon({
            html: markerDef.html(NON_LINKED_OBJECT_COLOUR),
            className: 'campaign-map-div-icon',
            iconSize: markerDef.iconSize,
            iconAnchor: markerDef.iconAnchor,
          });
          const marker = L.marker(latlng, { icon }).addTo(map);
          (marker as unknown as { options: Record<string, unknown> }).options.objectTempId = tempId;
          objectLayersRef.current.set(tempId, marker);
          attachLayerClickHandler(marker, tempId);
          attachDragEndHandler(marker, tempId);

          setLocalObjects(prev => [...prev, {
            tempId,
            object_type: 'landmark',
            geometry: { latlng },
            properties: { icon: iconKey },
            layer: marker,
          }]);
          setSelectedObjectTempId(tempId);

          placingMarkerRef.current = false;
          setPlacingMarker(false);
          map.getContainer().style.cursor = '';

          hexLayersRef.current.forEach((poly) => {
            const el = poly.getElement() as HTMLElement | undefined;
            if (el) el.style.pointerEvents = '';
          });
          map.eachLayer((l) => {
            if ((l as L.Layer & { options: Record<string, unknown> }).options?.objectTempId) {
              const el = (l as L.Marker | L.Path).getElement?.() as HTMLElement | undefined;
              if (el) el.style.pointerEvents = '';
            }
          });
          return;
        }

        if (!layerClickedRecently) {
          setSelectedObjectTempId(null);
          setSelectedHexCoord(null);
        }
      });

      // Escape key cancels marker placement mode
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && placingMarkerRef.current) {
          placingMarkerRef.current = false;
          setPlacingMarker(false);
          if (editorMapRef.current) {
            editorMapRef.current.getContainer().style.cursor = '';
          }
          hexLayersRef.current.forEach((poly) => {
            const el = poly.getElement() as HTMLElement | undefined;
            if (el) el.style.pointerEvents = '';
          });
          map.eachLayer((l) => {
            if ((l as L.Layer & { options: Record<string, unknown> }).options?.objectTempId) {
              const el = (l as L.Marker | L.Path).getElement?.() as HTMLElement | undefined;
              if (el) el.style.pointerEvents = '';
            }
          });
        }
      };
      document.addEventListener('keydown', handleKeyDown);
      cleanupKeyDown = () => document.removeEventListener('keydown', handleKeyDown);

      editorMapRef.current = map;
      setEditorReady(true);
    };
    img.src = selectedImageUrl;

    return () => {
      aborted = true;
      cleanupKeyDown?.();
      if (editorMapRef.current) {
        editorMapRef.current.remove();
        editorMapRef.current = null;
      }
      hexLayersRef.current.clear();
      hexCentresRef.current.clear();
      objectLayersRef.current.clear();
      styledObjectRingsRef.current.clear();
      territoryNameLayersRef.current.clear();
      setEditorReady(false);
    };
  }, [step, selectedImageUrl, hexGridEnabled, hexSize]);

  // Visual styling: linked territories shown in green, selected item in highlight colour.
  // Runs whenever selection or associations change, restyling all hexes and affected objects.
  useEffect(() => {
    const map = editorMapRef.current;
    if (!map || !editorReady) return;

    // Build lookup sets from current associations
    const linkedHexKeys = new Set<string>();
    const linkedObjectIds = new Set<string>();
    associations.forEach(a => {
      if (a.mapHexCoords) linkedHexKeys.add(hexKey(a.mapHexCoords));
      if (a.mapObjectTempId) linkedObjectIds.add(a.mapObjectTempId);
    });

    const selectedHexKey = selectedHexCoord ? hexKey(selectedHexCoord) : null;

    // --- Hex styling (iterate all hexes) ---
    hexLayersRef.current.forEach((poly, key) => {
      if (key === selectedHexKey) {
        poly.setStyle({ color: HIGHLIGHT_COLOUR, weight: 3, opacity: 0.9, fillColor: HIGHLIGHT_COLOUR, fillOpacity: 0.25 });
      } else if (linkedHexKeys.has(key)) {
        poly.setStyle({ color: LINKED_COLOUR, weight: 2, opacity: 0.7, fillColor: LINKED_COLOUR, fillOpacity: 0.2 });
      } else {
        poly.setStyle({ color: UNASSIGNED_HEX_STROKE_COLOUR, weight: 1, opacity: UNASSIGNED_HEX_STROKE_OPACITY, fillColor: UNASSIGNED_HEX_FILL_COLOUR, fillOpacity: UNASSIGNED_HEX_FILL_OPACITY });
      }
    });

    // --- Object styling: remove previous marker rings ---
    styledObjectRingsRef.current.forEach(ring => map.removeLayer(ring));
    styledObjectRingsRef.current.clear();

    // --- Object styling: set every object's full style explicitly ---
    localObjects.forEach(obj => {
      const layer = objectLayersRef.current.get(obj.tempId);
      if (!layer) return;

      const isSelected = obj.tempId === selectedObjectTempId;
      const isLinked = linkedObjectIds.has(obj.tempId);

      if (layer instanceof L.Path) {
        // Preserve dashArray for routes
        const isRoute = obj.object_type === 'route';
        const dashArray = isRoute
          ? (() => {
              const ls = (obj.properties as Record<string, unknown>).lineStyle as string;
              if (ls === 'dashed') return '12, 8';
              if (ls === 'dotted') return '4, 6';
              return undefined;
            })()
          : undefined;
        if (isSelected) {
          layer.setStyle({ color: HIGHLIGHT_COLOUR, weight: 4, opacity: 0.9, fillColor: HIGHLIGHT_COLOUR, fillOpacity: 0.25, dashArray });
        } else if (isLinked) {
          layer.setStyle({ color: LINKED_COLOUR, weight: 3, opacity: 0.7, fillColor: LINKED_COLOUR, fillOpacity: 0.2, dashArray });
        } else {
          layer.setStyle({ color: NON_LINKED_OBJECT_COLOUR, weight: 3, opacity: 1, fillColor: NON_LINKED_OBJECT_COLOUR, fillOpacity: 0.2, dashArray });
        }
      } else if (obj.object_type === 'landmark' && layer instanceof L.Marker) {
        const colour = isSelected ? HIGHLIGHT_COLOUR : isLinked ? LINKED_COLOUR : NON_LINKED_OBJECT_COLOUR;
        if (markerColourRef.current.get(obj.tempId) !== colour) {
          markerColourRef.current.set(obj.tempId, colour);
          const iconName = (obj.properties as Record<string, unknown>).icon as string ?? DEFAULT_MARKER_ICON;
          const markerDef = MARKER_ICONS[iconName] ?? MARKER_ICONS[DEFAULT_MARKER_ICON];
          const icon = L.divIcon({
            html: markerDef.html(colour),
            className: 'campaign-map-div-icon',
            iconSize: markerDef.iconSize,
            iconAnchor: markerDef.iconAnchor,
          });
          layer.setIcon(icon);
        }
        } else if (obj.object_type === 'label' && layer instanceof L.Marker) {
          const colour = isSelected ? HIGHLIGHT_COLOUR : isLinked ? LINKED_COLOUR : NON_LINKED_OBJECT_COLOUR;
          // Geoman text markers store their editable textarea on `layer.pm.textArea`.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const marker = layer as any;
          const textArea = marker.pm?.textArea as HTMLTextAreaElement | undefined;
          if (textArea) {
            // Only colour the text itself; keep Geoman focus background/border styling intact.
            textArea.style.color = colour;
          }
      }
    });
  }, [selectedObjectTempId, selectedHexCoord, editorReady, localObjects, associations]);

  // Territory name labels on the map (mirrors the canvas rendering)
  useEffect(() => {
    const map = editorMapRef.current;
    if (!map || !editorReady) return;

    territoryNameLayersRef.current.forEach(tooltip => map.removeLayer(tooltip));
    territoryNameLayersRef.current.clear();

    associations.forEach(assoc => {
      if (!assoc.showNameOnMap) return;

      const territory = territories.find(t => t.id === assoc.territoryId);
      if (!territory) return;

      let position: L.LatLngExpression | null = null;
      let direction: L.Direction = 'center';
      let offset = L.point(0, 0);

      if (assoc.mapObjectTempId) {
        const obj = localObjects.find(o => o.tempId === assoc.mapObjectTempId);
        if (!obj) return;

        switch (obj.object_type) {
          case 'landmark': {
            const geo = obj.geometry as { latlng: [number, number] };
            const iconName = (obj.properties as Record<string, unknown>).icon as string ?? DEFAULT_MARKER_ICON;
            const markerDef = MARKER_ICONS[iconName] ?? MARKER_ICONS[DEFAULT_MARKER_ICON];
            position = geo.latlng;
            direction = 'bottom';
            const isReactIcon = markerDef.isReactIcon ?? false;
            offset = L.point(0, isReactIcon ? 6 : 10);
            break;
          }
          case 'route': {
            const geo = obj.geometry as { latlngs: [number, number][] };
            if (geo.latlngs.length >= 2) {
              const midIdx = Math.floor(geo.latlngs.length / 2);
              position = geo.latlngs[midIdx];
              direction = 'top';
              offset = L.point(0, -8);
            }
            break;
          }
          case 'area_polygon': {
            const layer = objectLayersRef.current.get(obj.tempId);
            if (layer && layer instanceof L.Polygon) {
              position = layer.getBounds().getCenter();
            }
            break;
          }
          case 'area_circle': {
            const geo = obj.geometry as { latlng: [number, number] };
            position = geo.latlng;
            break;
          }
          case 'label': {
            const geo = obj.geometry as { latlng: [number, number] };
            position = geo.latlng;
            direction = 'bottom';
            const props = obj.properties as Record<string, unknown>;
            const text = (props.text as string) ?? '';
            const fontSize = typeof props.fontSize === 'number' ? props.fontSize : 14;
            const lineCount = text.split(/\r?\n/).length;
            const lineHeightPx = fontSize;
            offset = L.point(0, (Math.max(1, lineCount) - 1) * (lineHeightPx / 2));
            break;
          }
        }
      } else if (assoc.mapHexCoords) {
        const key = hexKey(assoc.mapHexCoords);
        const centre = hexCentresRef.current.get(key);
        if (centre) {
          position = L.latLng(centre.y, centre.x);
        }
      }

      if (position) {
        const tooltip = L.tooltip({
          permanent: true,
          direction,
          offset,
          className: 'campaign-map-territory-name',
        })
          .setContent(territory.territory_name)
          .setLatLng(position)
          .addTo(map);

        territoryNameLayersRef.current.set(assoc.territoryId, tooltip);
      }
    });
  }, [editorReady, associations, territories, localObjects]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!selectedImageUrl) {
      toast.error('Please select a background image');
      return false;
    }

    setIsSaving(true);
    try {
      // Create or update the map
      if (isEditing) {
        const result = await updateCampaignMap({
          campaignId,
          backgroundImageUrl: selectedImageUrl,
          hexGridEnabled,
          hexSize,
        });
        if (!result.success) {
          toast.error(result.error ?? 'Failed to update map');
          return false;
        }
      } else {
        const result = await createCampaignMap({
          campaignId,
          backgroundImageUrl: selectedImageUrl,
          hexGridEnabled,
          hexSize,
        });
        if (!result.success) {
          toast.error(result.error ?? 'Failed to create map');
          return false;
        }
      }

      if (deletedObjectIds.length > 0) {
        const deleteResult = await bulkDeleteMapObjects({
          campaignId,
          objectIds: deletedObjectIds,
        });
        if (!deleteResult.success) {
          toast.error(deleteResult.error ?? 'Failed to delete map objects');
          return false;
        }
      }

      // Build a temp-to-real ID map (existing objects already have stable IDs)
      const tempToRealId = new Map<string, string>();
      localObjects.filter(o => o.id).forEach(o => {
        tempToRealId.set(o.tempId, o.id!);
      });

      // Upsert objects and resolve new IDs via the explicit tempId mapping
      // returned by the server (avoids relying on positional indexing).
      if (localObjects.length > 0) {
        const result = await upsertMapObjects({
          campaignId,
          objects: localObjects.map(o => ({
            id: o.id,
            tempId: o.tempId,
            object_type: o.object_type,
            geometry: o.geometry,
            properties: o.properties,
          })),
        });
        if (!result.success) {
          toast.error(result.error ?? 'Failed to save map objects');
          return false;
        }

        const tempIdToId = result.tempIdToId ?? {};
        Object.entries(tempIdToId).forEach(([tempId, realId]) => {
          tempToRealId.set(tempId, realId);
        });
      }

      // Save territory associations, resolving temp IDs to real DB IDs
      const changedAssociations = associations.filter(a => {
        const original = territories.find(t => t.id === a.territoryId);
        if (!original) return false;
        const resolvedId = a.mapObjectTempId ? (tempToRealId.get(a.mapObjectTempId) ?? a.mapObjectTempId) : null;
        return (
          resolvedId !== (original.map_object_id ?? null) ||
          JSON.stringify(a.mapHexCoords) !== JSON.stringify(original.map_hex_coords ?? null) ||
          a.showNameOnMap !== (original.show_name_on_map ?? true)
        );
      });

      if (changedAssociations.length > 0) {
        const result = await bulkUpdateTerritoryMapAssociations({
          campaignId,
          associations: changedAssociations.map(a => ({
            territoryId: a.territoryId,
            mapObjectId: a.mapObjectTempId ? (tempToRealId.get(a.mapObjectTempId) ?? a.mapObjectTempId) : null,
            mapHexCoords: a.mapHexCoords,
            showNameOnMap: a.showNameOnMap,
          })),
        });
        if (!result.success) {
          toast.error(result.error ?? 'Failed to save territory associations');
          return false;
        }
      }

      toast.success(isEditing ? 'Map updated' : 'Map created');
      onSave();
      return true;
    } catch {
      toast.error('Failed to save map');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [
    selectedImageUrl, isEditing, campaignId, hexGridEnabled, hexSize,
    deletedObjectIds, localObjects, associations, territories, onSave,
  ]);

  const handleDeleteMap = useCallback(async () => {
    try {
      setIsDeleting(true);

      const result = await deleteCampaignMap({ campaignId });

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete map');
      }

      toast.success('Map successfully deleted.');

      onSave(); // Trigger parent refresh
      onClose();
    } catch (error) {
      console.error('Error deleting map:', error);

      const message = error instanceof Error
        ? error.message
        : 'An unexpected error occurred. Please try again.';

      toast.error('Error', { description: message });
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
      setDeleteConfirmText('');
    }
  }, [campaignId, onClose, onSave]);

  const paletteItems = useMemo(
    () => MARKER_ICON_KEYS.map(key => ({
      key,
      label: MARKER_ICONS[key].label,
      html: MARKER_ICONS[key].html('#888888'),
    })),
    []
  );

  const setLayerPointerEvents = useCallback((disabled: boolean) => {
    const map = editorMapRef.current;
    if (!map) return;
    const value = disabled ? 'none' : '';

    hexLayersRef.current.forEach((poly) => {
      const el = poly.getElement() as HTMLElement | undefined;
      if (el) el.style.pointerEvents = value;
    });

    map.eachLayer((layer) => {
      if ((layer as L.Layer & { options: Record<string, unknown> }).options?.objectTempId) {
        const el = (layer as L.Marker | L.Path).getElement?.() as HTMLElement | undefined;
        if (el) el.style.pointerEvents = value;
      }
    });
  }, []);

  const startPlacingMarker = useCallback((iconKey: string) => {
    const map = editorMapRef.current;
    if (!map) return;

    setSelectedMarkerIcon(iconKey);
    selectedMarkerIconRef.current = iconKey;
    placingMarkerRef.current = true;
    setPlacingMarker(true);
    map.getContainer().style.cursor = 'crosshair';
    setLayerPointerEvents(true);
  }, [setLayerPointerEvents]);

  const cancelPlacingMarker = useCallback(() => {
    placingMarkerRef.current = false;
    setPlacingMarker(false);
    if (editorMapRef.current) {
      editorMapRef.current.getContainer().style.cursor = '';
    }
    setLayerPointerEvents(false);
  }, [setLayerPointerEvents]);

  const togglePlacingMarker = useCallback((key: string) => {
    if (placingMarkerRef.current && selectedMarkerIconRef.current === key) {
      cancelPlacingMarker();
    } else {
      startPlacingMarker(key);
    }
  }, [startPlacingMarker, cancelPlacingMarker]);

  const hasSelection = !!(selectedObjectTempId || selectedHexCoord);

  // Territory association panel
  const handleAssociateTerritory = useCallback((territoryId: string) => {
    if (selectedObjectTempId) {
      setAssociations(prev => prev.map(a =>
        a.territoryId === territoryId
          ? { ...a, mapObjectTempId: selectedObjectTempId, mapHexCoords: null }
          : a
      ));
      toast.success('Territory associated with shape');
    } else if (selectedHexCoord) {
      setAssociations(prev => prev.map(a =>
        a.territoryId === territoryId
          ? { ...a, mapObjectTempId: null, mapHexCoords: selectedHexCoord }
          : a
      ));
      toast.success('Territory associated with hex');
    }
  }, [selectedObjectTempId, selectedHexCoord]);

  const handleToggleShowName = useCallback((territoryId: string) => {
    setAssociations(prev => prev.map(a =>
      a.territoryId === territoryId ? { ...a, showNameOnMap: !a.showNameOnMap } : a
    ));
  }, []);

  const handleClearAssociation = useCallback((territoryId: string) => {
    setAssociations(prev => prev.map(a =>
      a.territoryId === territoryId ? { ...a, mapObjectTempId: null, mapHexCoords: null } : a
    ));
  }, []);

  const handleUpdateLineStyle = useCallback((tempId: string, lineStyle: 'full' | 'dashed' | 'dotted') => {
    setLocalObjects(prev => prev.map(obj => {
      if (obj.tempId !== tempId) return obj;
      return { ...obj, properties: { ...obj.properties, lineStyle } };
    }));

    // Update the layer style immediately
    const layer = objectLayersRef.current.get(tempId);
    if (layer && layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
      const dashArray = lineStyle === 'dashed' ? '12, 8' : lineStyle === 'dotted' ? '4, 6' : undefined;
      layer.setStyle({ dashArray });
    }
  }, []);

  // Image selection step
  if (step === 'image') {
    return (
      <>
      <Modal
        title={isEditing ? 'Edit Map Image' : 'Create Campaign Map'}
        helper="Choose a default image or upload your own"
        onClose={onClose}
        onConfirm={async () => {
          if (!selectedImageUrl) {
            toast.error('Please select an image');
            return false;
          }
          setStep('editor');
          return false; // Don't close modal
        }}
        confirmText="Next"
        confirmDisabled={!selectedImageUrl}
        onDelete={isEditing ? () => setShowDeleteModal(true) : undefined}
        deleteLabel={isEditing ? 'Delete' : undefined}
        width="2xl"
      >
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-2">Default Images</h4>
            <div className="grid grid-cols-3 gap-2">
              {DEFAULT_MAP_IMAGES.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedImageUrl(url)}
                  className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-colors ${
                    selectedImageUrl === url ? 'border-foreground' : 'border-transparent hover:border-muted-foreground'
                  }`}
                >
                  <img src={url} alt={`Default map ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2">Upload Custom Image</h4>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/svg+xml,.heic,.heif,.avif,.svg"
              onChange={handleFileUpload}
              className="hidden"
              disabled={isUploading}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                if (fileInputRef.current) fileInputRef.current.click();
              }}
              disabled={isUploading}
            >
              Upload Custom Image
            </Button>
            <p className="mt-2 text-xs text-muted-foreground text-center">
              Supported: JPG, PNG, WEBP, GIF, AVIF, SVG, HEIC • Max 10MB
            </p>
            {isUploading && <p className="text-sm text-muted-foreground mt-1">Uploading...</p>}
          </div>

          {selectedImageUrl && !DEFAULT_MAP_IMAGES.includes(selectedImageUrl) && (
            <div>
              <h4 className="text-sm font-medium mb-2">Selected Image</h4>
              <div className="rounded-lg overflow-hidden border-2 border-foreground">
                <img src={selectedImageUrl} alt="Selected" className="w-full h-full object-cover" />
              </div>
            </div>
          )}
        </div>
      </Modal>

      {showDeleteModal && (
        <Modal
          title="Delete Map"
          content={
            <div className="space-y-4">
              <p>
                Are you sure you want to delete the campaign map?
              </p>
              <p className="text-sm text-red-600">
                This action cannot be undone. All map objects and territory associations will be permanently removed.
              </p>
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Type <span className="font-bold">Delete</span> to confirm:
                </p>
                <Input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Delete"
                  className="w-full"
                />
              </div>
              {isDeleting && (
                <p className="text-sm text-amber-500">
                  Deleting map and associated data...
                </p>
              )}
            </div>
          }
          onClose={() => {
            setShowDeleteModal(false);
            setDeleteConfirmText('');
          }}
          onConfirm={handleDeleteMap}
          confirmText={isDeleting ? 'Deleting...' : 'Delete'}
          confirmDisabled={deleteConfirmText !== 'Delete'}
        />
      )}
    </>
    );
  }

  // Editor step
  return (
    <div className="fixed inset-0 flex justify-center items-center z-[100] px-[10px] bg-black/50 dark:bg-neutral-700/50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <style>{`
        .leaflet-container {
          background: hsl(var(--background)) !important;
        }

        .leaflet-container .${EDITOR_TEXT_CLASSNAME}.pm-textarea,
        .leaflet-container .pm-textarea.pm-disabled {
          background: transparent;
          border: none;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          line-height: 1;
          padding: 0;
          transform: translate(-50%, -50%) translateX(6px) translateY(6px); /* Nudge to visually centre the glyphs on the marker point. */
          text-shadow: 0 1px 3px rgba(255, 255, 255, 0.7), 0 0 6px rgba(0,0,0,0.5);
          white-space: pre;
        }

        .leaflet-container .${EDITOR_TEXT_CLASSNAME}.pm-textarea:focus,
        .leaflet-container .pm-textarea.pm-disabled:focus {
          outline: none;
        }

        .leaflet-container .${EDITOR_TEXT_CLASSNAME}.pm-textarea.pm-hasfocus,
        .leaflet-container .pm-textarea.pm-hasfocus {
          background: rgba(0, 0, 0, 0.65);
          border: 1px solid rgba(255, 255, 255, 0.35);
          border-radius: 4px;
          text-shadow: none;
        }

        .campaign-map-territory-name {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          color: #fff !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          text-shadow: 0 1px 3px rgba(0,0,0,0.8), 0 0px 6px rgba(0,0,0,0.5) !important;
          padding: 0 !important;
          white-space: nowrap !important;
        }
        .campaign-map-territory-name::before {
          display: none !important;
        }
      `}</style>
      <div className="bg-card rounded-lg shadow-xl w-full max-w-6xl min-h-0 max-h-svh overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="border-b px-4 py-2 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold">{isEditing ? 'Edit Map' : 'Create Map'}</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setStep('image')}>
              Change Image
            </Button>
          </div>
        </div>

        {/* Settings bar */}
        <div className="border-b px-4 py-2 flex flex-wrap items-center gap-x-4 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={hexGridEnabled}
              onCheckedChange={checked => setHexGridEnabled(checked === true)}
            />
            <span>Hex Grid</span>
          </label>
          {hexGridEnabled && (
            <label className="flex items-center gap-2">
              <span>Size:</span>
              <input
                type="range" min={20} max={150} step={5}
                value={hexSize}
                onChange={e => setHexSize(Number(e.target.value))}
                className="w-32"
              />
              <span className="w-8 text-right">{hexSize}px</span>
            </label>
          )}

          <div className="border-l pl-4 flex items-center gap-2">
            <span className="text-muted-foreground text-xs">Place Landmark:</span>
            {paletteItems.map(({ key, label, html }) => (
              <MarkerPaletteButton
                key={key}
                iconKey={key}
                label={label}
                html={html}
                isActive={placingMarker && selectedMarkerIcon === key}
                onToggle={togglePlacingMarker}
              />
            ))}
          </div>
          {placingMarker && (
            <span className="text-xs text-muted-foreground italic ml-2">
              Click on the map to place {MARKER_ICONS[selectedMarkerIcon]?.label ?? 'marker'} — press Esc to cancel
            </span>
          )}
        </div>

        {/* Map editor + territory panel */}
        <div className="flex flex-1 min-h-0">
          {/* Map */}
          <div className="flex-1 min-h-[50vh]" ref={editorContainerRef} />

          {/* Territory association panel */}
          <div className="w-32 md:w-64 border-l overflow-y-auto p-1 md:p-2 space-y-2">
            <h4 className="text-sm font-semibold mb-2">Territory Associations</h4>
            <p className="text-xs text-muted-foreground mb-2">
              Click a drawn shape or hex on the map to select it, then click a territory below to link them.
            </p>
            <div className="text-xs text-muted-foreground">
              <p className=" mb-1 flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-[2px] border border-foreground/30"
                  style={{ backgroundColor: NON_LINKED_OBJECT_COLOUR }}
                  aria-hidden="true"
                />
                Not linked to a Territory
              </p>
              <p className="mb-1 flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-[2px] border border-foreground/30"
                  style={{ backgroundColor: LINKED_COLOUR }}
                  aria-hidden="true"
                />
                Linked to a Territory
              </p>
              <p className="mb-1 flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-[2px] border border-foreground/30"
                  style={{ backgroundColor: HIGHLIGHT_COLOUR }}
                  aria-hidden="true"
                />
                Selected object
              </p>
            </div>

            {selectedObjectTempId ? (
              <div className="bg-primary/10 border border-primary/30 rounded px-2 py-1.5 text-xs mb-2 space-y-2">
                <div>
                  <span className="font-semibold">Selected:</span>{' '}
                  {(() => {
                    const obj = localObjects.find(o => o.tempId === selectedObjectTempId);
                    if (!obj) return selectedObjectTempId.slice(0, 8);
                    const typeLabels: Record<string, string> = {
                      landmark: 'Landmark',
                      route: 'Route',
                      area_polygon: 'Polygon',
                      area_circle: 'Circle',
                      label: 'Label',
                    };
                    return typeLabels[obj.object_type] ?? obj.object_type;
                  })()}
                  {' '}
                  <span className="opacity-60">({selectedObjectTempId.slice(0, 8)})</span>
                </div>
                {(() => {
                  const obj = localObjects.find(o => o.tempId === selectedObjectTempId);
                  if (obj?.object_type === 'route') {
                    const currentStyle = (obj.properties?.lineStyle as string) ?? 'full';
                    return (
                      <div className="pt-1 border-t border-primary/20">
                        <span className="font-medium block mb-1">Line Style:</span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleUpdateLineStyle(selectedObjectTempId, 'full')}
                            className={`flex-1 px-2 py-1 rounded text-xs transition-colors ${
                              currentStyle === 'full'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted hover:bg-muted/80'
                            }`}
                            title="Solid line"
                          >
                            <span className="flex items-center justify-center gap-1">
                              <svg width="16" height="8" viewBox="0 0 16 8">
                                <line x1="0" y1="4" x2="16" y2="4" stroke="currentColor" strokeWidth="2" />
                              </svg>
                            </span>
                            <span className="sr-only">Solid</span>
                          </button>
                          <button
                            onClick={() => handleUpdateLineStyle(selectedObjectTempId, 'dashed')}
                            className={`flex-1 px-2 py-1 rounded text-xs transition-colors ${
                              currentStyle === 'dashed'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted hover:bg-muted/80'
                            }`}
                            title="Dashed line"
                          >
                            <span className="flex items-center justify-center gap-1">
                              <svg width="16" height="8" viewBox="0 0 16 8">
                                <line x1="0" y1="4" x2="16" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray="4,2" />
                              </svg>
                            </span>
                            <span className="sr-only">Dashed</span>
                          </button>
                          <button
                            onClick={() => handleUpdateLineStyle(selectedObjectTempId, 'dotted')}
                            className={`flex-1 px-2 py-1 rounded text-xs transition-colors ${
                              currentStyle === 'dotted'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted hover:bg-muted/80'
                            }`}
                            title="Dotted line"
                          >
                            <span className="flex items-center justify-center gap-1">
                              <svg width="16" height="8" viewBox="0 0 16 8">
                                <line x1="0" y1="4" x2="16" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray="1,3" />
                              </svg>
                            </span>
                            <span className="sr-only">Dotted</span>
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            ) : selectedHexCoord ? (
              <div className="bg-primary/10 border border-primary/30 rounded px-2 py-1.5 text-xs mb-2">
                <span className="font-semibold">Selected:</span>{' '}
                Hex <span className="opacity-60">({selectedHexCoord.x}, {selectedHexCoord.y}, {selectedHexCoord.z})</span>
              </div>
            ) : (
              <div className="bg-muted rounded px-2 py-1.5 text-xs mb-2 text-muted-foreground italic">
                No object selected. Click a shape or hex on the map.
              </div>
            )}
            {territories.map(territory => {
              const assoc = associations.find(a => a.territoryId === territory.id);
              const isLinked = !!(assoc?.mapObjectTempId || assoc?.mapHexCoords);
              const isLinkedToSelection =
                (selectedObjectTempId && assoc?.mapObjectTempId === selectedObjectTempId) ||
                (selectedHexCoord &&
                  assoc?.mapHexCoords &&
                  hexKey(assoc.mapHexCoords) === hexKey(selectedHexCoord));
              return (
                <div
                  key={territory.id}
                  className={`rounded border p-2 text-xs space-y-1 ${
                    isLinked
                      ? `${isLinkedToSelection ? 'border-2 border-foreground' : 'border-foreground/30'} bg-muted/50`
                      : 'border-border'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium truncate">
                      {territory.playing_card ? `${territory.playing_card} ` : ''}
                      {territory.territory_name}
                    </span>
                    {isLinked && (
                      <button onClick={() => handleClearAssociation(territory.id)} className="text-muted-foreground hover:text-destructive text-sm">&times;</button>
                    )}
                  </div>
                  {!isLinked && hasSelection && (
                    <Button size="sm" variant="outline" className="w-full text-xs h-6" onClick={() => handleAssociateTerritory(territory.id)}>
                      Link to selected
                    </Button>
                  )}
                  {isLinked && (
                    <label className="flex items-center gap-1 text-xs">
                      <Checkbox
                        checked={assoc?.showNameOnMap ?? true}
                        onCheckedChange={() => handleToggleShowName(territory.id)}
                      />
                      Show name on map
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-2 flex justify-between items-center">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteModal(true)}
            disabled={isSaving}
          >
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </div>

      {showDeleteModal && (
        <Modal
          title="Delete Map"
          content={
            <div className="space-y-4">
              <p>
                Are you sure you want to delete the campaign map?
              </p>
              <p className="text-sm text-red-600">
                This action cannot be undone. All map objects and territory associations will be permanently removed.
              </p>
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Type <span className="font-bold">Delete</span> to confirm:
                </p>
                <Input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Delete"
                  className="w-full"
                />
              </div>
              {isDeleting && (
                <p className="text-sm text-amber-500">
                  Deleting map and associated data...
                </p>
              )}
            </div>
          }
          onClose={() => {
            setShowDeleteModal(false);
            setDeleteConfirmText('');
          }}
          onConfirm={handleDeleteMap}
          confirmText={isDeleting ? 'Deleting...' : 'Delete'}
          confirmDisabled={deleteConfirmText !== 'Delete'}
        />
      )}
    </div>
  );
}
