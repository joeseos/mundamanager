import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RxCrosshair2 } from 'react-icons/rx';
import { FaBiohazard } from 'react-icons/fa6';

export { escapeHtml } from '@/utils/html';

const HIVE_CITY_SVG_URL =
  'https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/campaigns/map/icons/hive-city.svg';
const SETTLEMENT_SVG_URL =
  'https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/campaigns/map/icons/settlement.svg';
const BEAST_SVG_URL =
  'https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/campaigns/map/icons/beast.svg';

export interface MarkerIconDef {
  label: string;
  html: (colour: string) => string;
  /** Renders the icon into the fixed-size palette slot in the map editor. */
  paletteHtml: (colour: string) => string;
  iconSize: [number, number];
  iconAnchor: [number, number];
  isReactIcon?: boolean;
}

export const DEFAULT_MAP_RELATIVE_MARKER_SIZE = 80;
export const MIN_MAP_RELATIVE_MARKER_SIZE = 20;
export const MAX_MAP_RELATIVE_MARKER_SIZE = 250;

export const DEFAULT_LABEL_FONT_SIZE = 14;
export const MIN_LABEL_FONT_SIZE = 8;
export const MAX_LABEL_FONT_SIZE = 72;
export const LABEL_TERRITORY_NAME_OFFSET_X = -6;
export const LABEL_TERRITORY_NAME_GAP = -14;

/** Gap (px) between the bottom of a landmark icon box and the territory name label. Negative number = overlap */
export const LANDMARK_TERRITORY_NAME_GAP = -6;

// Render react-icon components to static SVG strings on first use and cache
// the result. Avoids running renderToStaticMarkup at module load time so the
// work is only paid by code paths that actually use a react-icon-based
// marker (and only once per icon component for the lifetime of the bundle).
const reactIconSvgCache = new Map<ComponentType, string>();

function getReactIconSvg(IconComponent: ComponentType): string {
  let svg = reactIconSvgCache.get(IconComponent);
  if (svg === undefined) {
    svg = renderToStaticMarkup(createElement(IconComponent));
    reactIconSvgCache.set(IconComponent, svg);
  }
  return svg;
}

function maskedSvgHtml(url: string, colour: string, size: number): string {
  return `<div style="width:${size}px;height:${size}px;background-color:${colour};-webkit-mask-image:url(${url});mask-image:url(${url});-webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center bottom;mask-position:center bottom;"></div>`;
}

/** Fixed slot for the map editor marker palette (px). */
export const PALETTE_SLOT_WIDTH = 32;
export const PALETTE_SLOT_HEIGHT = 28;

function paletteSlotHtml(innerHtml: string): string {
  return `<div style="width:${PALETTE_SLOT_WIDTH}px;height:${PALETTE_SLOT_HEIGHT}px;display:flex;align-items:flex-end;justify-content:center;line-height:0;">${innerHtml}</div>`;
}

function maskedSvgPaletteHtml(url: string, colour: string): string {
  return paletteSlotHtml(
    `<div style="width:100%;height:100%;background-color:${colour};-webkit-mask-image:url(${url});mask-image:url(${url});-webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center bottom;mask-position:center bottom;"></div>`
  );
}

function reactIconPaletteHtml(svg: string, colour: string, fontSize: number): string {
  return paletteSlotHtml(
    `<div style="color:${colour};font-size:${fontSize}px;line-height:1;display:flex;align-items:flex-end;justify-content:center;">${svg}</div>`
  );
}

const PALETTE_REACT_ICON_FONT_SIZE = 24;

export const MARKER_ICONS: Record<string, MarkerIconDef> = {
  'hive-city': {
    label: 'Hive City',
    html: (colour) => maskedSvgHtml(HIVE_CITY_SVG_URL, colour, 32),
    paletteHtml: (colour) => maskedSvgPaletteHtml(HIVE_CITY_SVG_URL, colour),
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  },
  settlement: {
    label: 'Settlement',
    html: (colour) => maskedSvgHtml(SETTLEMENT_SVG_URL, colour, 32),
    paletteHtml: (colour) => maskedSvgPaletteHtml(SETTLEMENT_SVG_URL, colour),
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  },
  beast: {
    label: 'Beast',
    html: (colour) => maskedSvgHtml(BEAST_SVG_URL, colour, 32),
    paletteHtml: (colour) => maskedSvgPaletteHtml(BEAST_SVG_URL, colour),
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  },
  crosshair: {
    label: 'Crosshair',
    html: (colour) =>
      `<div style="color:${colour};font-size:28px;line-height:1;">${getReactIconSvg(RxCrosshair2)}</div>`,
    paletteHtml: (colour) => reactIconPaletteHtml(getReactIconSvg(RxCrosshair2), colour, PALETTE_REACT_ICON_FONT_SIZE),
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    isReactIcon: true,
  },
  biohazard: {
    label: 'Biohazard',
    html: (colour) =>
      `<div style="color:${colour};font-size:28px;line-height:1;">${getReactIconSvg(FaBiohazard)}</div>`,
    paletteHtml: (colour) => reactIconPaletteHtml(getReactIconSvg(FaBiohazard), colour, PALETTE_REACT_ICON_FONT_SIZE),
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    isReactIcon: true,
  },
};

export const DEFAULT_MARKER_ICON = 'hive-city';

export const MARKER_ICON_KEYS = Object.keys(MARKER_ICONS);

export function buildPaletteMarkerHtml(iconKey: string, colour = '#888888'): string {
  return MARKER_ICONS[iconKey]?.paletteHtml(colour) ?? '';
}

export function isMapRelativeMarker(properties: Record<string, unknown>): boolean {
  return properties.fixedSizeRelativeToMap === true;
}

export function isMapRelativeLabel(properties: Record<string, unknown>): boolean {
  return properties.fixedSizeRelativeToMap === true;
}

export function getDefaultMarkerIconSize(markerDef: MarkerIconDef): number {
  const defaultSize = Math.max(markerDef.iconSize[0], markerDef.iconSize[1]);
  return defaultSize > 0 ? defaultSize : DEFAULT_MAP_RELATIVE_MARKER_SIZE;
}

export function normaliseMapRelativeMarkerSize(value: unknown): number {
  const numericValue = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return DEFAULT_MAP_RELATIVE_MARKER_SIZE;
  }

  return Math.min(
    MAX_MAP_RELATIVE_MARKER_SIZE,
    Math.max(MIN_MAP_RELATIVE_MARKER_SIZE, Math.round(numericValue))
  );
}

export function normaliseLabelFontSize(value: unknown): number {
  const numericValue = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return DEFAULT_LABEL_FONT_SIZE;
  }

  return Math.min(
    MAX_LABEL_FONT_SIZE,
    Math.max(MIN_LABEL_FONT_SIZE, Math.round(numericValue))
  );
}

export function getMarkerDisplaySize(
  markerDef: MarkerIconDef,
  properties: Record<string, unknown>,
  zoomScale: number
): number {
  if (!isMapRelativeMarker(properties)) {
    return getDefaultMarkerIconSize(markerDef);
  }

  return normaliseMapRelativeMarkerSize(properties.mapRelativeIconSize) * zoomScale;
}

/** Leaflet tooltip Y offset from a centre-anchored landmark to its territory name. */
export function getLandmarkTerritoryNameOffset(
  markerDef: MarkerIconDef,
  properties: Record<string, unknown>,
  zoomScale: number
): number {
  const displaySize = getMarkerDisplaySize(markerDef, properties, zoomScale);
  return displaySize / 2 + LANDMARK_TERRITORY_NAME_GAP;
}

export function getLabelDisplayFontSize(
  properties: Record<string, unknown>,
  zoomScale: number
): number {
  const fontSize = normaliseLabelFontSize(properties.fontSize);

  if (!isMapRelativeLabel(properties)) {
    return fontSize;
  }

  return fontSize * zoomScale;
}

export function getLabelTextDimensions(text: string, fontSize: number): { width: number; height: number } {
  const lines = text.split(/\r?\n/);
  const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 1);
  const lineCount = Math.max(1, lines.length);
  const horizontalPadding = Math.ceil(fontSize);
  const verticalPadding = Math.ceil(fontSize * 0.5);

  return {
    width: Math.ceil(longestLine * fontSize * 0.65) + horizontalPadding,
    height: Math.ceil(lineCount * fontSize) + verticalPadding,
  };
}

export function getLabelTerritoryNameOffset(text: string, fontSize: number): number {
  const lineCount = Math.max(1, text.split(/\r?\n/).length);
  const desiredOffset = ((lineCount * fontSize) / 2) + LABEL_TERRITORY_NAME_GAP;
  return Math.max(0, desiredOffset);
}

export function buildSizedMarkerHtml(
  markerDef: MarkerIconDef,
  colour: string,
  displaySize: number
): string {
  const baseSize = getDefaultMarkerIconSize(markerDef);
  const scale = displaySize / baseSize;

  return `<div style="width:${displaySize}px;height:${displaySize}px;display:flex;align-items:flex-end;justify-content:center;overflow:visible;"><div style="width:${baseSize}px;height:${baseSize}px;display:flex;align-items:flex-end;justify-content:center;transform:scale(${scale});transform-origin:center bottom;line-height:0;">${markerDef.html(colour)}</div></div>`;
}
