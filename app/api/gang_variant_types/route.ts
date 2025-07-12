import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { checkAdmin } from '@/utils/auth';

interface Variant {
  id: string;
  variant: string;
}

export async function GET(request: Request) {
  const supabase = await createClient();

  try {
    // Check if user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const query = supabase
      .from('gang_variant_types')
      .select('id, variant')
      .order('variant');

    const { data, error } = await query;

    if (error) throw error;

    const modelData = data.map((variant: Variant) => ({
      id: variant.id,
      variant: variant.variant,
    }));

    return NextResponse.json(modelData);
  } catch (error) {
    console.error('Error fetching gang variant types: ', error);
    return NextResponse.json(
      { error: 'Failed to fetch gang variant types' },
      { status: 500 }
    );
  }
}
