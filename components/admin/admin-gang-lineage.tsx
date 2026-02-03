'use client';

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { LuTrash2, LuPlus } from "react-icons/lu";
import { HiX } from "react-icons/hi";
import Modal from '@/components/ui/modal';

type LineageType = 'legacy' | 'affiliation';

interface GangLineage {
  id: string;
  name: string;
  fighter_type_id: string;
  type: LineageType | string;
  created_at: string;
  updated_at?: string;
  fighter_type_access: string[];
  associated_fighter_type?: {
    id: string;
    fighter_type: string;
    gang_type: string;
    gang_type_id: string;
  };
}

interface FighterType {
  id: string;
  fighter_type: string;
  gang_type: string;
  gang_type_id: string;
  fighter_class: string;
  fighter_sub_type?: string | null;
}

interface GangType {
  gang_type_id: string;
  gang_type: string;
}

interface AdminGangLineageModalProps {
  onClose: () => void;
  onSubmit?: () => void;
}

export function AdminGangLineageModal({ onClose, onSubmit }: AdminGangLineageModalProps) {
  const { toast } = useToast();
  
  // Split state for gang lineages by type and fighter types
  const [legacies, setLegacies] = useState<GangLineage[]>([]);
  const [affiliations, setAffiliations] = useState<GangLineage[]>([]);
  const [fighterTypes, setFighterTypes] = useState<FighterType[]>([]);
  const [gangTypes, setGangTypes] = useState<GangType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // State for type selection and filtered gang lineages
  const [selectedType, setSelectedType] = useState<LineageType | ''>('');
  const [filteredGangLineages, setFilteredGangLineages] = useState<GangLineage[]>([]);
  
  // State for selected gang lineage
  const [selectedGangLineageId, setSelectedGangLineageId] = useState<string>('');
  const [selectedGangLineage, setSelectedGangLineage] = useState<GangLineage | null>(null);
  
  // State for form data
  const [gangLineageName, setGangLineageName] = useState('');
  const [selectedGangTypeId, setSelectedGangTypeId] = useState('');
  const [associatedFighterTypeId, setAssociatedFighterTypeId] = useState('');
  const [lineageType, setLineageType] = useState<LineageType | ''>('');
  const [fighterTypeAccess, setFighterTypeAccess] = useState<string[]>([]);
  
  // Filtered fighter types based on selected gang type
  const [filteredFighterTypes, setFilteredFighterTypes] = useState<FighterType[]>([]);
  
  // State for fighter type access filtering
  const [accessRuleGangTypeId, setAccessRuleGangTypeId] = useState<string>('');
  
  // Flag to prevent resetting fighter type when loading existing data
  const [isLoadingExistingData, setIsLoadingExistingData] = useState(false);
  
  // State for modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [gangLineageToDelete, setGangLineageToDelete] = useState<string>('');

  const getTypeLabel = (t: LineageType | '') => {
    if (t === 'legacy') return 'Gang Legacy';
    if (t === 'affiliation') return 'Gang Affiliation';
    return 'Gang Legacy or Affiliation';
  };

  const getTypeTerm = (t: LineageType | '') => {
    if (t === 'legacy') return 'gang legacy';
    if (t === 'affiliation') return 'gang affiliation';
    return 'gang legacy or affiliation';
  };

  // Do not fetch fighter/gang types on mount; fetch lazily when editing/creating
  useEffect(() => {
    if (showCreateModal || selectedGangLineage) {
      if (gangTypes.length === 0) fetchGangTypes();
      if (fighterTypes.length === 0) fetchFighterTypes();
    }
  }, [showCreateModal, selectedGangLineage]);

  // Fetch when type changes, and reset selection
  useEffect(() => {
    if (selectedType) {
      fetchLineagesByType(selectedType);
    } else {
      setFilteredGangLineages([]);
    }
    setSelectedGangLineageId('');
    clearForm();
  }, [selectedType]);

  // Update filtered list when data or type changes (no fetching here)
  useEffect(() => {
    if (!selectedType) return;
    setFilteredGangLineages(selectedType === 'legacy' ? legacies : affiliations);
  }, [selectedType, legacies, affiliations]);

  // Update form when selected gang lineage changes
  useEffect(() => {
    if (selectedGangLineageId) {
      const typeForFetch = selectedType || lineageType;
      if (!typeForFetch) {
        toast({ description: 'Please select a type first', variant: 'destructive' });
      } else {
        fetchGangLineageDetails(selectedGangLineageId, typeForFetch as LineageType);
      }
    } else {
      clearForm();
    }
  }, [selectedGangLineageId]);

  // Filter fighter types when gang type changes
  useEffect(() => {
    if (selectedGangTypeId) {
      const filtered = fighterTypes.filter(ft => ft.gang_type_id === selectedGangTypeId);
      setFilteredFighterTypes(filtered);
      
      // Only reset fighter type if we're not loading existing data AND the current selection isn't valid for this gang type
      if (!isLoadingExistingData && associatedFighterTypeId && !filtered.some(ft => ft.id === associatedFighterTypeId)) {
        setAssociatedFighterTypeId('');
      }
    } else {
      setFilteredFighterTypes([]);
      if (!isLoadingExistingData) {
        setAssociatedFighterTypeId('');
      }
    }
  }, [selectedGangTypeId, fighterTypes]);

  const fetchLineagesByType = async (type: LineageType) => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/admin/gang-lineages?type=${type}`);
      if (!res.ok) throw new Error('Failed to fetch gang lineages');
      const data = await res.json();
      if (type === 'legacy') {
        setLegacies(data || []);
      } else {
        setAffiliations(data || []);
      }
    } catch (error) {
      console.error('Error fetching gang lineages:', error);
      toast({
        description: 'Failed to load gang lineages',
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFighterTypes = async () => {
    try {
      const response = await fetch('/api/admin/fighter-types');
      if (!response.ok) throw new Error('Failed to fetch fighter types');
      const data = await response.json();
      setFighterTypes(data);
    } catch (error) {
      console.error('Error fetching fighter types:', error);
      toast({
        description: 'Failed to load fighter types',
        variant: "destructive"
      });
    }
  };

  const fetchGangTypes = async () => {
    try {
      const response = await fetch('/api/admin/gang-types');
      if (!response.ok) throw new Error('Failed to fetch gang types');
      const data = await response.json();
      setGangTypes(data);
    } catch (error) {
      console.error('Error fetching gang types:', error);
      toast({
        description: 'Failed to load gang types',
        variant: "destructive"
      });
    }
  };

  const fetchGangLineageDetails = async (gangLineageId: string, type: LineageType) => {
    try {
      setIsLoading(true);
      setIsLoadingExistingData(true);
      
      const response = await fetch(`/api/admin/gang-lineages?id=${gangLineageId}&type=${type}`);
      if (!response.ok) throw new Error('Failed to fetch gang lineage details');
      const data = await response.json();
      
      setSelectedGangLineage(data);
      setGangLineageName(data.name);
      setLineageType(data.type);
      setFighterTypeAccess(data.fighter_type_access || []);
      
      // Set gang type and fighter type together
      if (data.associated_fighter_type) {
        setSelectedGangTypeId(data.associated_fighter_type.gang_type_id || '');
        setAssociatedFighterTypeId(data.fighter_type_id);
        
        // Clear the loading flag after a delay
        setTimeout(() => {
          setIsLoadingExistingData(false);
        }, 100);
      } else {
        setAssociatedFighterTypeId(data.fighter_type_id);
        setIsLoadingExistingData(false);
      }
    } catch (error) {
      console.error('Error fetching gang lineage details:', error);
      toast({
        description: 'Failed to load gang lineage details',
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const clearForm = () => {
    setSelectedGangLineage(null);
    setGangLineageName('');
    setSelectedGangTypeId('');
    setAssociatedFighterTypeId('');
    setLineageType('');
    setFighterTypeAccess([]);
    setAccessRuleGangTypeId('');
    setIsLoadingExistingData(false);
  };

  const handleCreateGangLineage = async () => {
    if (!gangLineageName || !selectedGangTypeId || !associatedFighterTypeId || !lineageType) {
      toast({
        description: 'Please fill in all required fields',
        variant: "destructive"
      });
      return false;
    }

    try {
      setIsLoading(true);
      const response = await fetch('/api/admin/gang-lineages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: gangLineageName,
          fighter_type_id: associatedFighterTypeId,
          type: lineageType,
          fighter_type_access: fighterTypeAccess
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create gang lineage');
      }

      toast({
        description: "Gang lineage created successfully",
        variant: "default"
      });

      // Refresh the current type list if matching
      if (lineageType && selectedType && lineageType === selectedType) {
        await fetchLineagesByType(selectedType);
      }
      clearForm();
      return true;
    } catch (error) {
      console.error('Error creating gang lineage:', error);
      toast({
        description: error instanceof Error ? error.message : 'Failed to create gang lineage',
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateGangLineage = async () => {
    if (!selectedGangLineage || !gangLineageName || !selectedGangTypeId || !associatedFighterTypeId || !lineageType) {
      toast({
        description: 'Please fill in all required fields',
        variant: "destructive"
      });
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch(`/api/admin/gang-lineages?id=${selectedGangLineage.id}&type=${selectedGangLineage.type}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: gangLineageName,
          fighter_type_id: associatedFighterTypeId,
          type: lineageType,
          fighter_type_access: fighterTypeAccess
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update gang lineage');
      }

      toast({
        description: "Gang lineage updated successfully",
        variant: "default"
      });

      // Refresh current type list
      if (selectedType) {
        await fetchLineagesByType(selectedType);
      }
      
      // Close the modal after successful update
      if (onSubmit) {
        onSubmit();
      }
      onClose();
    } catch (error) {
      console.error('Error updating gang lineage:', error);
      toast({
        description: error instanceof Error ? error.message : 'Failed to update gang lineage',
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteGangLineage = async () => {
    if (!gangLineageToDelete || !selectedType) return false;

    try {
      setIsLoading(true);
      const response = await fetch(`/api/admin/gang-lineages?id=${gangLineageToDelete}&type=${selectedType}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete gang lineage');
      }

      toast({
        description: "Gang lineage deleted successfully",
        variant: "default"
      });

      // Refresh current type list and clear selection if deleted item was selected
      if (selectedType) {
        await fetchLineagesByType(selectedType);
      }
      if (selectedGangLineageId === gangLineageToDelete) {
        setSelectedGangLineageId('');
        clearForm();
      }
      
      setGangLineageToDelete('');
      return true;
    } catch (error) {
      console.error('Error deleting gang lineage:', error);
      toast({
        description: error instanceof Error ? error.message : 'Failed to delete gang lineage',
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const addFighterTypeAccess = (fighterTypeId: string) => {
    if (fighterTypeId && !fighterTypeAccess.includes(fighterTypeId)) {
      setFighterTypeAccess([...fighterTypeAccess, fighterTypeId]);
    }
  };

  const removeFighterTypeAccess = (fighterTypeId: string) => {
    setFighterTypeAccess(fighterTypeAccess.filter(id => id !== fighterTypeId));
  };

  // Helper function to format fighter type display name
  const getFighterTypeDisplayName = (fighterType: FighterType) => {
    let displayName = fighterType.fighter_type;
    
    // Add fighter class in parentheses
    if (fighterType.fighter_class) {
      displayName += ` (${fighterType.fighter_class})`;
    }
    
    // Add sub-type with dash if it exists
    if (fighterType.fighter_sub_type) {
      displayName += ` - ${fighterType.fighter_sub_type}`;
    }
    
    return displayName;
  };

  // Create modal content
  const createModalContent = (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">
          Type *
        </label>
        <select
          value={lineageType}
          onChange={(e) => setLineageType(e.target.value as LineageType)}
          className="w-full p-2 border rounded-md"
        >
          <option value="">Select type</option>
          <option value="legacy">Legacy</option>
          <option value="affiliation">Affiliation</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">
          {getTypeLabel(lineageType)} Name *
        </label>
        <Input
          type="text"
          value={gangLineageName}
          onChange={(e) => setGangLineageName(e.target.value)}
          placeholder="e.g. House Cawdor"
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">
          Gang Type *
        </label>
        <select
          value={selectedGangTypeId}
          onChange={(e) => setSelectedGangTypeId(e.target.value)}
          className="w-full p-2 border rounded-md"
        >
          <option value="">Select a gang type</option>
          {gangTypes.map((gangType) => (
            <option key={gangType.gang_type_id} value={gangType.gang_type_id}>
              {gangType.gang_type}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">
          Associated Fighter Type *
        </label>
        <select
          value={associatedFighterTypeId}
          onChange={(e) => setAssociatedFighterTypeId(e.target.value)}
          className="w-full p-2 border rounded-md"
          disabled={!selectedGangTypeId}
        >
          <option value="">
            {!selectedGangTypeId ? "Select a gang type first" : "Select a fighter type"}
          </option>
          {filteredFighterTypes.map((fighterType) => (
            <option key={fighterType.id} value={fighterType.id}>
              {getFighterTypeDisplayName(fighterType)}
            </option>
          ))}
        </select>
      </div>

      {/* Fighter Type Access - Only show for legacy type */}
      {lineageType === 'legacy' && (
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            Fighter Type Access
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Gang Type for Access Rules
              </label>
              <select
                value={accessRuleGangTypeId}
                onChange={(e) => setAccessRuleGangTypeId(e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                <option value="">Select gang type</option>
                {gangTypes.map((gangType) => (
                  <option key={gangType.gang_type_id} value={gangType.gang_type_id}>
                    {gangType.gang_type}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Add Fighter Type Access
              </label>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    addFighterTypeAccess(e.target.value);
                    e.target.value = "";
                  }
                }}
                className="w-full p-2 border rounded-md"
                disabled={!accessRuleGangTypeId}
              >
                <option value="">
                  {!accessRuleGangTypeId 
                    ? "Select a gang type first" 
                    : "Add fighter type access"
                  }
                </option>
                {accessRuleGangTypeId && fighterTypes
                  .filter(ft => ft.gang_type_id === accessRuleGangTypeId && !fighterTypeAccess.includes(ft.id))
                  .sort((a, b) => getFighterTypeDisplayName(a).localeCompare(getFighterTypeDisplayName(b)))
                  .map((fighterType) => (
                    <option key={fighterType.id} value={fighterType.id}>
                      {getFighterTypeDisplayName(fighterType)}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {fighterTypeAccess.map((fighterTypeId) => {
              const fighterType = fighterTypes.find(ft => ft.id === fighterTypeId);
              if (!fighterType) return null;

              return (
                <div
                  key={fighterTypeId}
                  className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-muted"
                >
                  <span>{fighterType.fighter_type}</span>
                  <span className="text-muted-foreground">({fighterType.gang_type})</span>
                  <button
                    type="button"
                    onClick={() => removeFighterTypeAccess(fighterTypeId)}
                    className="hover:text-red-500 focus:outline-none"
                  >
                                <HiX className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div 
      className="fixed inset-0 bg-black/50 dark:bg-neutral-700/50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-lg shadow-xl w-full max-w-4xl min-h-0 max-h-svh overflow-y-auto flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-foreground">Affiliations & Legacies</h3>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-muted-foreground text-xl"
          >
            ×
          </button>
        </div>

        <div className="px-[10px] py-4 overflow-y-auto flex-grow">
          <div className="space-y-6">
            {/* Type and Gang Lineage Selection */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Select Type
                </label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as LineageType | '')}
                  className="w-full p-2 border rounded-md"
                  disabled={isLoading}
                >
                  <option value="">Select type</option>
                  <option value="legacy">Legacy</option>
                  <option value="affiliation">Affiliation</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Select Gang Affiliation or Legacy
                </label>
                <select
                  value={selectedGangLineageId}
                  onChange={(e) => setSelectedGangLineageId(e.target.value)}
                  className="w-full p-2 border rounded-md"
                  disabled={isLoading || !selectedType}
                >
                  <option value="">
                    {!selectedType 
                      ? "Select a type first" 
                      : filteredGangLineages.length === 0 
                        ? "No lineages available" 
                        : "Select a gang affiliation or legacy"
                    }
                  </option>
                  {filteredGangLineages.map((lineage) => (
                    <option key={lineage.id} value={lineage.id}>
                      {lineage.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <Button
                  onClick={() => {
                    clearForm();
                    setShowCreateModal(true);
                  }}
                  variant="outline"
                  className="mr-2"
                  disabled={isLoading}
                >
                  <LuPlus className="h-4 w-4 mr-1" />
                  Create New
                </Button>
              </div>
            </div>

            {/* Gang Lineage Details Form */}
            {selectedGangLineage && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-lg font-semibold">{getTypeLabel(lineageType)} Details</h4>
                  <Button
                    onClick={() => {
                      setGangLineageToDelete(selectedGangLineage.id);
                      setShowDeleteModal(true);
                    }}
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-800"
                    disabled={isLoading}
                  >
                    <LuTrash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                      {getTypeLabel(lineageType)} Name *
                    </label>
                    <Input
                      type="text"
                      value={gangLineageName}
                      onChange={(e) => setGangLineageName(e.target.value)}
                      placeholder="e.g. House Cawdor Lineage"
                      className="w-full"
                      disabled={isLoading}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                      Gang Type *
                    </label>
                    <select
                      value={selectedGangTypeId}
                      onChange={(e) => setSelectedGangTypeId(e.target.value)}
                      className="w-full p-2 border rounded-md"
                      disabled={isLoading}
                    >
                      <option value="">Select a gang type</option>
                      {gangTypes.map((gangType) => (
                        <option key={gangType.gang_type_id} value={gangType.gang_type_id}>
                          {gangType.gang_type}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                      Associated Fighter Type *
                    </label>
                    <select
                      value={associatedFighterTypeId}
                      onChange={(e) => setAssociatedFighterTypeId(e.target.value)}
                      className="w-full p-2 border rounded-md"
                      disabled={isLoading || !selectedGangTypeId}
                    >
                      <option value="">
                        {!selectedGangTypeId ? "Select a gang type first" : "Select a fighter type"}
                      </option>
                      {filteredFighterTypes.map((fighterType) => (
                        <option key={fighterType.id} value={fighterType.id}>
                          {getFighterTypeDisplayName(fighterType)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Fighter Type Access Management - Only show for legacy type */}
                {lineageType === 'legacy' && (
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-2">
                      Fighter Type Access Rules
                    </label>
                    <p className="text-sm text-muted-foreground mb-3">
                      {`Select which fighter types can access this ${getTypeTerm(lineageType)}.`}
                    </p>

                    <div className="mb-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">
                          Gang Type for Access Rules
                        </label>
                        <select
                          value={accessRuleGangTypeId}
                          onChange={(e) => setAccessRuleGangTypeId(e.target.value)}
                          className="w-full p-2 border rounded-md"
                          disabled={isLoading}
                        >
                          <option value="">Select gang type</option>
                          {gangTypes.map((gangType) => (
                            <option key={gangType.gang_type_id} value={gangType.gang_type_id}>
                              {gangType.gang_type}
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">
                          Add Fighter Type Access
                        </label>
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              addFighterTypeAccess(e.target.value);
                              e.target.value = "";
                            }
                          }}
                          className="w-full p-2 border rounded-md"
                          disabled={isLoading || !accessRuleGangTypeId}
                        >
                          <option value="">
                            {!accessRuleGangTypeId 
                              ? "Select a gang type first" 
                              : "Add fighter type access"
                            }
                          </option>
                          {accessRuleGangTypeId && fighterTypes
                            .filter(ft => ft.gang_type_id === accessRuleGangTypeId && !fighterTypeAccess.includes(ft.id))
                            .sort((a, b) => getFighterTypeDisplayName(a).localeCompare(getFighterTypeDisplayName(b)))
                            .map((fighterType) => (
                              <option key={fighterType.id} value={fighterType.id}>
                                {getFighterTypeDisplayName(fighterType)}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {fighterTypeAccess.length === 0 ? (
                        <p className="text-muted-foreground text-sm italic">No fighter types have access to this lineage yet.</p>
                      ) : (
                        fighterTypeAccess.map((fighterTypeId) => {
                          const fighterType = fighterTypes.find(ft => ft.id === fighterTypeId);
                          if (!fighterType) return null;

                          return (
                            <div
                              key={fighterTypeId}
                              className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-muted"
                            >
                              <span>{fighterType.fighter_type}</span>
                              <span className="text-muted-foreground">({fighterType.gang_type})</span>
                              <button
                                type="button"
                                onClick={() => removeFighterTypeAccess(fighterTypeId)}
                                className="hover:text-red-500 focus:outline-none"
                                disabled={isLoading}
                              >
                                <HiX className="h-4 w-4" />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
        </div>

        <div className="border-t px-[10px] py-2 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Close
          </Button>
          <Button
            onClick={handleUpdateGangLineage}
            disabled={isLoading || !selectedGangLineage || !gangLineageName || !selectedGangTypeId || !associatedFighterTypeId || !lineageType}
            className="bg-neutral-900 text-white rounded hover:bg-gray-800"
          >
            {isLoading ? 'Updating...' : 'Update'}
          </Button>
        </div>
      </div>

      {/* Create Gang Lineage Modal */}
      {showCreateModal && (
        <Modal
          title="Create Gang Affiliation or Legacy"
          content={createModalContent}
          onClose={() => {
            setShowCreateModal(false);
            clearForm();
          }}
          onConfirm={handleCreateGangLineage}
          confirmText="Create Gang Lineage"
          confirmDisabled={!gangLineageName || !selectedGangTypeId || !associatedFighterTypeId || !lineageType || isLoading}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <Modal
          title="Delete Gang Lineage"
          content={
            <div className="space-y-4">
              <p>Are you sure you want to delete this gang lineage?</p>
              <p className="text-sm text-red-600">
                This action cannot be undone. The gang lineage will be permanently removed along with all fighter type access rules.
              </p>
            </div>
          }
          onClose={() => {
            setShowDeleteModal(false);
            setGangLineageToDelete('');
          }}
          onConfirm={handleDeleteGangLineage}
          confirmText="Delete Gang Lineage"
          confirmDisabled={isLoading}
        />
      )}
    </div>
  );
}