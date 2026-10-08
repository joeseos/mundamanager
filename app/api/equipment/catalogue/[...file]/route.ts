import { NextRequest } from 'next/server';
import { serveEquipmentCatalogue } from '@/app/lib/equipment-catalogue';

/**
 * The Equipment modal's catalogue files (see app/lib/equipment-catalogue.ts):
 *   /api/equipment/catalogue/{version}/{edition}              an edition's core file
 *   /api/equipment/catalogue/{version}/{edition}/{gangType}   one gang type's equipment list rules
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ file: string[] }> }
) {
  const { file } = await params;
  return serveEquipmentCatalogue(request.url, file);
}
