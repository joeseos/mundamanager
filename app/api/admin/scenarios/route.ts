import { TAGS } from '@/utils/cache-tags';
import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { checkAdmin } from "@/utils/auth";
import { revalidateTag } from "next/cache";

export async function GET() {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: scenarios, error } = await supabase
      .from('scenarios')
      .select('id, scenario_name, scenario_number, edition_id')
      .order('scenario_number', { ascending: true });

    if (error) throw error;

    return NextResponse.json(scenarios);
  } catch (error) {
    console.error('Error fetching scenarios:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scenarios' },
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

    const body = await request.json();
    const { scenario_name, scenario_number, edition_id } = body;

    const trimmedName = scenario_name?.trim();

    if (!trimmedName || scenario_number === undefined) {
      return NextResponse.json(
        { error: 'scenario_name and scenario_number are required' },
        { status: 400 }
      );
    }

    if (trimmedName.length > 200) {
      return NextResponse.json(
        { error: 'scenario_name must be 200 characters or less' },
        { status: 400 }
      );
    }

    const numericScenarioNumber = Number(scenario_number);
    if (isNaN(numericScenarioNumber) || numericScenarioNumber < 1) {
      return NextResponse.json(
        { error: 'scenario_number must be a positive number' },
        { status: 400 }
      );
    }

    // Scenario numbers restart per edition, so the check is scoped to one.
    let duplicateQuery = supabase
      .from('scenarios')
      .select('id')
      .eq('scenario_number', numericScenarioNumber);
    duplicateQuery = edition_id
      ? duplicateQuery.eq('edition_id', edition_id)
      : duplicateQuery.is('edition_id', null);

    const { data: existing } = await duplicateQuery.maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'A scenario with this number already exists for this edition' },
        { status: 409 }
      );
    }

    const { data: scenario, error } = await supabase
      .from('scenarios')
      .insert([
        {
          scenario_name: trimmedName,
          scenario_number: numericScenarioNumber,
          edition_id: edition_id || null
        }
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(scenario);
  } catch (error) {
    console.error('Error creating scenario:', error);
    return NextResponse.json(
      { error: 'Failed to create scenario' },
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

    const body = await request.json();
    const { id, scenario_name, scenario_number, edition_id } = body;

    const trimmedName = scenario_name?.trim();

    if (!id || !trimmedName || scenario_number === undefined) {
      return NextResponse.json(
        { error: 'id, scenario_name, and scenario_number are required' },
        { status: 400 }
      );
    }

    if (trimmedName.length > 200) {
      return NextResponse.json(
        { error: 'scenario_name must be 200 characters or less' },
        { status: 400 }
      );
    }

    const numericScenarioNumber = Number(scenario_number);
    if (isNaN(numericScenarioNumber) || numericScenarioNumber < 1) {
      return NextResponse.json(
        { error: 'scenario_number must be a positive number' },
        { status: 400 }
      );
    }

    // Duplicate check, excluding the current scenario.
    let duplicateQuery = supabase
      .from('scenarios')
      .select('id')
      .eq('scenario_number', numericScenarioNumber)
      .neq('id', id);
    duplicateQuery = edition_id
      ? duplicateQuery.eq('edition_id', edition_id)
      : duplicateQuery.is('edition_id', null);

    const { data: existing } = await duplicateQuery.maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'A scenario with this number already exists for this edition' },
        { status: 409 }
      );
    }

    const { data: scenario, error } = await supabase
      .from('scenarios')
      .update({
        scenario_name: trimmedName,
        scenario_number: numericScenarioNumber,
        edition_id: edition_id || null
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(scenario);
  } catch (error) {
    console.error('Error updating scenario:', error);
    return NextResponse.json(
      { error: 'Failed to update scenario' },
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
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('scenarios')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting scenario:', error);
    return NextResponse.json(
      { error: 'Failed to delete scenario' },
      { status: 500 }
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
      revalidateTag(TAGS.globalScenarios(), { expire: 0 });
    }
    return response;
  };
}

export const POST = withReferenceInvalidation(_POST);
export const PATCH = withReferenceInvalidation(_PATCH);
export const DELETE = withReferenceInvalidation(_DELETE);
