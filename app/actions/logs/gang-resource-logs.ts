'use server'

import { createClient } from "@/utils/supabase/server";
import { createGangLog, GangLogActionResult } from "./gang-logs";

export interface GangResourceState {
  [resourceName: string]: number;
}

export interface LogGangResourceChangesParams {
  gang_id: string;
  oldState: GangResourceState;
  newState: GangResourceState;
  user_id?: string;
}

export async function logGangResourceChanges(params: LogGangResourceChangesParams): Promise<GangLogActionResult> {
  try {
    const { gang_id, oldState, newState, user_id } = params;
    const logPromises: Promise<GangLogActionResult>[] = [];

    // Get all unique resource keys from both states
    const allKeys = Array.from(new Set([...Object.keys(oldState), ...Object.keys(newState)]));

    for (const resourceName of allKeys) {
      const oldValue = oldState[resourceName] ?? 0;
      const newValue = newState[resourceName] ?? 0;

      if (oldValue !== newValue) {
        const increased = newValue > oldValue;
        const actionType = `${resourceName} ${increased ? 'gained' : 'spent'}`;
        const description = `${resourceName} ${increased ? 'increased' : 'decreased'} from ${oldValue} to ${newValue}`;

        logPromises.push(createGangLog({
          gang_id,
          action_type: actionType,
          description,
          user_id
        }));
      }
    }

    // Execute all log promises in parallel
    if (logPromises.length > 0) {
      const results = await Promise.all(logPromises);
      
      // Check if any failed
      const failed = results.find(r => !r.success);
      if (failed) {
        console.error('Some gang resource logs failed:', failed.error);
        return {
          success: false,
          error: 'Some resource changes failed to log'
        };
      }
    }

    return { 
      success: true 
    };

  } catch (error) {
    console.error('Error in logGangResourceChanges:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to log gang resource changes'
    };
  }
}
