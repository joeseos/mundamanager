import { NextRequest } from 'next/server';
import { serveEquipmentCatalogue } from '@/app/lib/equipment-catalogue';

/** One gang type's equipment list rules for the Equipment modal (see app/lib/equipment-catalogue.ts). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ version: string; edition: string; gangType: string }> }
) {
  const { version, edition, gangType } = await params;
  return serveEquipmentCatalogue(request.url, { version, edition, gangType });
}
