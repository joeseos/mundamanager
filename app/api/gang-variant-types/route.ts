import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { checkAdmin, getUserIdFromClaims } from "@/utils/auth";

interface Variant {
    id: string;
    variant: string;
    edition_id?: string | null;
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
            .select('id, variant, edition_id')
            .order('variant')

        const { data, error } = await query;

        if (error) throw error;

        const modelData = data.map((variant: Variant) => ({
            id: variant.id,
            variant: variant.variant,
            edition_id: variant.edition_id ?? null,
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