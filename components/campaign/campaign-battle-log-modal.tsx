"use client"

import { useState, useEffect } from "react";
import Modal from "@/components/modal";
import { useToast } from "@/components/ui/use-toast";

interface Scenario {
  id: string;
  scenario_name: string;
  scenario_number: number | null;
}

interface CampaignGang {
  id: string;
  name: string;
}

interface CampaignBattleLogModalProps {
  campaignId: string;
  availableGangs: CampaignGang[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CampaignBattleLogModal = ({
  campaignId,
  availableGangs,
  isOpen,
  onClose,
  onSuccess
}: CampaignBattleLogModalProps) => {
  const [selectedScenario, setSelectedScenario] = useState('');
  const [selectedAttacker, setSelectedAttacker] = useState('');
  const [selectedDefender, setSelectedDefender] = useState('');
  const [selectedWinner, setSelectedWinner] = useState('');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [isLoadingBattleData, setIsLoadingBattleData] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      loadBattleData();
    }
  }, [isOpen, campaignId]);

  const loadBattleData = async () => {
    setIsLoadingBattleData(true);
    try {
      const response = await fetch('/api/campaigns/battles', {
        headers: {
          'X-Campaign-Id': campaignId
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch battle data');
      
      const data = await response.json();
      // Sort scenarios by scenario_number
      const sortedScenarios = [...data.scenarios].sort((a, b) =>
        a.scenario_number - b.scenario_number
      );
      setScenarios(sortedScenarios);
    } catch (error) {
      console.error('Error loading battle data:', error);
      toast({
        variant: "destructive",
        description: "Failed to load battle data"
      });
    } finally {
      setIsLoadingBattleData(false);
    }
  };

  const handleAddBattle = async () => {
    if (!selectedScenario || !selectedAttacker || !selectedDefender || !selectedWinner) {
      toast({
        variant: "destructive",
        description: "Please fill in all fields"
      });
      return false;
    }

    try {
      const response = await fetch('/api/campaigns/battles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Campaign-Id': campaignId
        },
        body: JSON.stringify({
          scenario_id: selectedScenario,
          attacker_id: selectedAttacker,
          defender_id: selectedDefender,
          winner_id: selectedWinner
        }),
      });

      if (!response.ok) throw new Error('Failed to create battle log');

      onSuccess();
      toast({
        description: "Battle log added successfully"
      });
      resetForm();
      return false;
    } catch (error) {
      console.error('Error creating battle log:', error);
      toast({
        variant: "destructive",
        description: "Failed to create battle log"
      });
      return false;
    }
  };

  const resetForm = () => {
    setSelectedScenario('');
    setSelectedAttacker('');
    setSelectedDefender('');
    setSelectedWinner('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal
      title="Add Battle Log"
      content={
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Scenario
            </label>
            <select 
              className="w-full px-3 py-2 rounded-md border border-gray-300"
              value={selectedScenario}
              onChange={(e) => setSelectedScenario(e.target.value)}
              disabled={isLoadingBattleData}
            >
              <option value="">Select scenario</option>
              {scenarios.map(scenario => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.scenario_number}. {scenario.scenario_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Attacker
            </label>
            <select 
              className="w-full px-3 py-2 rounded-md border border-gray-300"
              value={selectedAttacker}
              onChange={(e) => setSelectedAttacker(e.target.value)}
              disabled={isLoadingBattleData}
            >
              <option value="">Select gang</option>
              {availableGangs.map(gang => (
                <option key={gang.id} value={gang.id}>
                  {gang.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Defender
            </label>
            <select 
              className="w-full px-3 py-2 rounded-md border border-gray-300"
              value={selectedDefender}
              onChange={(e) => setSelectedDefender(e.target.value)}
              disabled={isLoadingBattleData}
            >
              <option value="">Select gang</option>
              {availableGangs.map(gang => (
                <option key={gang.id} value={gang.id}>
                  {gang.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Winner
            </label>
            <select 
              className="w-full px-3 py-2 rounded-md border border-gray-300"
              value={selectedWinner}
              onChange={(e) => setSelectedWinner(e.target.value)}
              disabled={isLoadingBattleData}
            >
              <option value="">Select gang</option>
              {availableGangs.map(gang => (
                <option key={gang.id} value={gang.id}>
                  {gang.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      }
      onClose={handleClose}
      onConfirm={handleAddBattle}
      confirmText="Save"
    />
  );
};

export default CampaignBattleLogModal; 