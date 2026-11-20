'use server'

import { createClient } from "@/utils/supabase/server";
import { createGangLog, GangLogActionResult } from "./gang-logs";
import { formatFinancialChanges, formatXpBreakdown } from "./log-helpers";
import { downtimePhaseName } from "@/types/edition";

export interface FighterLogParams {
  gang_id: string;
  fighter_id: string;
  fighter_name: string;
  action_type: 'fighter_added' | 'fighter_removed' | 'fighter_killed' | 'fighter_resurrected' | 'fighter_retired' | 'fighter_unretired' | 'fighter_enslaved' |
              'fighter_xp_changed' | 'fighter_total_xp_changed' | 'fighter_starting_xp_changed' | 'fighter_OOA_changed' | 'fighter_kills_changed' | 'fighter_kill_count_changed' | 'fighter_cost_adjusted' |
              'fighter_rescued' | 'fighter_starved' | 'fighter_fed' | 'fighter_captured' | 'fighter_released' | 'fighter_copied' |
              'fighter_promoted' | 'rig_glitches_cleared_downtime';
  user_id?: string;
  old_value?: number | string;
  new_value?: number | string;
  fighter_credits?: number;
  status_reason?: 'killed' | 'retired' | 'enslaved' | null;
  source_fighter_name?: string;
  copy_type?: 'base' | 'experienced';
  /** XP breakdown by case id (e.g. { seriousInjury: 2, outOfAction: 2 }) - for rich XP log format */
  xp_breakdown?: Record<string, number>;
  /** Optional note for Misc. XP - appended to Misc. in breakdown when present */
  xp_misc_note?: string;
  /** OOA/kills values for combined XP+OOA log line */
  old_ooa?: number;
  new_ooa?: number;
  /** XP values for the summary line of a Starting XP change, which moves XP with it */
  old_xp?: number;
  new_xp?: number;
  /** What a promotion changed (e.g. "Subtypes: Ganger → Champion"), for the summary line */
  promotion_changes?: string[];
  /** Gang's edition, for descriptions whose wording the edition renames. */
  edition_slug?: string | null;
  oldCredits?: number;
  oldRating?: number;
  oldWealth?: number;
  newCredits?: number;
  newRating?: number;
  newWealth?: number;
}

export async function logFighterAction(params: FighterLogParams): Promise<GangLogActionResult> {
  try {
    const supabase = await createClient();

    // Format financial changes if provided
    let financialChanges = '';
    if (params.oldCredits !== undefined && params.newCredits !== undefined &&
        params.oldRating !== undefined && params.newRating !== undefined &&
        params.oldWealth !== undefined && params.newWealth !== undefined) {
      const formatted = formatFinancialChanges(
        params.oldCredits,
        params.newCredits,
        params.oldRating,
        params.newRating,
        params.oldWealth,
        params.newWealth
      );
      if (formatted) {
        financialChanges = '\n' + formatted;
      }
    }

    // Generate description based on action type
    let description: string;

    switch (params.action_type) {
      case 'fighter_added':
        description = `Added fighter "${params.fighter_name}" (${params.fighter_credits || 0} credits).${financialChanges}`;
        break;
      case 'fighter_removed':
        const statusSuffix = params.status_reason ? ` (${params.status_reason})` : '';
        description = `Removed fighter "${params.fighter_name}" (${params.fighter_credits || 0} credits)${statusSuffix}.${financialChanges}`;
        break;
      case 'fighter_killed':
        description = `Fighter "${params.fighter_name}" was killed.${financialChanges}`;
        break;
      case 'fighter_resurrected':
        description = `Fighter "${params.fighter_name}" was resurrected.${financialChanges}`;
        break;
      case 'fighter_retired':
        description = `Fighter "${params.fighter_name}" retired.${financialChanges}`;
        break;
      case 'fighter_unretired':
        description = `Fighter "${params.fighter_name}" came out of retirement.${financialChanges}`;
        break;
      case 'fighter_enslaved':
        description = `Fighter "${params.fighter_name}" was enslaved.${financialChanges}`;
        break;
      case 'fighter_xp_changed': {
        const oldXp = Number(params.old_value ?? 0);
        const newXp = Number(params.new_value ?? 0);
        const delta = newXp - oldXp;
        const breakdown = params.xp_breakdown && Object.keys(params.xp_breakdown).length > 0
          ? formatXpBreakdown(params.xp_breakdown, params.xp_misc_note)
          : '';
        if (delta > 0 && breakdown) {
          const gainLine = `Fighter "${params.fighter_name}" gained ${delta} XP (${breakdown})`;
          const summaryParts: string[] = [`XP: ${oldXp} → ${newXp}`];
          if (params.old_ooa !== undefined && params.new_ooa !== undefined && params.old_ooa !== params.new_ooa) {
            summaryParts.push(`OOA: ${params.old_ooa} → ${params.new_ooa}`);
          }
          description = summaryParts.length > 1
            ? `${gainLine}\n${summaryParts.join(' | ')}`
            : `${gainLine}\n${summaryParts[0]}`;
        } else if (delta < 0) {
          const loseLine = `Fighter "${params.fighter_name}" lost ${Math.abs(delta)} XP`;
          const summaryParts: string[] = [`XP: ${oldXp} → ${newXp}`];
          if (params.old_ooa !== undefined && params.new_ooa !== undefined && params.old_ooa !== params.new_ooa) {
            summaryParts.push(`OOA: ${params.old_ooa} → ${params.new_ooa}`);
          }
          description = summaryParts.length > 1
            ? `${loseLine}\n${summaryParts.join(' | ')}`
            : `${loseLine}\n${summaryParts[0]}`;
        } else {
          description = `Fighter "${params.fighter_name}" XP changed from ${oldXp} to ${newXp}`;
        }
        break;
      }
      case 'fighter_total_xp_changed':
        description = `Fighter "${params.fighter_name}" total XP changed from ${params.old_value || 0} to ${params.new_value || 0}`;
        break;
      case 'fighter_starting_xp_changed': {
        const oldStartingXp = params.old_value ?? 'N/A';
        const newStartingXp = params.new_value ?? 'N/A';
        const summaryParts: string[] = [`Starting XP: ${oldStartingXp} → ${newStartingXp}`];
        if (params.old_xp !== undefined && params.new_xp !== undefined && params.old_xp !== params.new_xp) {
          summaryParts.push(`XP: ${params.old_xp} → ${params.new_xp}`);
        }
        description = `Fighter "${params.fighter_name}" Starting XP has been set to ${newStartingXp}\n${summaryParts.join(' | ')}`;
        break;
      }
      case 'fighter_kills_changed':
      case 'fighter_OOA_changed': {
        const oldOoa = params.old_value ?? 0;
        const newOoa = params.new_value ?? 0;
        description = `Fighter "${params.fighter_name}" OOA count has been set to ${newOoa}\nOOA: ${oldOoa} → ${newOoa}`;
        break;
      }
      case 'fighter_kill_count_changed':
        description = `Fighter "${params.fighter_name}" kill count changed from ${params.old_value || 0} to ${params.new_value || 0}`;
        break;
      case 'fighter_cost_adjusted':
        description = `Fighter "${params.fighter_name}" cost adjustment changed from ${params.old_value || 0} to ${params.new_value || 0} credits.${financialChanges}`;
        break;
      case 'fighter_rescued':
        description = `Fighter "${params.fighter_name}" was rescued from enslavement.${financialChanges}`;
        break;
      case 'fighter_starved':
        description = `Fighter "${params.fighter_name}" was starved.${financialChanges}`;
        break;
      case 'fighter_fed':
        description = `Fighter "${params.fighter_name}" was fed (1 meat consumed).${financialChanges}`;
        break;
      case 'fighter_captured':
        description = `Fighter "${params.fighter_name}" was captured.${financialChanges}`;
        break;
      case 'fighter_released':
        description = `Fighter "${params.fighter_name}" was released from captivity.${financialChanges}`;
        break;
      case 'fighter_promoted':
        description = `Fighter "${params.fighter_name}" promoted`;
        if (params.promotion_changes?.length) {
          description += `\n${params.promotion_changes.join(' | ')}`;
        }
        break;
      case 'rig_glitches_cleared_downtime':
        description = `Fighter "${params.fighter_name}" cleared ${params.old_value} rig glitch${Number(params.old_value) !== 1 ? 'es' : ''} via ${downtimePhaseName(params.edition_slug)}.${financialChanges}`;
        break;
      case 'fighter_copied':
        const copyTypeLabel = params.copy_type === 'experienced' ? 'experienced fighter' : 'base fighter';
        const sourceInfo = params.source_fighter_name ? ` from "${params.source_fighter_name}"` : '';
        description = `Copied ${copyTypeLabel} "${params.fighter_name}"${sourceInfo} (${params.fighter_credits || 0} credits).${financialChanges}`;
        break;
      default:
        throw new Error(`Unknown fighter action type: ${params.action_type}`);
    }

    return await createGangLog({
      gang_id: params.gang_id,
      action_type: params.action_type,
      description: description,
      fighter_id: params.fighter_id,
      user_id: params.user_id
    });

  } catch (error) {
    console.error('Error in logFighterAction:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to log fighter action'
    };
  }
}
