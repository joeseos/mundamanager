import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RxCrosshair2 } from 'react-icons/rx';
import { FaBiohazard } from 'react-icons/fa6';

const HIVE_CITY_SVG_URL =
  'https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/campaigns/map/icons/hive-city.svg';
const BEAST_SVG_URL =
  'https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/campaigns/map/icons/beast.svg';

export interface MarkerIconDef {
  label: string;
  html: (colour: string) => string;
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
  return `<div style="width:${size}px;height:${size}px;background-color:${colour};-webkit-mask-image:url(${url});mask-image:url(${url});-webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;"></div>`;
}

export const MARKER_ICONS: Record<string, MarkerIconDef> = {
  'hive-city': {
    label: 'Hive City',
    html: (colour) => maskedSvgHtml(HIVE_CITY_SVG_URL, colour, 32),
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  },
  beast: {
    label: 'Beast',
    html: (colour) => maskedSvgHtml(BEAST_SVG_URL, colour, 32),
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  },
  crosshair: {
    label: 'Crosshair',
    html: (colour) =>
      `<div style="color:${colour};font-size:28px;line-height:1;">${getReactIconSvg(RxCrosshair2)}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    isReactIcon: true,
  },
  biohazard: {
    label: 'Biohazard',
    html: (colour) =>
      `<div style="color:${colour};font-size:28px;line-height:1;">${getReactIconSvg(FaBiohazard)}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    isReactIcon: true,
  },
};

export const DEFAULT_MARKER_ICON = 'hive-city';

export const MARKER_ICON_KEYS = Object.keys(MARKER_ICONS);

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

  return `<div style="width:${displaySize}px;height:${displaySize}px;display:flex;align-items:center;justify-content:center;overflow:visible;"><div style="width:${baseSize}px;height:${baseSize}px;display:flex;align-items:center;justify-content:center;transform:scale(${scale});transform-origin:center center;">${markerDef.html(colour)}</div></div>`;
}
