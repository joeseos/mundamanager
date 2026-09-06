import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { getUserIdFromClaims } from "@/utils/auth";
import { editionSlugFromJoin } from "@/types/edition";

interface DbGangSubtypeTypeRow {
    id: string;
    variant: string;
    edition_id?: string | null;
    editions?: { slug: string } | { slug: string }[] | null;
}

export async function GET(request: Request) {
    const supabase = await createClient();

    try {
        // Check if user is authenticated
        const userId = await getUserIdFromClaims(supabase);
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let query = supabase
            .from('gang_variant_types')
            .select('id, variant, edition_id, editions:edition_id (slug)')
            .order('variant')

        const { data, error } = await query;

        if (error) throw error;

        // Map DB column `variant` → app field `subtype`
        const modelData = data.map((row: DbGangSubtypeTypeRow) => ({
            id: row.id,
            subtype: row.variant,
            // Slug for the player-side callers; id for the admin editor, which saves one
            edition_id: row.edition_id ?? null,
            edition_slug: editionSlugFromJoin(row.editions),
        }));

        return NextResponse.json(modelData);
    } catch (error)
    {
        console.error('Error fetching gang subtype types: ', error);
        return NextResponse.json(
            {error: 'Failed to fetch gang subtype types'},
            {status: 500}
        );
    }
}
