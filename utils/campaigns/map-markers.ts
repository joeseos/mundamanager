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
