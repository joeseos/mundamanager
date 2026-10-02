import { NextRequest } from 'next/server';
import { serveEquipmentCatalogue } from '@/app/lib/equipment-catalogue';

/** An edition's core catalogue file for the Equipment modal (see app/lib/equipment-catalogue.ts). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ version: string; edition: string }> }
) {
  const { version, edition } = await params;
  return serveEquipmentCatalogue(request.url, { version, edition, gangType: null });
}
