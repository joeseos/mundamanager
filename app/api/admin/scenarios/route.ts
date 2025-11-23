import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();

  try {
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
    const body = await request.json();
    const { scenario_name, scenario_number } = body;

    if (!scenario_name || scenario_number === undefined) {
      return NextResponse.json(
        { error: 'scenario_name and scenario_number are required' },
        { status: 400 }
      );
    }

    const { data: scenario, error } = await supabase
      .from('scenarios')
      .insert([
        {
          scenario_name,
          scenario_number: Number(scenario_number)
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
    const body = await request.json();
    const { id, scenario_name, scenario_number } = body;

    if (!id || !scenario_name || scenario_number === undefined) {
      return NextResponse.json(
        { error: 'id, scenario_name, and scenario_number are required' },
        { status: 400 }
      );
    }

    const { data: scenario, error } = await supabase
      .from('scenarios')
      .update({
        scenario_name,
        scenario_number: Number(scenario_number)
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

