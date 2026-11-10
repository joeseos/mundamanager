import { NextResponse } from "next/server";
import { isUuid } from "@/utils/uuid";

// Shared handling for the public campaign data endpoints (/data and the routes
// under it): ?format=xml, CORS, the per-IP rate limit (one budget for all of
// them on a server instance), and the error responses.

// IP-based rate limiting storage
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const dataRateLimitMap = new Map<string, RateLimitEntry>();

function getCorsHeaders(): Record<string, string> {
  return {
    // Public endpoint: allow cross-origin consumers.
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

export function campaignDataOptions() {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders()
  });
}

/**
 * Extract client IP from Vercel request headers
 * Vercel sets x-forwarded-for with the true client IP
 */
function getClientIP(request: Request): string {
  // Primary: x-forwarded-for (set by Vercel)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // Can be comma-separated list, take first IP
    return forwarded.split(',')[0].trim();
  }

  // Fallback: x-real-ip
  const realIP = request.headers.get("x-real-ip");
  if (realIP) return realIP;

  // Development fallback
  return "127.0.0.1";
}

/**
 * Check rate limiting for data endpoint (10 requests per minute per IP)
 * @param ip - Client IP address
 * @returns Rate limit status with details for response headers
 */
function checkDataRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  reset: number;
  limit: number;
} {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const maxRequests = 10;

  const entry = dataRateLimitMap.get(ip);

  // Create new window if doesn't exist or expired
  if (!entry || now > entry.resetTime) {
    dataRateLimitMap.set(ip, {
      count: 1,
      resetTime: now + windowMs
    });

    // Cleanup expired entries (memory leak prevention)
    const expirationThreshold = now - windowMs;
    const entries = Array.from(dataRateLimitMap.entries());
    for (const [key, value] of entries) {
      if (value.resetTime < expirationThreshold) {
        dataRateLimitMap.delete(key);
      }
    }

    return {
      allowed: true,
      remaining: maxRequests - 1,
      reset: now + windowMs,
      limit: maxRequests
    };
  }

  // Check if limit exceeded
  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      reset: entry.resetTime,
      limit: maxRequests
    };
  }

  // Increment counter
  entry.count++;
  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    reset: entry.resetTime,
    limit: maxRequests
  };
}


// Helper function to convert object to XML
function objectToXml(obj: any, rootName: string = 'root'): string {
  function buildXml(data: any, nodeName: string): string {
    if (data === null || data === undefined) {
      return ''; // Return empty string to omit undefined/null fields
    }

    if (typeof data !== 'object') {
      // Escape special XML characters
      const escaped = String(data)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
      return `<${nodeName}>${escaped}</${nodeName}>`;
    }

    if (Array.isArray(data)) {
      // Empty arrays return self-closing tag
      if (data.length === 0) {
        return `<${nodeName} />`; // Self-closing tag for empty arrays
      }

      // Handle plural to singular conversion for XML node names
      let singularName = nodeName;
      if (nodeName.endsWith('ies')) {
        // territories -> territory, categories -> category
        singularName = nodeName.slice(0, -3) + 'y';
      } else if (nodeName.endsWith('s')) {
        // gangs -> gang, members -> member
        singularName = nodeName.slice(0, -1);
      }

      // Wrap array items in the plural parent tag to maintain grouping
      const items = data.map(item => buildXml(item, singularName)).join('');
      return `<${nodeName}>${items}</${nodeName}>`;
    }

    const children = Object.entries(data)
      .map(([key, value]) => buildXml(value, key))
      .filter(xml => xml !== '') // Filter out empty strings from undefined/null values
      .join('');

    // If no children after filtering, return self-closing tag
    if (children === '') {
      return `<${nodeName} />`;
    }

    return `<${nodeName}>${children}</${nodeName}>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n${buildXml(obj, rootName)}`;
}

function errorResponse(format: string, status: number, error: string, headers: Record<string, string>) {
  return format === 'xml'
    ? new NextResponse(objectToXml({ error }, 'error'), {
        status,
        headers: { ...headers, 'Content-Type': 'application/xml' }
      })
    : NextResponse.json({ error }, { status, headers });
}

/**
 * Serve one public campaign data endpoint.
 * @param load - Builds the response body; null means the campaign doesn't exist
 * @param xmlRootName - Root element name for ?format=xml
 * @param xmlFilename - Filename for the XML Content-Disposition header
 */
export async function campaignDataResponse(
  request: Request,
  campaignId: string,
  load: () => Promise<object | null>,
  xmlRootName: string,
  xmlFilename: string
): Promise<NextResponse> {
  const corsHeaders = getCorsHeaders();

  // Get format from query parameter (e.g., ?format=xml)
  const format = new URL(request.url).searchParams.get('format') || 'json';

  if (!campaignId) {
    return errorResponse(format, 400, "Campaign ID is required", corsHeaders);
  }

  try {
    // Extract client IP from Vercel headers
    const clientIP = getClientIP(request);

    // Apply rate limiting (10 requests per minute per IP)
    const rateLimitResult = checkDataRateLimit(clientIP);

    if (!rateLimitResult.allowed) {
      const resetSeconds = Math.ceil((rateLimitResult.reset - Date.now()) / 1000);
      const errorMessage = `Rate limit exceeded. Maximum ${rateLimitResult.limit} requests per minute per IP. Retry in ${resetSeconds} seconds.`;

      return errorResponse(format, 429, errorMessage, {
        'X-RateLimit-Limit': String(rateLimitResult.limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(rateLimitResult.reset / 1000)),
        'Retry-After': String(resetSeconds),
        ...corsHeaders
      });
    }

    // Prepare rate limit headers for successful responses
    const headers = {
      'X-RateLimit-Limit': String(rateLimitResult.limit),
      'X-RateLimit-Remaining': String(rateLimitResult.remaining),
      'X-RateLimit-Reset': String(Math.ceil(rateLimitResult.reset / 1000)),
      ...corsHeaders
    };

    // SECURITY NOTE: These endpoints are intentionally public - any campaign ID can be viewed
    // Rate limiting (10 req/min per IP) provides abuse protection

    // Postgres rejects a malformed UUID, so answer it before any database read
    const data = isUuid(campaignId) ? await load() : null;

    if (!data) {
      return errorResponse(format, 404, 'Campaign not found', headers);
    }

    // Return based on requested format
    if (format === 'xml') {
      return new NextResponse(objectToXml(data, xmlRootName), {
        status: 200,
        headers: {
          'Content-Type': 'application/xml',
          'Content-Disposition': `inline; filename="${xmlFilename}"`,
          ...headers
        }
      });
    }

    return NextResponse.json(data, { headers });
  } catch (error) {
    console.error('Error generating campaign data:', error);
    return errorResponse(format, 500, "Failed to generate campaign data", corsHeaders);
  }
}
