'use server'

import { createClient } from "@/utils/supabase/server";
import { createGangLog, GangLogActionResult } from "./gang-logs";

export interface GangResourceState {
  gang_id: string;
  credits?: number;
  reputation?: number;
  meat?: number;
  scavenging_rolls?: number;
  exploration_points?: number;
  power?: number;
  sustenance?: number;
  salvage?: number;
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

    // Log credits changes
    if (oldState.credits !== undefined && newState.credits !== undefined && 
        oldState.credits !== newState.credits) {
      const actionType = newState.credits > oldState.credits ? 'Credits earned' : 'Credits spent';
      const description = newState.credits > oldState.credits
        ? `Credits increased from ${oldState.credits} to ${newState.credits}`
        : `Credits decreased from ${oldState.credits} to ${newState.credits}`;
      
      logPromises.push(createGangLog({
        gang_id,
        action_type: actionType,
        description,
        user_id
      }));
    }

    // Log reputation changes
    if (oldState.reputation !== undefined && newState.reputation !== undefined && 
        oldState.reputation !== newState.reputation) {
      const actionType = newState.reputation > oldState.reputation ? 'Reputation gained' : 'Reputation lost';
      const description = newState.reputation > oldState.reputation
        ? `Reputation increased from ${oldState.reputation} to ${newState.reputation}`
        : `Reputation decreased from ${oldState.reputation} to ${newState.reputation}`;
      
      logPromises.push(createGangLog({
        gang_id,
        action_type: actionType,
        description,
        user_id
      }));
    }

    // Log meat changes
    if (oldState.meat !== undefined && newState.meat !== undefined && 
        oldState.meat !== newState.meat) {
      const actionType = newState.meat > oldState.meat ? 'Meat gained' : 'Meat consumed';
      const description = newState.meat > oldState.meat
        ? `Meat increased from ${oldState.meat} to ${newState.meat}`
        : `Meat decreased from ${oldState.meat} to ${newState.meat}`;
      
      logPromises.push(createGangLog({
        gang_id,
        action_type: actionType,
        description,
        user_id
      }));
    }

    // Log scavenging rolls changes
    if (oldState.scavenging_rolls !== undefined && newState.scavenging_rolls !== undefined && 
        oldState.scavenging_rolls !== newState.scavenging_rolls) {
      const actionType = newState.scavenging_rolls > oldState.scavenging_rolls 
        ? 'Scavenging rolls gained' 
        : 'Scavenging rolls spent';
      const description = newState.scavenging_rolls > oldState.scavenging_rolls
        ? `Scavenging rolls increased from ${oldState.scavenging_rolls} to ${newState.scavenging_rolls}`
        : `Scavenging rolls decreased from ${oldState.scavenging_rolls} to ${newState.scavenging_rolls}`;
      
      logPromises.push(createGangLog({
        gang_id,
        action_type: actionType,
        description,
        user_id
      }));
    }

    // Log exploration points changes
    if (oldState.exploration_points !== undefined && newState.exploration_points !== undefined && 
        oldState.exploration_points !== newState.exploration_points) {
      const actionType = newState.exploration_points > oldState.exploration_points 
        ? 'Exploration points gained' 
        : 'Exploration points spent';
      const description = newState.exploration_points > oldState.exploration_points
        ? `Exploration points increased from ${oldState.exploration_points} to ${newState.exploration_points}`
        : `Exploration points decreased from ${oldState.exploration_points} to ${newState.exploration_points}`;
      
      logPromises.push(createGangLog({
        gang_id,
        action_type: actionType,
        description,
        user_id
      }));
    }

    // Log power changes
    if (oldState.power !== undefined && newState.power !== undefined && 
        oldState.power !== newState.power) {
      const actionType = newState.power > oldState.power ? 'Power gained' : 'Power spent';
      const description = newState.power > oldState.power
        ? `Power increased from ${oldState.power} to ${newState.power}`
        : `Power decreased from ${oldState.power} to ${newState.power}`;
      
      logPromises.push(createGangLog({
        gang_id,
        action_type: actionType,
        description,
        user_id
      }));
    }

    // Log sustenance changes
    if (oldState.sustenance !== undefined && newState.sustenance !== undefined && 
        oldState.sustenance !== newState.sustenance) {
      const actionType = newState.sustenance > oldState.sustenance ? 'Sustenance gained' : 'Sustenance spent';
      const description = newState.sustenance > oldState.sustenance
        ? `Sustenance increased from ${oldState.sustenance} to ${newState.sustenance}`
        : `Sustenance decreased from ${oldState.sustenance} to ${newState.sustenance}`;
      
      logPromises.push(createGangLog({
        gang_id,
        action_type: actionType,
        description,
        user_id
      }));
    }

    // Log salvage changes
    if (oldState.salvage !== undefined && newState.salvage !== undefined && 
        oldState.salvage !== newState.salvage) {
      const actionType = newState.salvage > oldState.salvage ? 'Salvage gained' : 'Salvage spent';
      const description = newState.salvage > oldState.salvage
        ? `Salvage increased from ${oldState.salvage} to ${newState.salvage}`
        : `Salvage decreased from ${oldState.salvage} to ${newState.salvage}`;
      
      logPromises.push(createGangLog({
        gang_id,
        action_type: actionType,
        description,
        user_id
      }));
    }

    // Execute all log promises
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

