'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

interface AdminCreateSkillModalProps {
  onClose: () => void;
  onSubmit?: () => void;
}

export function AdminCreateSkillModal({ onClose, onSubmit }: AdminCreateSkillModalProps) {
  const [skillName, setSkillName] = useState('');
  const [skillTypeList, setSkillTypes] = useState<Array<{id: string, name: string}>>([]);
  const [skillType, setSkillType] = useState('');
  const [credit_cost, setCreditCost] = useState('');
  const [xp_cost, setCost] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { toast } = useToast();

  useEffect(() => {
    const fetchSkillTypes = async () => {
      try {
        const response = await fetch('/api/admin/skill-types');
        if (!response.ok) throw new Error('Failed to fetch skill types');
        const data = await response.json();
        console.log('Fetched skill types:', data);
        setSkillTypes(data);
      } catch (error) {
        console.error('Error fetching skill types:', error);
        toast({
          description: 'Failed to load skill types',
          variant: "destructive"
        });
      }
    };

    fetchSkillTypes();
  }, [toast]);

  const handleSubmit = async () => {
    if (!skillName || !skillType || !xp_cost || !credit_cost) {
      toast({
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/skills', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          skill_name: skillName,
          skill_type_id: skillType,
          credit_cost: parseInt(credit_cost),
          xp_cost: parseInt(xp_cost),
        }),
      });
 
      if (!response.ok) {
        throw new Error('Failed to create skill');
      }

      toast({
        description: "Skill created successfully",
        variant: "default"
      });
      
      if (onSubmit) {
        onSubmit();
      }
      onClose();
    } catch (error) {
      console.error('Error creating skill:', error);
      toast({
        description: 'Failed to create skill',
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-gray-300 bg-opacity-50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl min-h-0 max-h-svh overflow-y-auto flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Add Skill</h3>
            <p className="text-sm text-gray-500">Fields marked with * are required</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl"
          >
            ×
          </button>
        </div>

        <div className="px-[10px] py-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Skill Name *
              </label>
              <Input
                type="text"
                value={skillName}
                onChange={(e) => setSkillName(e.target.value)}
                placeholder="E.g. Restrain, Killing Blow"
                className="w-full"
              />
            </div>
       
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Skill Type *
              </label>
              <select
                value={skillType}
                onChange={(e) => setSkillType(e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                <option value="">Select skill type</option>
                {skillTypeList.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cost *
              </label>
              <Input
                type="number"
                value={xp_cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="Enter XP cost"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Credit Cost *
              </label>
              <Input
                type="number"
                value={credit_cost}
                onChange={(e) => setCreditCost(e.target.value)}
                placeholder="Enter credit cost"
              />
            </div>
          </div>
        </div>

        <div className="border-t px-[10px] py-2 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!skillName || !skillType || !xp_cost || !credit_cost || isLoading}
            className="bg-black hover:bg-gray-800 text-white"
          >
            {isLoading ? 'Creating...' : 'Create Skill'}
          </Button>
        </div>
      </div>
    </div>
  );
} 