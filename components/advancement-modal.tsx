import React, { useState } from 'react';
import { useToast } from '@/components/ui/use-toast';

interface AdvancementModalProps {
  isOpen: boolean;
  onClose: () => void;
  fighterId: string;
  onAdvancementAdded?: () => void;
}

export function AdvancementModal({ 
  isOpen, 
  onClose, 
  fighterId, 
  onAdvancementAdded 
}: AdvancementModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleAddSkillAsAdvancement = async (selectedSkill: any) => {
    try {
      setIsSubmitting(true);
      
      const payload = {
        fighter_id: fighterId,
        skill_id: selectedSkill.id,
        is_advance: true,  // Explicitly set to true for skills added as advancements
        xp_cost: selectedSkill.xp_cost,
        credits_increase: selectedSkill.credits_increase || 0
      };
      
      const response = await fetch(`/api/fighters/skills`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error('Failed to add skill advancement');
      }
      
      // Close modal and refresh data
      onClose();
      if (onAdvancementAdded) {
        onAdvancementAdded();
      }
      
      toast({
        description: `${selectedSkill.name} added as advancement successfully`,
        variant: "default"
      });
    } catch (error) {
      console.error('Error adding skill advancement:', error);
      toast({
        description: 'Failed to add skill advancement',
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Add your component JSX here
  return (
    <>
      {isOpen && (
        <div>
          {/* Modal content */}
          {/* Add your UI for selecting skills */}
          {/* Use handleAddSkillAsAdvancement when a skill is selected */}
        </div>
      )}
    </>
  );
}

export function useAdvancementHandler(fighterId: string, onSuccess?: () => void, onClose?: () => void) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleAddSkillAsAdvancement = async (selectedSkill: any) => {
    try {
      setIsSubmitting(true);
      
      const payload = {
        fighter_id: fighterId,
        skill_id: selectedSkill.id,
        is_advance: true,
        xp_cost: selectedSkill.xp_cost,
        credits_increase: selectedSkill.credits_increase || 0
      };
      
      const response = await fetch(`/api/fighters/skills`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error('Failed to add skill advancement');
      }
      
      if (onClose) onClose();
      if (onSuccess) onSuccess();
      
      toast({
        description: `${selectedSkill.name} added as advancement successfully`,
        variant: "default"
      });
    } catch (error) {
      console.error('Error adding skill advancement:', error);
      toast({
        description: 'Failed to add skill advancement',
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    handleAddSkillAsAdvancement,
    isSubmitting
  };
} 