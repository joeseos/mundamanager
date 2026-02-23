'use client';

import React, { useState, useEffect } from 'react';
import { List, ListColumn, ListAction } from '@/components/ui/list';
import { CustomSkill } from '@/app/lib/customise/custom-skills';
import { createCustomSkill, updateCustomSkill, deleteCustomSkill, createCustomSkillType, updateCustomSkillType, deleteCustomSkillType } from '@/app/actions/customise/custom-skills';
import { shareCustomSkill } from '@/app/actions/customise/custom-share';
import Modal from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { LuEye, LuSquarePen, LuTrash2 } from 'react-icons/lu';
import { FaRegCopy } from 'react-icons/fa';
import { FiShare2 } from 'react-icons/fi';
import { createClient } from '@/utils/supabase/client';
import { skillSetRank } from '@/utils/skillSetRank';
import { Checkbox } from '@/components/ui/checkbox';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserCampaign } from './custom-shared';

interface CustomiseSkillsProps {
  className?: string;
  initialSkills?: CustomSkill[];
  readOnly?: boolean;
  userId?: string;
  userCampaigns?: UserCampaign[];
}

interface SkillType {
  id: string;
  name: string;
  is_custom?: boolean;
}

export function CustomiseSkills({ className, initialSkills = [], readOnly = false, userId, userCampaigns = [] }: CustomiseSkillsProps) {
  const [skills, setSkills] = useState<CustomSkill[]>(initialSkills);
  const [isLoading, setIsLoading] = useState(false);
  const [editModalData, setEditModalData] = useState<CustomSkill | null>(null);
  const [deleteModalData, setDeleteModalData] = useState<CustomSkill | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [viewModalData, setViewModalData] = useState<CustomSkill | null>(null);
  const [copyModalData, setCopyModalData] = useState<CustomSkill | null>(null);
  const [shareModalData, setShareModalData] = useState<CustomSkill | null>(null);
  const [skillTypes, setSkillTypes] = useState<SkillType[]>([]);
  const [editForm, setEditForm] = useState({ skill_name: '', skill_type_id: '', is_custom_type: false });
  const [createForm, setCreateForm] = useState({ skill_name: '', skill_type_id: '', is_custom_type: false });

  // Inline skill type creation/rename state
  const [newSkillTypeName, setNewSkillTypeName] = useState('');
  const [showNewSkillTypeInput, setShowNewSkillTypeInput] = useState<'create' | 'edit' | null>(null);
  const [skillTypesToDelete, setSkillTypesToDelete] = useState<string[]>([]);

  const supabase = createClient();

  const fetchSkillTypes = async () => {
    if (!userId) return;
    try {
      const [standardResult, customResult] = await Promise.all([
        supabase.from('skill_types').select('id, name').order('name', { ascending: true }),
        supabase.from('custom_skill_types').select('id, name').eq('user_id', userId).order('name', { ascending: true }),
      ]);

      if (standardResult.error) throw standardResult.error;
      if (customResult.error) throw customResult.error;

      const standard = (standardResult.data || []).map(t => ({ ...t, is_custom: false }));
      const custom = (customResult.data || []).map(t => ({ ...t, is_custom: true }));
      setSkillTypes([...custom, ...standard]);
    } catch (error) {
      console.error('Error fetching skill types:', error);
      toast.error('Failed to load skill types');
    }
  };

  const handleAddSkill = () => {
    setCreateModalOpen(true);
    fetchSkillTypes();
  };

  const resetNewSkillTypeInput = () => {
    setShowNewSkillTypeInput(null);
    setNewSkillTypeName('');
  };

  const applySkillTypeDeletions = async () => {
    if (skillTypesToDelete.length === 0) return;
    await Promise.all(skillTypesToDelete.map(typeId => deleteCustomSkillType(typeId)));
    setSkillTypes(prev => prev.filter(t => !skillTypesToDelete.includes(t.id)));
    setSkills(prev => prev.filter(s => !skillTypesToDelete.includes(s.custom_skill_type_id || '')));
    setSkillTypesToDelete([]);
  };

  // Returns the skill type ID to use, or null on failure
  const resolveSkillTypeId = async (form: { skill_type_id: string; is_custom_type: boolean }): Promise<{ id: string; is_custom: boolean } | null> => {
    if (showNewSkillTypeInput === 'create' && newSkillTypeName.trim()) {
      const created = await createCustomSkillType({ name: newSkillTypeName.trim() });
      const newType: SkillType = { id: created.id, name: created.name, is_custom: true };
      setSkillTypes(prev => [newType, ...prev.filter(t => t.id !== created.id)]);
      return { id: created.id, is_custom: true };
    }
    if (showNewSkillTypeInput === 'edit' && newSkillTypeName.trim() && form.skill_type_id) {
      const updated = await updateCustomSkillType(form.skill_type_id, { name: newSkillTypeName.trim() });
      setSkillTypes(prev => prev.map(t => t.id === form.skill_type_id ? { ...t, name: updated.name } : t));
      return { id: form.skill_type_id, is_custom: true };
    }
    if (form.skill_type_id) {
      return { id: form.skill_type_id, is_custom: form.is_custom_type };
    }
    return null;
  };

  const handleCreateModalClose = () => {
    setCreateModalOpen(false);
    setCreateForm({ skill_name: '', skill_type_id: '', is_custom_type: false });
    resetNewSkillTypeInput();
    setSkillTypesToDelete([]);
  };

  const handleCreateModalConfirm = async () => {
    try {
      setIsLoading(true);
      const resolved = await resolveSkillTypeId(createForm);
      if (!resolved) {
        toast.error('Please select or create a skill set');
        return false;
      }
      const newSkill = await createCustomSkill({
        skill_name: createForm.skill_name,
        ...(resolved.is_custom
          ? { custom_skill_type_id: resolved.id }
          : { skill_type_id: resolved.id }
        ),
      });
      setSkills(prev => [...prev, newSkill]);
      await applySkillTypeDeletions();
      resetNewSkillTypeInput();
      toast.success('Custom skill created successfully');
      return true;
    } catch (error) {
      console.error('Error creating skill:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create skill');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditSkill = (skill: CustomSkill) => {
    setEditModalData(skill);
    const isCustomType = !!skill.custom_skill_type_id;
    setEditForm({
      skill_name: skill.skill_name,
      skill_type_id: skill.custom_skill_type_id || skill.skill_type_id || '',
      is_custom_type: isCustomType,
    });
    fetchSkillTypes();
  };

  const handleEditModalClose = () => {
    setEditModalData(null);
    setEditForm({ skill_name: '', skill_type_id: '', is_custom_type: false });
    resetNewSkillTypeInput();
    setSkillTypesToDelete([]);
  };

  const handleEditModalConfirm = async () => {
    if (!editModalData) return false;
    try {
      setIsLoading(true);
      const resolved = await resolveSkillTypeId(editForm);
      if (!resolved) {
        toast.error('Please select or create a skill set');
        return false;
      }
      const updatedSkill = await updateCustomSkill(editModalData.id, {
        skill_name: editForm.skill_name,
        ...(resolved.is_custom
          ? { custom_skill_type_id: resolved.id, skill_type_id: undefined }
          : { skill_type_id: resolved.id, custom_skill_type_id: undefined }
        ),
      });
      setSkills(prev =>
        prev.map(item => item.id === editModalData.id ? { ...item, ...updatedSkill } : item)
      );
      await applySkillTypeDeletions();
      resetNewSkillTypeInput();
      toast.success('Skill updated successfully');
      return true;
    } catch (error) {
      console.error('Error updating skill:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update skill');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSkill = (skill: CustomSkill) => {
    setDeleteModalData(skill);
  };

  const handleDeleteModalConfirm = async () => {
    if (!deleteModalData) return false;
    try {
      setIsLoading(true);
      await deleteCustomSkill(deleteModalData.id);
      setSkills(prev => prev.filter(item => item.id !== deleteModalData.id));
      toast.success('Skill deleted successfully');
      return true;
    } catch (error) {
      console.error('Error deleting skill:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete skill');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewSkill = (skill: CustomSkill) => {
    setViewModalData(skill);
  };

  const handleCopySkill = (skill: CustomSkill) => {
    setCopyModalData(skill);
  };

  const handleCopyModalConfirm = async () => {
    if (!copyModalData) return false;
    try {
      setIsLoading(true);
      await createCustomSkill({
        skill_name: copyModalData.skill_name,
        ...(copyModalData.custom_skill_type_id
          ? { custom_skill_type_id: copyModalData.custom_skill_type_id }
          : { skill_type_id: copyModalData.skill_type_id }
        ),
      });
      toast.success(`${copyModalData.skill_name} has been copied to your custom skills.`);
      return true;
    } catch (error) {
      console.error('Error copying skill:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to copy skill');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const columns: ListColumn[] = [
    {
      key: 'skill_name',
      label: 'Name',
      align: 'left',
      width: '50%',
    },
    {
      key: 'skill_type_name',
      label: 'Skill Set',
      align: 'left',
      width: '40%',
      cellClassName: 'text-sm text-muted-foreground',
    },
  ];

  const actions: ListAction[] = readOnly
    ? [
        {
          icon: <LuEye className="h-4 w-4" />,
          onClick: (item: CustomSkill) => handleViewSkill(item),
          variant: 'outline',
          size: 'sm',
          className: 'text-xs px-1.5 h-6',
        },
        {
          icon: <FaRegCopy className="h-4 w-4" />,
          onClick: (item: CustomSkill) => handleCopySkill(item),
          variant: 'outline',
          size: 'sm',
          className: 'text-xs px-1.5 h-6',
        },
      ]
    : [
        {
          icon: <FiShare2 className="h-4 w-4" />,
          onClick: (item: CustomSkill) => setShareModalData(item),
          variant: 'outline',
          size: 'sm',
          className: 'text-xs px-1.5 h-6',
        },
        {
          icon: <LuSquarePen className="h-4 w-4" />,
          onClick: (item: CustomSkill) => handleEditSkill(item),
          variant: 'outline',
          size: 'sm',
          className: 'text-xs px-1.5 h-6',
        },
        {
          icon: <LuTrash2 className="h-4 w-4" />,
          onClick: (item: CustomSkill) => handleDeleteSkill(item),
          variant: 'outline_remove',
          size: 'sm',
          className: 'text-xs px-1.5 h-6',
        },
      ];

  const renderSkillTypeOptions = () => {
    const customTypes = skillTypes.filter(t => t.is_custom);
    const standardTypes = skillTypes.filter(t => !t.is_custom);

    const groupByLabel: Record<string, SkillType[]> = {};
    standardTypes.forEach(type => {
      const rank = skillSetRank[type.name.toLowerCase()] ?? Infinity;
      let groupLabel = 'Misc.';
      if (rank <= 19) groupLabel = 'Universal Skill Sets';
      else if (rank <= 39) groupLabel = 'Gang-specific Skill Sets';
      else if (rank <= 59) groupLabel = 'Wyrd Powers';
      else if (rank <= 69) groupLabel = 'Cult Wyrd Powers';
      else if (rank <= 79) groupLabel = 'Psychoteric Whispers';
      else if (rank <= 89) groupLabel = 'Legendary Names';
      else if (rank <= 99) groupLabel = 'Ironhead Squat Mining Clans';
      if (!groupByLabel[groupLabel]) groupByLabel[groupLabel] = [];
      groupByLabel[groupLabel].push(type);
    });

    const sortedGroupLabels = Object.keys(groupByLabel).sort((a, b) => {
      const aRank = Math.min(...groupByLabel[a].map(t => skillSetRank[t.name.toLowerCase()] ?? Infinity));
      const bRank = Math.min(...groupByLabel[b].map(t => skillSetRank[t.name.toLowerCase()] ?? Infinity));
      return aRank - bRank;
    });

    return (
      <>
        {customTypes.length > 0 && (
          <optgroup label="Custom Skill Sets">
            {customTypes.sort((a, b) => a.name.localeCompare(b.name)).map(type => (
              <option key={type.id} value={type.id}>{type.name}</option>
            ))}
          </optgroup>
        )}
        {sortedGroupLabels.map(groupLabel => {
          const groupTypes = groupByLabel[groupLabel].sort((a, b) => {
            const rankA = skillSetRank[a.name.toLowerCase()] ?? Infinity;
            const rankB = skillSetRank[b.name.toLowerCase()] ?? Infinity;
            return rankA - rankB;
          });
          return (
            <optgroup key={groupLabel} label={groupLabel}>
              {groupTypes.map(type => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </optgroup>
          );
        })}
      </>
    );
  };

  const renderSkillTypeField = (
    form: { skill_name: string; skill_type_id: string; is_custom_type: boolean },
    setForm: (v: typeof form) => void,
    showDeleteSection: boolean = false
  ) => {
    const selectedType = skillTypes.find(t => t.id === form.skill_type_id);
    const canRename = form.is_custom_type && selectedType;

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-muted-foreground">
            Skill Set *
          </label>
          {canRename && showNewSkillTypeInput !== 'create' && (
            <Button
              type="button"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => {
                setShowNewSkillTypeInput('edit');
                setNewSkillTypeName(selectedType.name);
              }}
            >
              Rename
            </Button>
          )}
        </div>

        {showNewSkillTypeInput ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={newSkillTypeName}
              onChange={(e) => setNewSkillTypeName(e.target.value)}
              className="flex-1 p-2 border rounded-md text-sm"
              placeholder={showNewSkillTypeInput === 'create' ? 'New skill set name' : 'New name'}
              autoFocus
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetNewSkillTypeInput}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <select
              value={form.skill_type_id}
              onChange={(e) => {
                const selected = skillTypes.find(t => t.id === e.target.value);
                setForm({ ...form, skill_type_id: e.target.value, is_custom_type: selected?.is_custom ?? false });
              }}
              className="flex-1 p-1 border rounded"
            >
              <option value="">Select a skill set</option>
              {renderSkillTypeOptions()}
            </select>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setShowNewSkillTypeInput('create');
                setNewSkillTypeName('');
              }}
            >
              New
            </Button>
          </div>
        )}

        {/* Custom skill types list for deletion */}
        {showDeleteSection && skillTypes.filter(t => t.is_custom).length > 0 && (
          <div className="mt-2 space-y-1">
            <p className="text-xs text-muted-foreground">Delete custom skill sets:</p>
            {skillTypes.filter(t => t.is_custom).sort((a, b) => a.name.localeCompare(b.name)).map(type => (
              <div key={type.id} className="flex items-center gap-2">
                <Checkbox
                  id={`delete-type-${type.id}`}
                  checked={skillTypesToDelete.includes(type.id)}
                  onCheckedChange={(checked) => {
                    setSkillTypesToDelete(prev =>
                      checked ? [...prev, type.id] : prev.filter(id => id !== type.id)
                    );
                  }}
                />
                <label
                  htmlFor={`delete-type-${type.id}`}
                  className="text-sm cursor-pointer"
                >
                  {type.name}
                </label>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const sortSkills = (a: CustomSkill, b: CustomSkill) => {
    return a.skill_name.localeCompare(b.skill_name);
  };

  return (
    <div className={className}>
      <List<CustomSkill>
        title="Skills"
        items={skills}
        columns={columns}
        actions={actions}
        onAdd={readOnly ? undefined : handleAddSkill}
        addButtonText="Add"
        emptyMessage="No custom skills created yet."
        isLoading={isLoading}
        sortBy={sortSkills}
      />

      {/* Create Modal */}
      {createModalOpen && (
        <Modal
          title="Create Custom Skill"
          content={
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Skill Name *
                </label>
                <input
                  type="text"
                  value={createForm.skill_name}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, skill_name: e.target.value }))}
                  className="w-full p-2 border rounded-md"
                  placeholder="Enter skill name"
                />
              </div>
              {renderSkillTypeField(createForm, setCreateForm)}
            </div>
          }
          onClose={handleCreateModalClose}
          onConfirm={handleCreateModalConfirm}
          confirmText="Create Skill"
          confirmDisabled={!createForm.skill_name.trim() || (!createForm.skill_type_id && !newSkillTypeName.trim()) || isLoading}
        />
      )}

      {/* Edit Modal */}
      {editModalData && (
        <Modal
          title="Edit Skill"
          content={
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Skill Name *
                </label>
                <input
                  type="text"
                  value={editForm.skill_name}
                  onChange={(e) => setEditForm(prev => ({ ...prev, skill_name: e.target.value }))}
                  className="w-full p-2 border rounded-md"
                  placeholder="Enter skill name"
                />
              </div>
              {renderSkillTypeField(editForm, setEditForm, true)}
            </div>
          }
          onClose={handleEditModalClose}
          onConfirm={handleEditModalConfirm}
          confirmText="Save Changes"
          confirmDisabled={!editForm.skill_name.trim() || (!editForm.skill_type_id && !newSkillTypeName.trim()) || isLoading}
        />
      )}

      {/* View Modal */}
      {viewModalData && (
        <Modal
          title="View Skill"
          content={
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Skill Name
                </label>
                <div className="w-full p-2 border rounded-md bg-muted">
                  {viewModalData.skill_name}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Skill Set
                </label>
                <div className="w-full p-2 border rounded-md bg-muted">
                  {viewModalData.skill_type_name || 'Unknown'}
                </div>
              </div>
            </div>
          }
          onClose={() => setViewModalData(null)}
          hideCancel={true}
        />
      )}

      {/* Delete Modal */}
      {deleteModalData && (
        <Modal
          title="Delete Skill"
          content={
            <div className="space-y-4">
              <p>Are you sure you want to delete <strong>{deleteModalData.skill_name}</strong>?</p>
              <p className="text-sm text-red-600">
                <strong>Warning:</strong> This will be removed from any fighters that currently have this skill.
              </p>
            </div>
          }
          onClose={() => setDeleteModalData(null)}
          onConfirm={handleDeleteModalConfirm}
          confirmText="Delete"
        />
      )}

      {/* Copy Modal */}
      {copyModalData && (
        <Modal
          title="Copy Custom Skill"
          content={
            <div className="space-y-4">
              <p>Do you want to copy <strong>"{copyModalData.skill_name}"</strong> into your own custom skills?</p>
            </div>
          }
          onClose={() => setCopyModalData(null)}
          onConfirm={handleCopyModalConfirm}
          confirmText="Copy Custom Skill"
        />
      )}

      {/* Share Modal */}
      {shareModalData && userId && (
        <ShareCustomSkillModal
          skill={shareModalData}
          userCampaigns={userCampaigns}
          onClose={() => setShareModalData(null)}
        />
      )}
    </div>
  );
}

// Share modal for custom skills
interface ShareCustomSkillModalProps {
  skill: CustomSkill;
  userCampaigns: UserCampaign[];
  onClose: () => void;
  onSuccess?: () => void;
}

function ShareCustomSkillModal({
  skill,
  userCampaigns,
  onClose,
  onSuccess,
}: ShareCustomSkillModalProps) {
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);

  const queryClient = useQueryClient();

  const { data: sharedCampaignIds = [], isLoading, isSuccess, error: fetchError } = useQuery({
    queryKey: ['customSharedCampaigns', 'skill', skill.id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('custom_shared')
        .select('campaign_id')
        .eq('custom_skill_id', skill.id);

      if (error) throw error;
      return data?.map(share => share.campaign_id) || [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (isSuccess) {
      setSelectedCampaigns(sharedCampaignIds);
    }
  }, [isSuccess, sharedCampaignIds]);

  useEffect(() => {
    if (fetchError) {
      toast.error('Failed to load shared campaigns');
    }
  }, [fetchError]);

  const shareSkillMutation = useMutation({
    mutationFn: (campaignIds: string[]) => shareCustomSkill(skill.id, campaignIds),
    onSuccess: (result, campaignIds) => {
      if (result.success) {
        toast.success(campaignIds.length > 0
            ? `Custom skill shared to ${campaignIds.length} campaign${campaignIds.length !== 1 ? 's' : ''}`
            : 'Custom skill unshared from all campaigns');
        queryClient.invalidateQueries({ queryKey: ['customSharedCampaigns', 'skill', skill.id] });
        onSuccess?.();
        onClose();
      } else {
        toast.error(result.error || 'Failed to share custom skill');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to share custom skill');
    },
  });

  const handleToggleCampaign = (campaignId: string) => {
    setSelectedCampaigns(prev =>
      prev.includes(campaignId)
        ? prev.filter(id => id !== campaignId)
        : [...prev, campaignId]
    );
  };

  const handleSubmit = () => {
    shareSkillMutation.mutate(selectedCampaigns);
    return true;
  };

  return (
    <Modal
      title="Share Custom Skill"
      helper="Select campaigns to share this custom skill with"
      onClose={onClose}
      onConfirm={handleSubmit}
      confirmText={shareSkillMutation.isPending ? 'Sharing...' : 'Share Skill'}
      confirmDisabled={shareSkillMutation.isPending || isLoading}
      width="md"
    >
      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : userCampaigns.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>You're not part of any campaigns yet.</p>
            <p className="text-sm mt-2">You need to be an arbitrator of a campaign to share custom skills to it.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground mb-4">
              Sharing <strong>{skill.skill_name}</strong> to campaigns:
            </p>
            {userCampaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="flex items-start space-x-3 p-3 border rounded-md hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  id={`skill-campaign-${campaign.id}`}
                  checked={selectedCampaigns.includes(campaign.id)}
                  onCheckedChange={() => handleToggleCampaign(campaign.id)}
                  className="mt-0.5"
                />
                <label htmlFor={`skill-campaign-${campaign.id}`} className="flex-1 cursor-pointer">
                  <div className="font-medium">{campaign.campaign_name}</div>
                  {campaign.status && (
                    <div className="text-sm text-muted-foreground">Status: {campaign.status}</div>
                  )}
                </label>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
