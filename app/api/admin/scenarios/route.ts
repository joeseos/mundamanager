import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { checkAdmin } from "@/utils/auth";

export async function GET() {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: scenarios, error } = await supabase
      .from('scenarios')
      .select('id, scenario_name, scenario_number')
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

export async function POST(request: Request) {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { scenario_name, scenario_number } = body;

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

    // Check for duplicate scenario number
    const { data: existing } = await supabase
      .from('scenarios')
      .select('id')
      .eq('scenario_number', numericScenarioNumber)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'A scenario with this number already exists' },
        { status: 409 }
      );
    }

    const { data: scenario, error } = await supabase
      .from('scenarios')
      .insert([
        {
          scenario_name: trimmedName,
          scenario_number: numericScenarioNumber
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

export async function PATCH(request: Request) {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, scenario_name, scenario_number } = body;

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

    // Check for duplicate scenario number (excluding current scenario)
    const { data: existing } = await supabase
      .from('scenarios')
      .select('id')
      .eq('scenario_number', numericScenarioNumber)
      .neq('id', id)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'A scenario with this number already exists' },
        { status: 409 }
      );
    }

    const { data: scenario, error } = await supabase
      .from('scenarios')
      .update({
        scenario_name: trimmedName,
        scenario_number: numericScenarioNumber
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

export async function DELETE(request: Request) {
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

    // Check if scenario is in use by any battles
    const { data: battles, error: checkError } = await supabase
      .from('campaign_battles')
      .select('id')
      .eq('scenario', id)
      .limit(1);

    if (checkError) throw checkError;

    if (battles && battles.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete scenario - it is currently used in battle logs' },
        { status: 409 }
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

