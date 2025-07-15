'use client';

import React, { useState, useEffect } from 'react';
import { Input } from '../ui/input';
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import Modal from '@/components/modal';
import DeleteGangButton from "./delete-gang-button";
import { useToast } from "@/components/ui/use-toast";
import { HexColorPicker } from "react-colorful";
import { allianceRank } from "@/utils/allianceRank";
import { gangVariantRank } from "@/utils/gangVariantRank";

interface GangUpdates {
  name: string;
  credits: number;
  credits_operation: 'add' | 'subtract';
  alignment: string;
  alliance_id: string | null;
  reputation: number;
  reputation_operation: 'add' | 'subtract';
  meat: number;
  scavenging_rolls: number;
  exploration_points: number;
  gang_variants: string[];
  gang_colour: string;
}

interface Campaign {
  has_meat: boolean;
  has_scavenging_rolls: boolean;
  has_exploration_points: boolean;
}

interface GangEditModalProps {
  // Modal control
  isOpen: boolean;
  onClose: () => void;
  
  // Gang data
  gangId: string;
  gangName: string;
  credits: number;
  reputation: number;
  meat: number;
  scavengingRolls: number;
  explorationPoints: number;
  alignment: string;
  allianceId: string | null;
  allianceName: string;
  gangColour: string;
  gangVariants: Array<{id: string, variant: string}>;
  availableVariants: Array<{id: string, variant: string}>;
  
  // Campaign features
  campaigns?: Campaign[];
  
  // Callbacks
  onSave: (updates: GangUpdates) => Promise<boolean>;
}

/**
 * Gang Edit Modal Component
 * 
 * Extracted from gang.tsx to improve component maintainability.
 * Handles all gang editing functionality including:
 * - Basic gang info (name, credits, reputation)
 * - Alignment and alliance management
 * - Gang variants selection
 * - Colour picker
 * - Campaign-specific resources (meat, scavenging rolls, exploration points)
 */
export default function GangEditModal({
  isOpen,
  onClose,
  gangId,
  gangName,
  credits,
  reputation,
  meat,
  scavengingRolls,
  explorationPoints,
  alignment,
  allianceId,
  allianceName,
  gangColour,
  gangVariants,
  availableVariants,
  campaigns,
  onSave
}: GangEditModalProps) {
  const { toast } = useToast();
  
  // Internal modal state
  const [editedName, setEditedName] = useState(gangName);
  const [editedCredits, setEditedCredits] = useState('');
  const [editedReputation, setEditedReputation] = useState('');
  const [editedMeat, setEditedMeat] = useState(meat.toString());
  const [editedScavengingRolls, setEditedScavengingRolls] = useState(scavengingRolls.toString());
  const [editedExplorationPoints, setEditedExplorationPoints] = useState(explorationPoints.toString());
  const [editedAlignment, setEditedAlignment] = useState(alignment);
  const [editedAllianceId, setEditedAllianceId] = useState(allianceId || '');
  const [editedGangColour, setEditedGangColour] = useState(gangColour);
  const [editedGangIsVariant, setEditedGangIsVariant] = useState(gangVariants.length > 0);
  const [editedGangVariants, setEditedGangVariants] = useState<Array<{id: string, variant: string}>>(gangVariants);
  
  // Alliance management state
  const [allianceList, setAllianceList] = useState<Array<{id: string, alliance_name: string, strong_alliance: string}>>([]);
  const [allianceListLoaded, setAllianceListLoaded] = useState(false);
  
  
  // Colour picker modal state
  const [showColourPickerModal, setShowColourPickerModal] = useState(false);
  
  // Initialize form data when modal opens
  useEffect(() => {
    if (isOpen) {
      setEditedName(gangName);
      setEditedCredits('');
      setEditedReputation('');
      setEditedMeat(meat.toString());
      setEditedScavengingRolls(scavengingRolls.toString());
      setEditedExplorationPoints(explorationPoints.toString());
      setEditedAlignment(alignment);
      setEditedAllianceId(allianceId || '');
      setEditedGangColour(gangColour);
      setEditedGangIsVariant(gangVariants.length > 0);
      setEditedGangVariants([...gangVariants]);
    }
  }, [isOpen, gangName, meat, scavengingRolls, explorationPoints, alignment, allianceId, gangColour, gangVariants]);

  const fetchAlliances = async () => {
    if (allianceListLoaded) return;
    
    try {
      const response = await fetch('/api/alliances');
      if (!response.ok) throw new Error('Failed to fetch alliances');
      const data = await response.json();
      setAllianceList(data);
      setAllianceListLoaded(true);
    } catch (error) {
      console.error('Error fetching alliances:', error);
      toast({
        description: 'Failed to load alliances',
        variant: "destructive"
      });
    }
  };


  const syncGangVariantsWithAlignment = (newAlignment: string) => {
    const outlaw = availableVariants.find(v => v.variant === 'Outlaw');
    const hasOutlaw = editedGangVariants.some(v => v.variant === 'Outlaw');

    if (newAlignment === 'Outlaw' && outlaw && !hasOutlaw) {
      setEditedGangVariants(prev => [...prev, outlaw]);
    } else if (newAlignment === 'Law Abiding' && hasOutlaw) {
      setEditedGangVariants(prev => prev.filter(v => v.variant !== 'Outlaw'));
    }
  };

  const handleAlignmentChange = (value: string) => {
    setEditedAlignment(value);
    syncGangVariantsWithAlignment(value);
  };

  const handleSave = async () => {
    try {
      const creditsDifference = parseInt(editedCredits) || 0;
      const reputationDifference = parseInt(editedReputation) || 0;

      const updates: GangUpdates = {
        name: editedName,
        credits: Math.abs(creditsDifference),
        credits_operation: creditsDifference >= 0 ? 'add' : 'subtract',
        alignment: editedAlignment,
        alliance_id: editedAllianceId === '' ? null : editedAllianceId,
        reputation: Math.abs(reputationDifference),
        reputation_operation: reputationDifference >= 0 ? 'add' : 'subtract',
        meat: parseInt(editedMeat),
        scavenging_rolls: parseInt(editedScavengingRolls),
        exploration_points: parseInt(editedExplorationPoints),
        gang_variants: editedGangVariants.map(v => v.id),
        gang_colour: editedGangColour,
      };

      const success = await onSave(updates);
      
      if (success) {
        toast({
          description: "Gang updated successfully",
          variant: "default"
        });
        
        onClose();
        setEditedCredits('');
        setEditedReputation('');
      }
    } catch (error) {
      console.error('Error updating gang:', error);
      toast({
        title: "Error",
        description: "Failed to update gang. Please try again.",
        variant: "destructive"
      });
    }
  };

  const editModalContent = (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">Gang Name</p>
        <Input
          type="text"
          value={editedName}
          onChange={(e) => setEditedName(e.target.value)}
          className="w-full"
          placeholder="Gang name"
        />
      </div>

      <div className="flex flex-row gap-4">
        {/* Alignment Section */}
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium">Alignment</p>
          <select
            value={editedAlignment || ''}
            onChange={(e) => handleAlignmentChange(e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="">Select Alignment</option>
            <option value="Law Abiding">Law Abiding</option>
            <option value="Outlaw">Outlaw</option>
          </select>
        </div>

        {/* Gang Colour Section */}
        <div className="space-y-2">
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm font-medium">Gang Colour</p>
            <div
              className="w-8 h-8 rounded-full border border-black border-2 cursor-pointer"
              style={{ backgroundColor: editedGangColour }}
              title="Click to change colour"
              onClick={() => setShowColourPickerModal(true)}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Credits</p>
        <Input
          type="tel"
          inputMode="url"
          pattern="-?[0-9]+"
          value={editedCredits}
          onChange={(e) => {
            const value = e.target.value;
            setEditedCredits(value);
          }}
          className="flex-1"
          placeholder="Add or remove credits (e.g. 25 or -50)"
        />
        <p className="text-sm text-gray-500">
          Current credits: {credits}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Reputation</p>
        <Input
          type="tel"
          inputMode="url"
          pattern="-?[0-9]+"
          value={editedReputation}
          onChange={(e) => setEditedReputation(e.target.value)}
          className="flex-1"
          placeholder="Add or remove reputation (e.g. 1 or -2)"
        />
        <p className="text-sm text-gray-500">
          Current reputation: {reputation}
        </p>
      </div>

      {campaigns?.[0]?.has_exploration_points && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Exploration Points
          </label>
          <Input
            type="tel"
            inputMode="url"
            pattern="-?[0-9]+"
            value={editedExplorationPoints}
            onChange={(e) => setEditedExplorationPoints(e.target.value)}
          />
        </div>
      )}

      {campaigns?.[0]?.has_meat && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Meat
          </label>
          <Input
            type="tel"
            inputMode="url"
            pattern="-?[0-9]+"
            value={editedMeat}
            onChange={(e) => setEditedMeat(e.target.value)}
          />
        </div>
      )}
      
      {campaigns?.[0]?.has_scavenging_rolls && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Scavenging Rolls
          </label>
          <Input
            type="tel"
            inputMode="url"
            pattern="-?[0-9]+"
            value={editedScavengingRolls}
            onChange={(e) => setEditedScavengingRolls(e.target.value)}
          />
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Alliance</p>
        <select
          value={editedAllianceId || ""}
          onChange={(e) => setEditedAllianceId(e.target.value)}
          onFocus={fetchAlliances}
          className="w-full p-2 border rounded-md"
        >
          {/* Default "None" option */}
          <option value="">None</option>

          {/* Display alliances after they are loaded */}
          {allianceListLoaded ? (
            Object.entries(
              allianceList
                .sort((a, b) => {
                  const rankA = allianceRank[a.alliance_name.toLowerCase()] ?? Infinity;
                  const rankB = allianceRank[b.alliance_name.toLowerCase()] ?? Infinity;
                  return rankA - rankB;
                })
                .reduce((groups, type) => {
                  const rank = allianceRank[type.alliance_name.toLowerCase()] ?? Infinity;
                  let groupLabel = "Other Alliances"; // Default category for unlisted alliances

                  if (rank <= 9) groupLabel = "Criminal Organisations";
                  else if (rank <= 19) groupLabel = "Merchant Guilds";
                  else if (rank <= 29) groupLabel = "Noble Houses";

                  if (!groups[groupLabel]) groups[groupLabel] = [];
                  groups[groupLabel].push(type);
                  return groups;
                }, {} as Record<string, typeof allianceList>)
            ).map(([groupLabel, allianceList]) => (
              <optgroup key={groupLabel} label={groupLabel}>
                {allianceList.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.alliance_name}
                  </option>
                ))}
              </optgroup>
            ))
          ) : (
            <>
              {allianceId && <option value={allianceId}>{allianceName}</option>}
              <option value="" disabled>Loading Alliances...</option>
            </>
          )}
        </select>
      </div>

      <div className="mt-4">
        <div className="flex items-center space-x-2">
          <label htmlFor="variant-toggle" className="text-sm font-medium">
            Gang Variants
          </label>
          <Switch
            id="variant-toggle"
            checked={editedGangIsVariant}
            onCheckedChange={setEditedGangIsVariant}
          />
        </div>

        {editedGangIsVariant && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ">
            {/* Unaffiliated variants */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Unaffiliated</h3>
              <div className="flex flex-col gap-2">
                {availableVariants
                  .filter(v => (gangVariantRank[v.variant.toLowerCase()] ?? Infinity) <= 9)
                  .sort((a, b) =>
                    (gangVariantRank[a.variant.toLowerCase()] ?? Infinity) -
                    (gangVariantRank[b.variant.toLowerCase()] ?? Infinity)
                  )
                  .map((variant, index, arr) => (
                    <React.Fragment key={variant.id}>
                      {/* Insert separator before 'skirmish' */}
                      {variant.variant.toLowerCase() === "skirmish" && (
                        <div className="border-t border-gray-300" />
                      )}
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`variant-${variant.id}`}
                          checked={editedGangVariants.some(v => v.id === variant.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setEditedGangVariants(prev => [...prev, variant]);
                            } else {
                              setEditedGangVariants(prev => prev.filter(v => v.id !== variant.id));
                            }
                          }}
                        />
                        <label htmlFor={`variant-${variant.id}`} className="text-sm cursor-pointer">
                          {variant.variant}
                        </label>
                      </div>
                    </React.Fragment>
                  ))}
              </div>
            </div>

            {/* Outlaw/Corrupted variants*/}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Outlaw / Corrupted</h3>
              <div className="flex flex-col gap-2">
                {availableVariants
                  .filter(v => (gangVariantRank[v.variant.toLowerCase()] ?? -1) >= 10)
                  .sort((a, b) =>
                    (gangVariantRank[a.variant.toLowerCase()] ?? Infinity) -
                    (gangVariantRank[b.variant.toLowerCase()] ?? Infinity)
                  )
                  .map(variant => (
                    <div key={variant.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`variant-${variant.id}`}
                        checked={editedGangVariants.some(v => v.id === variant.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setEditedGangVariants(prev => [...prev, variant]);
                          } else {
                            setEditedGangVariants(prev => prev.filter(v => v.id !== variant.id));
                          }
                        }}
                      />
                      <label htmlFor={`variant-${variant.id}`} className="text-sm cursor-pointer">
                        {variant.variant}
                      </label>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
      
      <DeleteGangButton gangId={gangId} />
    </div>
  );

  return (
    <>
      {isOpen && (
        <Modal
          title="Edit Gang"
          content={editModalContent}
          onClose={() => {
            onClose();
            setEditedCredits('');
          }}
          onConfirm={handleSave}
          confirmText="Save Changes"
        />
      )}

      {showColourPickerModal && (
        <Modal
          title="Select Gang Colour"
          helper="This sets your gang's appearance in a campaign."
          onClose={() => setShowColourPickerModal(false)}
          onConfirm={() => setShowColourPickerModal(false)}
          confirmText="Close"
          content={
            <div className="space-y-4">
              <div className="flex justify-center">
                <HexColorPicker color={editedGangColour} onChange={setEditedGangColour} />
              </div>
              <div className="flex justify-center">
                <input
                  type="text"
                  value={editedGangColour}
                  onChange={(e) => {
                    const val = e.target.value;
                    // Allow only valid 7-character hex strings starting with "#"
                    if (/^#([0-9A-Fa-f]{0,6})$/.test(val)) {
                      setEditedGangColour(val);
                    }
                  }}
                  className="w-32 text-center font-mono border rounded p-1 text-sm"
                  maxLength={7}
                  placeholder="#ffffff"
                />
              </div>
              <div className="flex justify-center">
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100"
                  style={{ color: editedGangColour }}
                >
                  {gangName}
                </span>
              </div>
            </div>
          }
        />
      )}
    </>
  );
}