'use server'

import { updateGangPositioning as updateGangPositioningServer } from "@/app/lib/server-functions/gang-positioning";

interface UpdateGangPositioningParams {
  gangId: string;
  positions: Record<number, string>;
}

interface UpdateGangPositioningResult {
  success: boolean;
  error?: string;
}

export async function updateGangPositioning(params: UpdateGangPositioningParams): Promise<UpdateGangPositioningResult> {
  const result = await updateGangPositioningServer(params);
  
  if (result.success) {
    return { success: true };
  } else {
    return {
      success: false,
      error: result.error
    };
  }
}