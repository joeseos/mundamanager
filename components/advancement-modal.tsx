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
    setOpen(false);
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