'use server'

import { createGangLog, GangLogActionResult } from "./gang-logs";
import { formatFinancialChanges } from "./log-helpers";

export interface GangResourceState {
  [resourceName: string]: number;
}

export interface LogGangResourceChangesParams {
  gang_id: string;
  oldState: GangResourceState;
  newState: GangResourceState;
  user_id?: string;
  /** Optional per-resource reasons keyed by the same names used in oldState/newState */
  reasons?: Record<string, string>;
}

function capitalizeResourceName(resourceName: string): string {
  return resourceName.charAt(0).toUpperCase() + resourceName.slice(1);
}

/** First line only: "Reputation increased by 5 (reason)" */
function formatResourceDeltaSummary(
  displayName: string,
  oldValue: number,
  newValue: number,
  reason?: string
): string {
  const delta = Math.abs(newValue - oldValue);
  const direction = newValue > oldValue ? 'increased' : 'decreased';
  return reason
    ? `${displayName} ${direction} by ${delta} (${reason})`
    : `${displayName} ${direction} by ${delta}`;
}

/**
 * Two-line resource change description, e.g.:
 * Reputation increased by 5 (reason)
 * Reputation: 10 → 15
 */
function formatResourceChangeDescription(
  displayName: string,
  oldValue: number,
  newValue: number,
  reason?: string
): string {
  const summary = formatResourceDeltaSummary(displayName, oldValue, newValue, reason);
  return `${summary}\n${displayName}: ${oldValue} → ${newValue}`;
}

export async function logGangResourceChanges(params: LogGangResourceChangesParams): Promise<GangLogActionResult> {
  try {
    const { gang_id, oldState, newState, user_id, reasons } = params;
    const logPromises: Promise<GangLogActionResult>[] = [];

    // Check if credits, rating, or wealth changed - use new format
    const oldCredits = oldState['credits'];
    const newCredits = newState['credits'];
    const oldRating = oldState['rating'];
    const newRating = newState['rating'];
    const oldWealth = oldState['wealth'];
    const newWealth = newState['wealth'];

    const hasFinancialChange = (oldCredits !== undefined && newCredits !== undefined && oldCredits !== newCredits) ||
                               (oldRating !== undefined && newRating !== undefined && oldRating !== newRating) ||
                               (oldWealth !== undefined && newWealth !== undefined && oldWealth !== newWealth);

    if (hasFinancialChange &&
        oldCredits !== undefined && newCredits !== undefined &&
        oldRating !== undefined && newRating !== undefined &&
        oldWealth !== undefined && newWealth !== undefined) {
      const financialChanges = formatFinancialChanges(
        oldCredits,
        newCredits,
        oldRating,
        newRating,
        oldWealth,
        newWealth
      );

      // Determine action type based on credits change direction
      let actionType = 'credits_changed';
      if (newCredits > oldCredits) {
        actionType = 'credits_earned';
      } else if (newCredits < oldCredits) {
        actionType = 'credits_spent';
      }

      let description = financialChanges;
      if (oldCredits !== newCredits) {
        const summary = formatResourceDeltaSummary(
          'Credits',
          oldCredits,
          newCredits,
          reasons?.['credits']
        );
        description = `${summary}\n${financialChanges}`;
      }

      logPromises.push(createGangLog({
        gang_id,
        action_type: actionType,
        description,
        user_id
      }));
    }

    // Get all unique resource keys from both states (excluding financial fields)
    const financialFields = ['credits', 'rating', 'wealth'];
    const allKeys = Array.from(new Set([...Object.keys(oldState), ...Object.keys(newState)]))
      .filter(key => !financialFields.includes(key));

    for (const resourceName of allKeys) {
      const oldValue = oldState[resourceName] ?? 0;
      const newValue = newState[resourceName] ?? 0;

      if (oldValue !== newValue) {
        const increased = newValue > oldValue;
        const capitalizedName = capitalizeResourceName(resourceName);
        const actionType = `${capitalizedName} ${increased ? 'gained' : 'spent'}`;

        logPromises.push(createGangLog({
          gang_id,
          action_type: actionType,
          description: formatResourceChangeDescription(
            capitalizedName,
            oldValue,
            newValue,
            reasons?.[resourceName]
          ),
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
