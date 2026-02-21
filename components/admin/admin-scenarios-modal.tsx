'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from 'sonner';

enum OperationType {
  POST = 'POST',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE'
}

interface Scenario {
  id: string;
  scenario_name: string;
  scenario_number: number;
}

interface AdminScenariosModalProps {
  onClose: () => void;
  onSubmit?: () => void;
}

export function AdminScenariosModal({ onClose, onSubmit }: AdminScenariosModalProps) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState('');
  const [scenarioName, setScenarioName] = useState('');
  const [scenarioNumber, setScenarioNumber] = useState<number | ''>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);

  

  useEffect(() => {
    fetchScenarios();
  }, []);

  const fetchScenarios = async () => {
    try {
      const response = await fetch('/api/admin/scenarios');
      if (!response.ok) throw new Error('Failed to fetch scenarios');
      const data = await response.json();
      setScenarios(data);
    } catch (error) {
      console.error('Error fetching scenarios:', error);
      toast.error('Failed to load scenarios');
    }
  };

  const handleScenarioSelect = (scenarioId: string) => {
    setSelectedScenarioId(scenarioId);
    const scenario = scenarios.find(s => s.id === scenarioId);
    if (scenario) {
      setScenarioName(scenario.scenario_name);
      setScenarioNumber(scenario.scenario_number);
      setIsCreateMode(false);
    } else {
      // If empty selection, just exit create mode and clear fields
      setScenarioName('');
      setScenarioNumber('');
      setIsCreateMode(false);
    }
  };

  const handleCreateNew = () => {
    setSelectedScenarioId('');
    setScenarioName('');
    setScenarioNumber('');
    setIsCreateMode(true);
  };

  const handleSubmitScenario = async (operation: OperationType) => {
    // Validate required fields
    if ((operation === OperationType.POST || operation === OperationType.UPDATE) && 
        (!scenarioName || scenarioNumber === '')) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsLoading(true);
    try {
      let url = '/api/admin/scenarios';
      let method: string;
      let body: string | undefined;

      switch (operation) {
        case OperationType.POST:
          method = 'POST';
          body = JSON.stringify({
            scenario_name: scenarioName,
            scenario_number: Number(scenarioNumber),
          });
          break;
        case OperationType.UPDATE:
          method = 'PATCH';
          body = JSON.stringify({
            id: selectedScenarioId,
            scenario_name: scenarioName,
            scenario_number: Number(scenarioNumber),
          });
          break;
        case OperationType.DELETE:
          method = 'DELETE';
          body = JSON.stringify({
            id: selectedScenarioId,
          });
          break;
        default:
          throw new Error('Invalid operation');
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      });

      if (!response.ok) {
        throw new Error(`Failed to ${operation === OperationType.POST ? 'create' : operation === OperationType.UPDATE ? 'update' : 'delete'} scenario`);
      }

      toast.success(`Scenario ${operation === OperationType.POST ? 'created' : operation === OperationType.UPDATE ? 'updated' : 'deleted'} successfully`);

      // Refresh the scenarios list
      await fetchScenarios();
      
      // Reset form
      setSelectedScenarioId('');
      setScenarioName('');
      setScenarioNumber('');
      setIsCreateMode(false);

      if (onSubmit) {
        onSubmit();
      }
    } catch (error) {
      console.error(`Error executing ${operation} operation:`, error);
      toast.error(`Failed to ${operation === OperationType.POST ? 'create' : operation === OperationType.UPDATE ? 'update' : 'delete'} scenario`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 dark:bg-neutral-700/50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-lg shadow-xl w-full max-w-2xl min-h-0 max-h-svh overflow-y-auto flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-foreground">Manage Scenarios</h3>
            <p className="text-sm text-muted-foreground">Create, edit, or delete scenarios</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-muted-foreground text-xl"
          >
            ×
          </button>
        </div>

        <div className="px-[10px] py-4">
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-muted-foreground">
                  Select Scenario
                </label>
                <Button
                  onClick={handleCreateNew}
                  disabled={isLoading}
                  className="text-xs h-7 px-3"
                >
                  Create New
                </Button>
              </div>
              <select
                value={selectedScenarioId}
                onChange={(e) => handleScenarioSelect(e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                <option value="">Select a scenario to edit</option>
                {scenarios
                  .sort((a, b) => a.scenario_number - b.scenario_number)
                  .map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.scenario_number}. {scenario.scenario_name}
                    </option>
                  ))}
              </select>
              {isCreateMode && (
                <p className="text-xs text-amber-600 mt-1">
                  Creating new scenario. Select from dropdown to cancel and edit existing.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Scenario Name *
              </label>
              <Input
                type="text"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                placeholder="E.g. Sneak Attack, Stand-off"
                className="w-full"
                disabled={!isCreateMode && !selectedScenarioId}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Scenario Number *
              </label>
              <Input
                type="number"
                value={scenarioNumber}
                onChange={(e) => setScenarioNumber(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="E.g. 1, 2, 3"
                className="w-full"
                disabled={!isCreateMode && !selectedScenarioId}
                min="1"
              />
            </div>
          </div>
        </div>

        <div className="border-t px-[10px] py-2 flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1"
          >
            Cancel
          </Button>
          
          {isCreateMode && (
            <Button
              onClick={() => handleSubmitScenario(OperationType.POST)}
              disabled={!scenarioName || scenarioNumber === '' || isLoading}
              className="flex-1 bg-neutral-900 text-white rounded hover:bg-gray-800"
            >
              {isLoading ? 'Creating...' : 'Create Scenario'}
            </Button>
          )}

          {!isCreateMode && selectedScenarioId && (
            <>
              <Button
                onClick={() => handleSubmitScenario(OperationType.UPDATE)}
                disabled={!scenarioName || scenarioNumber === '' || isLoading}
                className="flex-1 bg-neutral-900 text-white rounded hover:bg-gray-800"
              >
                {isLoading ? 'Updating...' : 'Update Scenario'}
              </Button>
              <Button
                onClick={() => handleSubmitScenario(OperationType.DELETE)}
                disabled={isLoading}
                className="flex-1 bg-red-600 text-white rounded hover:bg-red-700"
              >
                {isLoading ? 'Deleting...' : 'Delete Scenario'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

