// @ts-nocheck
//
// HTML notifications (is_html) for the SES worker.
// The in-app allowlist is _notification-html-allowlist.ts. This file adds the
// email layout pass on top of it.

import sanitizeHtml from "npm:sanitize-html@2.18.1";
import {
  filterAuthorStyle,
  notificationHtmlSanitizeOptions,
} from "./_notification-html-allowlist.ts";

const EMAIL_BORDER = "#262626";

function appendStyle(existing, extra) {
  const base = (existing ?? "").trim().replace(/;+\s*$/, "");
  const add = extra.trim().replace(/^;+/, "").replace(/;+\s*$/, "");
  if (!add) return base;
  return base ? `${base};${add}` : add;
}

function blockTransform(extra) {
  return (tagName, attribs) => ({
    tagName,
    attribs: {
      ...attribs,
      style: appendStyle(attribs.style, extra),
    },
  });
}

function absoluteHref(href, appUrl) {
  const trimmed = href.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return `${appUrl.replace(/\/$/, "")}${trimmed}`;
  }
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  return "";
}

function emailSanitizeOptions(appUrl) {
  return {
    ...notificationHtmlSanitizeOptions,
    // Deno can parse these layout styles. The in-app pass cannot: PostCSS
    // throws in the browser and would delete the colour.
    parseStyleAttributes: true,
    // A colour span becomes <font color>, which mail clients honour inside the
    // grey body wrapper. A styled span is ignored and the whole message stays grey.
    allowedTags: [...notificationHtmlSanitizeOptions.allowedTags, "font"],
    allowedAttributes: {
      ...notificationHtmlSanitizeOptions.allowedAttributes,
      a: ["href", "target", "rel", "style"],
      font: ["color"],
      ul: ["style"],
      ol: ["style"],
      li: ["style"],
      blockquote: ["style"],
    },
    allowedStyles: {
      "*": {
        color: [/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i],
        "text-align": [/^(?:left|right|center|justify)$/],
        margin: [/^0 0 (?:4px|12px)(?: 20px)?$/],
        "font-size": [/^(?:15|16|18|22)px$/],
        "line-height": [/^(?:1\.3|1\.6)$/],
        "font-weight": [/^(?:700|bold)$/],
        padding: [/^0$/],
        "padding-left": [/^12px$/],
        "border-left": [/^3px solid #262626$/i],
        "text-decoration": [/^underline$/],
      },
    },
    transformTags: {
      a: (tagName, attribs) => {
        const href = absoluteHref(attribs.href ?? "", appUrl);
        if (!href) {
          return { tagName: "span", attribs: {} };
        }
        return {
          tagName,
          attribs: {
            href,
            target: "_blank",
            rel: "noopener noreferrer nofollow",
            style: "text-decoration:underline",
          },
        };
      },
      p: blockTransform("margin:0 0 12px;font-size:15px;line-height:1.6"),
      h1: blockTransform("margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:700"),
      h2: blockTransform("margin:0 0 12px;font-size:18px;line-height:1.3;font-weight:700"),
      h3: blockTransform("margin:0 0 12px;font-size:16px;line-height:1.3;font-weight:700"),
      ul: blockTransform("margin:0 0 12px 20px;padding:0"),
      ol: blockTransform("margin:0 0 12px 20px;padding:0"),
      li: blockTransform("margin:0 0 4px"),
      blockquote: blockTransform(
        `margin:0 0 12px;padding-left:12px;border-left:3px solid ${EMAIL_BORDER}`,
      ),
      span: (_tagName, attribs) => {
        const style = filterAuthorStyle(attribs.style);
        const colorMatch = style.match(/(?:^|;)color:(#[0-9a-f]{6}|#[0-9a-f]{3})(?![0-9a-f])/i);
        if (colorMatch) {
          return { tagName: "font", attribs: { color: colorMatch[1] } };
        }
        const align = style.match(/(?:^|;)text-align:(left|right|center|justify)/i);
        if (align) {
          return { tagName: "span", attribs: { style: `text-align:${align[1]}` } };
        }
        return { tagName: "span", attribs: {} };
      },
    },
  };
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, digits) => {
      const code = Number(digits);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

export function notificationHtmlToPlain(html) {
  const withLinks = html.replace(
    /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href, inner) => {
      const label = inner.replace(/<[^>]+>/g, "").trim();
      const url = href.trim();
      if (!url) return label;
      if (!label || label === url) return url;
      return `${label} (${url})`;
    },
  );

  const withBreaks = withLinks
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<\/(p|h1|h2|h3|li|blockquote|ul|ol|div)>/gi, "\n");

  return decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function notificationHtmlEmailBody(html, appUrl) {
  // First pass is the in-app allowlist (colour, alignment, https links).
  // The second pass only adds email layout styles and does not paint a colour
  // onto each block, so an authored span colour is what the client shows.
  const inAppSafe = sanitizeHtml(html, notificationHtmlSanitizeOptions);
  const safe = sanitizeHtml(inAppSafe, emailSanitizeOptions(appUrl));
  return { html: safe, text: notificationHtmlToPlain(safe) };
}
