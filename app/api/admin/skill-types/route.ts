import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";
import { revalidateTag } from "next/cache";
import { TAGS } from '@/utils/cache-tags';
export async function GET() {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('skill_types')
      .select('id, name')
      .order('name');

    if (error) throw error;

    const transformedData = data.map(type => ({
      id: type.id,
      skill_type: type.name
    }));

    return NextResponse.json(transformedData);
  } catch (error) {
    console.error('Error fetching skill sets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch skill sets' },
      { status: 500 }
    );
  }
}

async function _POST(request: Request) {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const skillTypeData = await request.json();

    const formattedData = {
      name: skillTypeData.name
    };

    const { data, error } = await supabase
      .from('skill_types')
      .insert([formattedData])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating skill set:', error);
    return NextResponse.json(
      { error: 'Failed to create skill set' },
      { status: 500 }
    );
  }
}

async function _PATCH(request: Request) {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const skillTypeData = await request.json();

    const formattedData = {
      name: skillTypeData.name,
      id: skillTypeData.id,
    };

    const { data, error } = await supabase
      .from('skill_types')
      .update([formattedData])
      .eq('id', formattedData.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating skill set:', error);
    return NextResponse.json(
      { error: 'Failed to create skill set' },
      { status: 500 }
    );
  }
}

async function _DELETE(request: Request) {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: 'Skill ID is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('skill_types')
      .delete()
      .eq('id', body.id)

    if (error) {
      throw error;
    }
    return NextResponse.json({ success: true, message: 'Skill Set deleted successfully' });
  } catch (error) {
    console.error('Error deleting skill:', error);
    return NextResponse.json(
        {error: 'Failed to delete skill'},
        {status: 500}
    );
  }
}

// Admin edits change global reference data that is cached app-wide; fire the
// matching tags once per successful mutation (previously nothing was fired,
// so admin edits never showed up until caches expired).
function withReferenceInvalidation(
  handler: (...args: any[]) => Promise<Response>
) {
  return async (...args: any[]) => {
    const response = await handler(...args);
    if (response.ok) {
      revalidateTag(TAGS.availableSkills(), { expire: 0 });
      revalidateTag(TAGS.advancementCategories(), { expire: 0 });
    }
    return response;
  };
}

export const POST = withReferenceInvalidation(_POST);
export const PATCH = withReferenceInvalidation(_PATCH);
export const DELETE = withReferenceInvalidation(_DELETE);
