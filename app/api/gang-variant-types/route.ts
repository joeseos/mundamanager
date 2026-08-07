import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { checkAdmin, getUserIdFromClaims } from "@/utils/auth";
import { editionSlugFromJoin } from "@/types/edition";

interface Variant {
    id: string;
    variant: string;
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
            .select('id, variant, editions:edition_id (slug)')
            .order('variant')

        const { data, error } = await query;

        if (error) throw error;

        const modelData = data.map((variant: Variant) => ({
            id: variant.id,
            variant: variant.variant,
            edition_slug: editionSlugFromJoin(variant.editions),
        }));

        return NextResponse.json(modelData);
    } catch (error)
    {
        console.error('Error fetching gang variant types: ', error);
        return NextResponse.json(
            {error: 'Failed to fetch gang variant types'},
            {status: 500}
        );
    }
}