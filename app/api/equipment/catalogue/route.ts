import { NextRequest } from 'next/server';
import { serveEquipmentCatalogue } from '@/app/lib/equipment-catalogue';

/**
 * The Equipment modal's catalogue files (see app/lib/equipment-catalogue.ts):
 *   ?version=&edition_id=                 an edition's core file
 *   ?version=&edition_id=&gang_type_id=   one gang type's equipment list rules
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  return serveEquipmentCatalogue(request.url, {
    version: searchParams.get('version') ?? '',
    edition: searchParams.get('edition_id') ?? '',
    gangType: searchParams.get('gang_type_id'),
  });
}
