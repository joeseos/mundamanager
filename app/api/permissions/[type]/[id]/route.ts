import { createClient } from "@/utils/supabase/server";
import { PermissionService } from "@/app/lib/user-permissions";
import { getUserIdFromClaims } from "@/utils/auth";
import { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const { type, id } = await params;

  try {
    const supabase = await createClient();
    const userId = await getUserIdFromClaims(supabase);

    if (!userId) {
      return Response.json({
        isOwner: false,
        isAdmin: false,
        canEdit: false,
        canDelete: false,
        canView: true,
        userId: null
      });
    }

    const permissionService = new PermissionService();

    let permissions;
    if (type === 'gang') {
      permissions = await permissionService.getGangPermissions(userId, id);
    } else if (type === 'fighter') {
      permissions = await permissionService.getFighterPermissions(userId, id);
    } else {
      return Response.json({ error: 'Invalid type' }, { status: 400 });
    }

    return Response.json(permissions);
  } catch {
    return Response.json({
      isOwner: false,
      isAdmin: false,
      canEdit: false,
      canDelete: false,
      canView: true,
      userId: null
    });
  }
}
