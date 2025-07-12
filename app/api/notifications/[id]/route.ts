import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

// Add Edge Function configurations
export const runtime = 'edge';

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const supabase = await createClient();
  const { id } = params;

  if (!id) {
    return NextResponse.json(
      { error: 'Notification ID is required' },
      { status: 400 }
    );
  }

  // Validate UUID format
  const isValidUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (!isValidUuid) {
    return NextResponse.json(
      { error: 'Invalid notification ID format' },
      { status: 400 }
    );
  }

  try {
    // Get the current user to ensure they can only delete their own notifications
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify the notification belongs to the user before deleting
    const { data: notification, error: fetchError } = await supabase
      .from('notifications')
      .select('receiver_id')
      .eq('id', id)
      .single();

    if (fetchError) {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }

    if (notification.receiver_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Delete the notification
    const { error: deleteError } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting notification:', error);
    return NextResponse.json(
      { error: 'Failed to delete notification' },
      { status: 500 }
    );
  }
}
