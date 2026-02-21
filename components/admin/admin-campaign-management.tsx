'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from 'sonner';
import { HiX } from "react-icons/hi";
import Modal from '@/components/ui/modal';

enum OperationType {
  POST = 'POST',
  UPDATE = 'UPDATE'
}

type CategoryType = 'campaign-types' | 'territories' | 'triumphs';

interface CampaignType {
  id: string;
  campaign_type_name: string;
  image_url?: string | null;
}

interface Territory {
  id: string;
  territory_name: string;
  campaign_type_id?: string | null;
}

interface CampaignTriumph {
  id: string;
  triumph: string;
  criteria: string;
  campaign_type_id: string;
  created_at: string;
  updated_at?: string | null;
}

interface AdminCampaignManagementModalProps {
  onClose: () => void;
  onSubmit?: () => void;
}

export function AdminCampaignManagementModal({ 
  onClose, 
  onSubmit 
}: AdminCampaignManagementModalProps) {
  
  
  // Category selection
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('campaign-types');
  
  // Data state
  const [campaignTypes, setCampaignTypes] = useState<CampaignType[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [triumphs, setTriumphs] = useState<CampaignTriumph[]>([]);
  
  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  
  // Campaign Types form state
  const [selectedCampaignTypeId, setSelectedCampaignTypeId] = useState('');
  const [campaignTypeName, setCampaignTypeName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isCreateModeCampaignType, setIsCreateModeCampaignType] = useState(false);
  
  // Relationship management for campaign types
  const [relatedTerritories, setRelatedTerritories] = useState<Territory[]>([]);
  const [relatedTriumphs, setRelatedTriumphs] = useState<CampaignTriumph[]>([]);
  const [showAddTerritoryModal, setShowAddTerritoryModal] = useState(false);
  const [showAddTriumphModal, setShowAddTriumphModal] = useState(false);
  const [selectedTerritoryToAdd, setSelectedTerritoryToAdd] = useState('');
  const [selectedTriumphToAdd, setSelectedTriumphToAdd] = useState('');
  
  // Territories form state
  const [selectedTerritoryId, setSelectedTerritoryId] = useState('');
  const [territoryName, setTerritoryName] = useState('');
  const [territoryCampaignTypeId, setTerritoryCampaignTypeId] = useState('');
  const [isCreateModeTerritory, setIsCreateModeTerritory] = useState(false);
  
  // Triumphs form state
  const [selectedTriumphId, setSelectedTriumphId] = useState('');
  const [triumphName, setTriumphName] = useState('');
  const [triumphCriteria, setTriumphCriteria] = useState('');
  const [triumphCampaignTypeId, setTriumphCampaignTypeId] = useState('');
  const [isCreateModeTriumph, setIsCreateModeTriumph] = useState(false);

  // Fetch data on mount
  useEffect(() => {
    fetchAllData();
  }, []);

  const handleCategoryChange = useCallback((category: CategoryType) => {
    setSelectedCategory(category);
    // Reset all form states
    setSelectedCampaignTypeId('');
    setCampaignTypeName('');
    setImageUrl('');
    setIsCreateModeCampaignType(false);
    setRelatedTerritories([]);
    setRelatedTriumphs([]);
    
    setSelectedTerritoryId('');
    setTerritoryName('');
    setTerritoryCampaignTypeId('');
    setIsCreateModeTerritory(false);
    
    setSelectedTriumphId('');
    setTriumphName('');
    setTriumphCriteria('');
    setTriumphCampaignTypeId('');
    setIsCreateModeTriumph(false);
  }, []);

  // Reset form when category changes
  useEffect(() => {
    handleCategoryChange(selectedCategory);
  }, [selectedCategory, handleCategoryChange]);

  // Load related territories and triumphs when campaign type is selected
  useEffect(() => {
    if (selectedCampaignTypeId && !isCreateModeCampaignType) {
      const relatedTerrs = territories.filter(t => t.campaign_type_id === selectedCampaignTypeId);
      const relatedTrphs = triumphs.filter(t => t.campaign_type_id === selectedCampaignTypeId);
      setRelatedTerritories(relatedTerrs);
      setRelatedTriumphs(relatedTrphs);
    } else {
      setRelatedTerritories([]);
      setRelatedTriumphs([]);
    }
  }, [selectedCampaignTypeId, territories, triumphs, isCreateModeCampaignType]);

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        fetchCampaignTypes(),
        fetchTerritories(),
        fetchTriumphs()
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCampaignTypes = async () => {
    try {
      const response = await fetch('/api/admin/campaign-types');
      if (!response.ok) throw new Error('Failed to fetch campaign types');
      const data = await response.json();
      setCampaignTypes(data);
    } catch (error) {
      console.error('Error fetching campaign types:', error);
      toast.error('Failed to load campaign types');
    }
  };

  const fetchTerritories = async () => {
    try {
      const response = await fetch('/api/admin/territories');
      if (!response.ok) throw new Error('Failed to fetch territories');
      const data = await response.json();
      setTerritories(data);
    } catch (error) {
      console.error('Error fetching territories:', error);
      toast.error('Failed to load territories');
    }
  };

  const fetchTriumphs = async () => {
    try {
      const response = await fetch('/api/admin/campaign-triumphs');
      if (!response.ok) throw new Error('Failed to fetch triumphs');
      const data = await response.json();
      setTriumphs(data);
    } catch (error) {
      console.error('Error fetching triumphs:', error);
      toast.error('Failed to load triumphs');
    }
  };

  // Campaign Types handlers
  const handleCampaignTypeSelect = (id: string) => {
    setSelectedCampaignTypeId(id);
    setIsCreateModeCampaignType(false);
    const selected = campaignTypes.find(ct => ct.id === id);
    if (selected) {
      setCampaignTypeName(selected.campaign_type_name);
      setImageUrl(selected.image_url || '');
    }
  };

  const handleCreateNewCampaignType = () => {
    setSelectedCampaignTypeId('');
    setCampaignTypeName('');
    setImageUrl('');
    setIsCreateModeCampaignType(true);
    setRelatedTerritories([]);
    setRelatedTriumphs([]);
  };

  const handleSubmitCampaignType = async (operation: OperationType) => {
    if ((operation === OperationType.POST || operation === OperationType.UPDATE) && !campaignTypeName.trim()) {
      toast.error("Campaign type name is required");
      return;
    }

    setIsLoading(true);
    try {
      let url = '/api/admin/campaign-types';
      let method: string;
      let body: string | undefined;

      switch (operation) {
        case OperationType.POST:
          method = 'POST';
          body = JSON.stringify({
            campaign_type_name: campaignTypeName.trim(),
            image_url: imageUrl.trim() || null
          });
          break;
        case OperationType.UPDATE:
          method = 'PATCH';
          body = JSON.stringify({
            id: selectedCampaignTypeId,
            campaign_type_name: campaignTypeName.trim(),
            image_url: imageUrl.trim() || null
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
        throw new Error(`Failed to ${operation === OperationType.POST ? 'create' : 'update'} campaign type`);
      }

      const savedCampaignType = await response.json();
      const campaignTypeId = savedCampaignType.id || selectedCampaignTypeId;
      
      // Update relationships for territories and triumphs
      // For POST: relationships can be set after creation if any were selected
      // For UPDATE: we always update relationships based on current selections
      if (campaignTypeId && (operation === OperationType.UPDATE || (operation === OperationType.POST && (relatedTerritories.length > 0 || relatedTriumphs.length > 0)))) {
        // Update territories: set campaign_type_id for related, remove for unselected
        const relatedTerritoryIds = relatedTerritories.map(t => t.id);
        
        // Territories to add relationship to
        const territoriesToAdd = relatedTerritoryIds.filter(id => {
          const territory = territories.find(t => t.id === id);
          return territory && territory.campaign_type_id !== campaignTypeId;
        });
        
        // Territories to remove relationship from (were related but now removed)
        const territoriesToRemove = territories
          .filter(t => t.campaign_type_id === campaignTypeId && !relatedTerritoryIds.includes(t.id))
          .map(t => t.id);
        
        // Update territories
        for (const territoryId of territoriesToAdd) {
          const territoryResponse = await fetch('/api/admin/territories', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: territoryId, campaign_type_id: campaignTypeId })
          });
          
          if (!territoryResponse.ok) {
            const error = await territoryResponse.json();
            throw new Error(`Failed to update territory relationship: ${error.error || 'Unknown error'}`);
          }
        }
        
        for (const territoryId of territoriesToRemove) {
          const territoryResponse = await fetch('/api/admin/territories', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: territoryId, campaign_type_id: null })
          });
          
          if (!territoryResponse.ok) {
            const error = await territoryResponse.json();
            throw new Error(`Failed to remove territory relationship: ${error.error || 'Unknown error'}`);
          }
        }
        
        // Update triumphs: set campaign_type_id for related
        const relatedTriumphIds = relatedTriumphs.map(t => t.id);
        
        // Triumphs to add relationship to
        const triumphsToAdd = relatedTriumphIds.filter(id => {
          const triumph = triumphs.find(t => t.id === id);
          return triumph && triumph.campaign_type_id !== campaignTypeId;
        });
        
        // Update triumphs
        for (const triumphId of triumphsToAdd) {
          const triumphResponse = await fetch('/api/admin/campaign-triumphs', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: triumphId, campaign_type_id: campaignTypeId })
          });
          
          if (!triumphResponse.ok) {
            const error = await triumphResponse.json();
            throw new Error(`Failed to update triumph relationship: ${error.error || 'Unknown error'}`);
          }
        }
        
        // Note: We don't remove campaign_type_id from triumphs as they require it
        // If a triumph is removed from the list, it should be reassigned to another campaign type manually
      }

      toast.success(`Campaign type ${operation === OperationType.POST ? 'created' : 'updated'} successfully`);

      await fetchAllData();
      
      // Reset form
      setSelectedCampaignTypeId('');
      setCampaignTypeName('');
      setImageUrl('');
      setRelatedTerritories([]);
      setRelatedTriumphs([]);
      setIsCreateModeCampaignType(false);

      if (onSubmit) {
        onSubmit();
      }
    } catch (error) {
      console.error(`Error executing ${operation} operation:`, error);
      toast.error(error instanceof Error ? error.message : `Failed to ${operation === OperationType.POST ? 'create' : 'update'} campaign type`);
    } finally {
      setIsLoading(false);
    }
  };

  // Territories handlers
  const handleTerritorySelect = (id: string) => {
    setSelectedTerritoryId(id);
    setIsCreateModeTerritory(false);
    const selected = territories.find(t => t.id === id);
    if (selected) {
      setTerritoryName(selected.territory_name);
      setTerritoryCampaignTypeId(selected.campaign_type_id || '');
    }
  };

  const handleCreateNewTerritory = () => {
    setSelectedTerritoryId('');
    setTerritoryName('');
    setTerritoryCampaignTypeId('');
    setIsCreateModeTerritory(true);
  };

  const handleSubmitTerritory = async (operation: OperationType) => {
    if ((operation === OperationType.POST || operation === OperationType.UPDATE) && !territoryName.trim()) {
      toast.error("Territory name is required");
      return;
    }

    setIsLoading(true);
    try {
      let url = '/api/admin/territories';
      let method: string;
      let body: string | undefined;

      switch (operation) {
        case OperationType.POST:
          method = 'POST';
          body = JSON.stringify({
            territory_name: territoryName.trim(),
            campaign_type_id: territoryCampaignTypeId || null
          });
          break;
        case OperationType.UPDATE:
          method = 'PATCH';
          body = JSON.stringify({
            id: selectedTerritoryId,
            territory_name: territoryName.trim(),
            campaign_type_id: territoryCampaignTypeId || null
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
        throw new Error(`Failed to ${operation === OperationType.POST ? 'create' : 'update'} territory`);
      }

      toast.success(`Territory ${operation === OperationType.POST ? 'created' : 'updated'} successfully`);

      await fetchAllData();
      
      // Reset form
      setSelectedTerritoryId('');
      setTerritoryName('');
      setTerritoryCampaignTypeId('');
      setIsCreateModeTerritory(false);

      if (onSubmit) {
        onSubmit();
      }
    } catch (error) {
      console.error(`Error executing ${operation} operation:`, error);
      toast.error(error instanceof Error ? error.message : `Failed to ${operation === OperationType.POST ? 'create' : 'update'} territory`);
    } finally {
      setIsLoading(false);
    }
  };

  // Triumphs handlers
  const handleTriumphSelect = (id: string) => {
    setSelectedTriumphId(id);
    setIsCreateModeTriumph(false);
    const selected = triumphs.find(t => t.id === id);
    if (selected) {
      setTriumphName(selected.triumph);
      setTriumphCriteria(selected.criteria);
      setTriumphCampaignTypeId(selected.campaign_type_id);
    }
  };

  const handleCreateNewTriumph = () => {
    setSelectedTriumphId('');
    setTriumphName('');
    setTriumphCriteria('');
    setTriumphCampaignTypeId('');
    setIsCreateModeTriumph(true);
  };

  const handleSubmitTriumph = async (operation: OperationType) => {
    if ((operation === OperationType.POST || operation === OperationType.UPDATE) && 
        (!triumphName.trim() || !triumphCriteria.trim() || !triumphCampaignTypeId)) {
      toast.error("Triumph name, criteria, and campaign type are required");
      return;
    }

    setIsLoading(true);
    try {
      let url = '/api/admin/campaign-triumphs';
      let method: string;
      let body: string | undefined;

      switch (operation) {
        case OperationType.POST:
          method = 'POST';
          body = JSON.stringify({
            triumph: triumphName.trim(),
            criteria: triumphCriteria.trim(),
            campaign_type_id: triumphCampaignTypeId
          });
          break;
        case OperationType.UPDATE:
          method = 'PATCH';
          body = JSON.stringify({
            id: selectedTriumphId,
            triumph: triumphName.trim(),
            criteria: triumphCriteria.trim(),
            campaign_type_id: triumphCampaignTypeId
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
        throw new Error(`Failed to ${operation === OperationType.POST ? 'create' : 'update'} triumph`);
      }

      toast.success(`Triumph ${operation === OperationType.POST ? 'created' : 'updated'} successfully`);

      await fetchAllData();
      
      // Reset form
      setSelectedTriumphId('');
      setTriumphName('');
      setTriumphCriteria('');
      setTriumphCampaignTypeId('');
      setIsCreateModeTriumph(false);

      if (onSubmit) {
        onSubmit();
      }
    } catch (error) {
      console.error(`Error executing ${operation} operation:`, error);
      toast.error(error instanceof Error ? error.message : `Failed to ${operation === OperationType.POST ? 'create' : 'update'} triumph`);
    } finally {
      setIsLoading(false);
    }
  };

  // Relationship management handlers
  const availableTerritories = territories.filter(t => 
    !relatedTerritories.some(rt => rt.id === t.id)
  );
  
  const availableTriumphs = triumphs.filter(t => 
    !relatedTriumphs.some(rt => rt.id === t.id)
  );

  const handleAddTerritory = () => {
    if (selectedTerritoryToAdd) {
      const territory = territories.find(t => t.id === selectedTerritoryToAdd);
      if (territory) {
        setRelatedTerritories([...relatedTerritories, territory]);
      }
      setShowAddTerritoryModal(false);
      setSelectedTerritoryToAdd('');
      return true;
    }
    return false;
  };

  const handleAddTriumph = () => {
    if (selectedTriumphToAdd) {
      const triumph = triumphs.find(t => t.id === selectedTriumphToAdd);
      if (triumph) {
        setRelatedTriumphs([...relatedTriumphs, triumph]);
      }
      setShowAddTriumphModal(false);
      setSelectedTriumphToAdd('');
      return true;
    }
    return false;
  };

  // Determine which form is active and what buttons to show
  const getActiveFormState = () => {
    if (selectedCategory === 'campaign-types') {
      return {
        isCreateMode: isCreateModeCampaignType,
        selectedId: selectedCampaignTypeId,
        canSubmit: campaignTypeName.trim(),
        handleSubmit: handleSubmitCampaignType
      };
    } else if (selectedCategory === 'territories') {
      return {
        isCreateMode: isCreateModeTerritory,
        selectedId: selectedTerritoryId,
        canSubmit: territoryName.trim(),
        handleSubmit: handleSubmitTerritory
      };
    } else {
      return {
        isCreateMode: isCreateModeTriumph,
        selectedId: selectedTriumphId,
        canSubmit: triumphName.trim() && triumphCriteria.trim() && triumphCampaignTypeId,
        handleSubmit: handleSubmitTriumph
      };
    }
  };

  const activeForm = getActiveFormState();

  return (
    <div
      className="fixed inset-0 bg-black/50 dark:bg-neutral-700/50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-lg shadow-xl w-full max-w-4xl min-h-0 max-h-svh overflow-y-auto flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-foreground">Campaign Management</h3>
            <p className="text-sm text-muted-foreground">Manage campaign types, territories, and triumphs</p>
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
            {/* Category Selector */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Category *
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value as CategoryType)}
                className="w-full p-2 border rounded-md"
                disabled={isLoading}
              >
                <option value="campaign-types">Campaign Types</option>
                <option value="territories">Territories</option>
                <option value="triumphs">Campaign Triumphs</option>
              </select>
            </div>

            {/* Campaign Types Section */}
            {selectedCategory === 'campaign-types' && (
              <>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-muted-foreground">
                      Select Campaign Type
                    </label>
                    <Button
                      onClick={handleCreateNewCampaignType}
                      disabled={isLoading}
                      className="text-xs h-7 px-3"
                    >
                      Create New
                    </Button>
                  </div>
                  <select
                    value={selectedCampaignTypeId}
                    onChange={(e) => handleCampaignTypeSelect(e.target.value)}
                    className="w-full p-2 border rounded-md"
                    disabled={isLoading}
                  >
                    <option value="">Select a campaign type to edit</option>
                    {campaignTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.campaign_type_name}
                      </option>
                    ))}
                  </select>
                  {isCreateModeCampaignType && (
                    <p className="text-xs text-amber-600 mt-1">
                      Creating new campaign type. Select from dropdown to cancel and edit existing.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Campaign Type Name *
                  </label>
                  <Input
                    type="text"
                    value={campaignTypeName}
                    onChange={(e) => setCampaignTypeName(e.target.value)}
                    placeholder="e.g. Dominion Campaign"
                    className="w-full"
                    disabled={!isCreateModeCampaignType && !selectedCampaignTypeId}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Image URL
                  </label>
                  <Input
                    type="text"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className="w-full"
                    disabled={!isCreateModeCampaignType && !selectedCampaignTypeId}
                  />
                </div>

                {/* Related Territories Section - Only show when editing */}
                {selectedCampaignTypeId && !isCreateModeCampaignType && (
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                      Related Territories
                    </label>
                    <Button
                      onClick={() => setShowAddTerritoryModal(true)}
                      variant="outline"
                      size="sm"
                      className="mb-2"
                    >
                      Add Territory
                    </Button>
                    {relatedTerritories.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {relatedTerritories.map((territory) => (
                          <div
                            key={territory.id}
                            className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-muted"
                          >
                            <span>{territory.territory_name}</span>
                            <button
                              onClick={() => {
                                setRelatedTerritories(relatedTerritories.filter(t => t.id !== territory.id));
                              }}
                              className="hover:text-red-500 focus:outline-none"
                            >
                              <HiX className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Related Triumphs Section - Only show when editing */}
                {selectedCampaignTypeId && !isCreateModeCampaignType && (
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                      Related Triumphs
                    </label>
                    <Button
                      onClick={() => setShowAddTriumphModal(true)}
                      variant="outline"
                      size="sm"
                      className="mb-2"
                    >
                      Add Triumph
                    </Button>
                    {relatedTriumphs.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {relatedTriumphs.map((triumph) => (
                          <div
                            key={triumph.id}
                            className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-muted"
                          >
                            <span>{triumph.triumph}</span>
                            <button
                              onClick={() => {
                                setRelatedTriumphs(relatedTriumphs.filter(t => t.id !== triumph.id));
                              }}
                              className="hover:text-red-500 focus:outline-none"
                            >
                              <HiX className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Territories Section */}
            {selectedCategory === 'territories' && (
              <>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-muted-foreground">
                      Select Territory
                    </label>
                    <Button
                      onClick={handleCreateNewTerritory}
                      disabled={isLoading}
                      className="text-xs h-7 px-3"
                    >
                      Create New
                    </Button>
                  </div>
                  <select
                    value={selectedTerritoryId}
                    onChange={(e) => handleTerritorySelect(e.target.value)}
                    className="w-full p-2 border rounded-md"
                    disabled={isLoading}
                  >
                    <option value="">Select a territory to edit</option>
                    {territories.map((territory) => (
                      <option key={territory.id} value={territory.id}>
                        {territory.territory_name}
                      </option>
                    ))}
                  </select>
                  {isCreateModeTerritory && (
                    <p className="text-xs text-amber-600 mt-1">
                      Creating new territory. Select from dropdown to cancel and edit existing.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Territory Name *
                  </label>
                  <Input
                    type="text"
                    value={territoryName}
                    onChange={(e) => setTerritoryName(e.target.value)}
                    placeholder="e.g. Settlement"
                    className="w-full"
                    disabled={!isCreateModeTerritory && !selectedTerritoryId}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Campaign Type
                  </label>
                  <select
                    value={territoryCampaignTypeId}
                    onChange={(e) => setTerritoryCampaignTypeId(e.target.value)}
                    className="w-full p-2 border rounded-md"
                    disabled={!isCreateModeTerritory && !selectedTerritoryId}
                  >
                    <option value="">None (unassigned)</option>
                    {campaignTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.campaign_type_name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Triumphs Section */}
            {selectedCategory === 'triumphs' && (
              <>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-muted-foreground">
                      Select Triumph
                    </label>
                    <Button
                      onClick={handleCreateNewTriumph}
                      disabled={isLoading}
                      className="text-xs h-7 px-3"
                    >
                      Create New
                    </Button>
                  </div>
                  <select
                    value={selectedTriumphId}
                    onChange={(e) => handleTriumphSelect(e.target.value)}
                    className="w-full p-2 border rounded-md"
                    disabled={isLoading}
                  >
                    <option value="">Select a triumph to edit</option>
                    {triumphs.map((triumph) => (
                      <option key={triumph.id} value={triumph.id}>
                        {triumph.triumph}
                      </option>
                    ))}
                  </select>
                  {isCreateModeTriumph && (
                    <p className="text-xs text-amber-600 mt-1">
                      Creating new triumph. Select from dropdown to cancel and edit existing.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Triumph Name *
                  </label>
                  <Input
                    type="text"
                    value={triumphName}
                    onChange={(e) => setTriumphName(e.target.value)}
                    placeholder="e.g. First Blood"
                    className="w-full"
                    disabled={!isCreateModeTriumph && !selectedTriumphId}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Criteria *
                  </label>
                  <Textarea
                    value={triumphCriteria}
                    onChange={(e) => setTriumphCriteria(e.target.value)}
                    placeholder="Enter the criteria for this triumph"
                    className="w-full min-h-[100px]"
                    disabled={!isCreateModeTriumph && !selectedTriumphId}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Campaign Type *
                  </label>
                  <select
                    value={triumphCampaignTypeId}
                    onChange={(e) => setTriumphCampaignTypeId(e.target.value)}
                    className="w-full p-2 border rounded-md"
                    disabled={!isCreateModeTriumph && !selectedTriumphId}
                  >
                    <option value="">Select a campaign type</option>
                    {campaignTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.campaign_type_name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
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
          
          {activeForm.isCreateMode && (
            <Button
              onClick={() => activeForm.handleSubmit(OperationType.POST)}
              disabled={!activeForm.canSubmit || isLoading}
              className="flex-1 bg-neutral-900 text-white rounded hover:bg-gray-800"
            >
              {isLoading ? 'Creating...' : `Create ${selectedCategory === 'campaign-types' ? 'Campaign Type' : selectedCategory === 'territories' ? 'Territory' : 'Triumph'}`}
            </Button>
          )}

          {!activeForm.isCreateMode && activeForm.selectedId && (
            <Button
              onClick={() => activeForm.handleSubmit(OperationType.UPDATE)}
              disabled={!activeForm.canSubmit || isLoading}
              className="flex-1 bg-neutral-900 text-white rounded hover:bg-gray-800"
            >
              {isLoading ? 'Updating...' : `Update ${selectedCategory === 'campaign-types' ? 'Campaign Type' : selectedCategory === 'territories' ? 'Territory' : 'Triumph'}`}
            </Button>
          )}
        </div>
      </div>

      {/* Add Territory Modal */}
      {showAddTerritoryModal && (
        <Modal
          title="Add Territory"
          content={
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Select a territory to relate to this campaign type
              </p>
              <select
                value={selectedTerritoryToAdd}
                onChange={(e) => setSelectedTerritoryToAdd(e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                <option value="">Select a territory</option>
                {availableTerritories.map((territory) => (
                  <option key={territory.id} value={territory.id}>
                    {territory.territory_name}
                  </option>
                ))}
              </select>
            </div>
          }
          onClose={() => {
            setShowAddTerritoryModal(false);
            setSelectedTerritoryToAdd('');
          }}
          onConfirm={handleAddTerritory}
          confirmText="Add Territory"
          confirmDisabled={!selectedTerritoryToAdd}
        />
      )}

      {/* Add Triumph Modal */}
      {showAddTriumphModal && (
        <Modal
          title="Add Triumph"
          content={
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Select a triumph to relate to this campaign type
              </p>
              <select
                value={selectedTriumphToAdd}
                onChange={(e) => setSelectedTriumphToAdd(e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                <option value="">Select a triumph</option>
                {availableTriumphs.map((triumph) => (
                  <option key={triumph.id} value={triumph.id}>
                    {triumph.triumph}
                  </option>
                ))}
              </select>
            </div>
          }
          onClose={() => {
            setShowAddTriumphModal(false);
            setSelectedTriumphToAdd('');
          }}
          onConfirm={handleAddTriumph}
          confirmText="Add Triumph"
          confirmDisabled={!selectedTriumphToAdd}
        />
      )}
    </div>
  );
}
