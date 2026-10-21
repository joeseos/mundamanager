'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from 'sonner';
import { EditionSelect } from '@/components/edition-select';
import {
  AdminGangPortraitForm,
  type PortraitFormHandle,
  type PortraitFormState,
} from '@/components/admin/admin-gang-portrait-form';
import { GangWeaponRulesSection } from '@/components/admin/admin-gang-weapon-rules';

enum OperationType {
  POST = 'POST',
  UPDATE = 'UPDATE'
}

interface AdminGangType {
  id: string;
  gang_type: string;
  alignment: string | null;
  is_hidden: boolean;
  affiliation: boolean;
  trading_post_type_id: string | null;
  gang_origin_category_id: string | null;
  parent_gang_type_id: string | null;
  edition_id: string | null;
}

interface TradingPostType {
  id: string;
  trading_post_name: string;
  edition_id?: string | null;
}

interface OriginCategory {
  id: string;
  category_name: string;
}

interface AdminGangTypesModalProps {
  onClose: () => void;
}

type GangCategory = 'types' | 'portraits';

const EMPTY_PORTRAIT_STATE: PortraitFormState = {
  canSave: false,
  canDelete: false,
  hasSelection: false,
  isBusy: false,
  pendingAction: null,
  isCreateMode: false,
};

export function AdminGangTypesModal({ onClose }: AdminGangTypesModalProps) {
  const queryClient = useQueryClient();
  const portraitFormRef = useRef<PortraitFormHandle>(null);

  const [selectedCategory, setSelectedCategory] = useState<GangCategory>('types');
  const [portraitState, setPortraitState] = useState<PortraitFormState>(EMPTY_PORTRAIT_STATE);
  const [selectedGangTypeId, setSelectedGangTypeId] = useState('');
  const [gangTypeName, setGangTypeName] = useState('');
  const [alignment, setAlignment] = useState('');
  const [isHidden, setIsHidden] = useState(false);
  const [affiliation, setAffiliation] = useState(false);
  const [tradingPostTypeId, setTradingPostTypeId] = useState('');
  const [originCategoryId, setOriginCategoryId] = useState('');
  const [parentGangTypeId, setParentGangTypeId] = useState('');
  const [editionId, setEditionId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);

  const { data: gangTypes = [], isLoading: isLoadingGangTypes } = useQuery<AdminGangType[]>({
    queryKey: ['admin-gang-types', 'detailed'],
    queryFn: async () => {
      const response = await fetch('/api/admin/gang-types?detailed=1');
      if (!response.ok) throw new Error('Failed to fetch gang types');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: tradingPostTypes = [], isLoading: isLoadingTradingPosts } = useQuery<TradingPostType[]>({
    queryKey: ['admin-trading-post-types'],
    queryFn: async () => {
      const response = await fetch('/api/admin/equipment/trading-post-types');
      if (!response.ok) throw new Error('Failed to fetch trading post types');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: originCategories = [], isLoading: isLoadingOriginCategories } = useQuery<OriginCategory[]>({
    queryKey: ['admin-gang-origin-categories'],
    queryFn: async () => {
      const response = await fetch('/api/admin/gang-origin-categories');
      if (!response.ok) throw new Error('Failed to fetch origin categories');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = isLoadingGangTypes || isLoadingTradingPosts || isLoadingOriginCategories || isSubmitting;
  const handlePortraitState = useCallback((state: PortraitFormState) => {
    setPortraitState(state);
  }, []);
  const isFormDisabled = (!isCreateMode && !selectedGangTypeId) || isLoading;

  const filteredGangTypes = useMemo(
    () => editionId
      ? gangTypes.filter(gt => !gt.edition_id || gt.edition_id === editionId)
      : gangTypes,
    [gangTypes, editionId]
  );

  const filteredTradingPosts = useMemo(
    () => editionId
      ? tradingPostTypes.filter(tp => !tp.edition_id || tp.edition_id === editionId)
      : tradingPostTypes,
    [tradingPostTypes, editionId]
  );

  const parentOptions = useMemo(
    () => filteredGangTypes.filter(gt =>
      !gt.parent_gang_type_id &&
      gt.id !== selectedGangTypeId
    ),
    [filteredGangTypes, selectedGangTypeId]
  );

  const selectedGangType = gangTypes.find(gt => gt.id === selectedGangTypeId);
  const willAssignEdition = Boolean(
    !isCreateMode && selectedGangType && !selectedGangType.edition_id && editionId
  );

  const clearFormFields = () => {
    setGangTypeName('');
    setAlignment('');
    setIsHidden(false);
    setAffiliation(false);
    setTradingPostTypeId('');
    setOriginCategoryId('');
    setParentGangTypeId('');
  };

  const applyGangType = (gangType: AdminGangType) => {
    setGangTypeName(gangType.gang_type ?? '');
    setAlignment(gangType.alignment ?? '');
    setIsHidden(Boolean(gangType.is_hidden));
    setAffiliation(Boolean(gangType.affiliation));
    setTradingPostTypeId(gangType.trading_post_type_id ?? '');
    setOriginCategoryId(gangType.gang_origin_category_id ?? '');
    setParentGangTypeId(gangType.parent_gang_type_id ?? '');
    setEditionId(gangType.edition_id || editionId);
  };

  const handleEditionChange = (newEditionId: string) => {
    setEditionId(newEditionId);

    if (newEditionId && selectedGangTypeId) {
      const gangType = gangTypes.find(gt => gt.id === selectedGangTypeId);
      if (gangType?.edition_id && gangType.edition_id !== newEditionId) {
        setSelectedGangTypeId('');
        clearFormFields();
        setIsCreateMode(false);
      }
    }

    if (tradingPostTypeId) {
      const selected = tradingPostTypes.find(tp => tp.id === tradingPostTypeId);
      if (selected?.edition_id && selected.edition_id !== newEditionId) {
        setTradingPostTypeId('');
      }
    }

    if (parentGangTypeId) {
      const selected = gangTypes.find(gt => gt.id === parentGangTypeId);
      if (selected && selected.edition_id !== newEditionId) {
        setParentGangTypeId('');
      }
    }
  };

  const handleGangTypeSelect = (gangTypeId: string) => {
    setSelectedGangTypeId(gangTypeId);
    const gangType = gangTypes.find(gt => gt.id === gangTypeId);
    if (gangType) {
      applyGangType(gangType);
      setIsCreateMode(false);
    } else {
      clearFormFields();
      setIsCreateMode(false);
    }
  };

  const handleCreateNew = () => {
    setSelectedGangTypeId('');
    clearFormFields();
    setIsCreateMode(true);
  };

  const handleSubmitGangType = async (operation: OperationType) => {
    if (!gangTypeName.trim() || !editionId) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        gang_type: gangTypeName.trim(),
        alignment: alignment || null,
        is_hidden: isHidden,
        affiliation,
        trading_post_type_id: tradingPostTypeId || null,
        gang_origin_category_id: originCategoryId || null,
        parent_gang_type_id: parentGangTypeId || null,
        edition_id: editionId,
      };

      const method = operation === OperationType.POST ? 'POST' : 'PATCH';
      const body = JSON.stringify(
        operation === OperationType.POST
          ? payload
          : { id: selectedGangTypeId, ...payload }
      );

      const response = await fetch('/api/admin/gang-types', {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error ||
          `Failed to ${operation === OperationType.POST ? 'create' : 'update'} gang type`
        );
      }

      const resultData = await response.json() as AdminGangType;

      toast.success(
        `Gang type ${operation === OperationType.POST ? 'created' : 'updated'} successfully`
      );

      await queryClient.invalidateQueries({ queryKey: ['admin-gang-types'] });

      if (operation === OperationType.POST && resultData?.id) {
        setSelectedGangTypeId(resultData.id);
        setIsCreateMode(false);
        applyGangType(resultData);
      }
    } catch (error) {
      console.error(`Error executing ${operation} operation:`, error);
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to ${operation === OperationType.POST ? 'create' : 'update'} gang type`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 dark:bg-neutral-700/50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-lg shadow-xl w-full max-w-3xl min-h-0 max-h-svh overflow-y-auto flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-foreground">Manage Gangs</h3>
            <p className="text-sm text-muted-foreground">Create or edit gang types and portraits</p>
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
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Category
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={selectedCategory === 'types' ? 'default' : 'outline'}
                  onClick={() => {
                    setPortraitState(EMPTY_PORTRAIT_STATE);
                    setSelectedCategory('types');
                  }}
                  disabled={isSubmitting || portraitState.isBusy}
                  className={
                    selectedCategory === 'types'
                      ? ''
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }
                >
                  Gang Types
                </Button>
                <Button
                  type="button"
                  variant={selectedCategory === 'portraits' ? 'default' : 'outline'}
                  onClick={() => {
                    setSelectedGangTypeId('');
                    clearFormFields();
                    setIsCreateMode(false);
                    setSelectedCategory('portraits');
                  }}
                  disabled={isSubmitting || portraitState.isBusy}
                  className={
                    selectedCategory === 'portraits'
                      ? ''
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }
                >
                  Gang Portraits
                </Button>
              </div>
            </div>

            {selectedCategory === 'portraits' ? (
              <AdminGangPortraitForm ref={portraitFormRef} onStateChange={handlePortraitState} />
            ) : (
            <>
            <div>
              <EditionSelect value={editionId} onChange={handleEditionChange} defaultToCurrent />
              {willAssignEdition && (
                <p className="text-xs text-amber-600 mt-1">
                  This gang type has no edition. Saving will assign it to the
                  edition selected above.
                </p>
              )}
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-muted-foreground">
                  Select Gang Type
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
                value={selectedGangTypeId}
                onChange={(e) => handleGangTypeSelect(e.target.value)}
                className="w-full p-2 border rounded-md"
                disabled={isLoading}
              >
                <option value="">Select a gang type to edit</option>
                {filteredGangTypes.map((gangType) => (
                  <option key={gangType.id} value={gangType.id}>
                    {gangType.gang_type}
                    {!gangType.edition_id ? ' (no edition)' : ''}
                    {gangType.is_hidden ? ' (hidden)' : ''}
                    {gangType.parent_gang_type_id ? ' (variant)' : ''}
                  </option>
                ))}
              </select>
              {isCreateMode && (
                <p className="text-xs text-amber-600 mt-1">
                  Creating new gang type. Select from dropdown to cancel and edit existing.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Gang Type Name *
              </label>
              <Input
                type="text"
                value={gangTypeName}
                onChange={(e) => setGangTypeName(e.target.value)}
                placeholder="E.g. House Escher, Wyld Hunt"
                className="w-full"
                disabled={isFormDisabled}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Alignment
              </label>
              <select
                value={alignment}
                onChange={(e) => setAlignment(e.target.value)}
                className="w-full p-2 border rounded-md"
                disabled={isFormDisabled}
              >
                <option value="">None</option>
                <option value="Law Abiding">Law Abiding</option>
                <option value="Outlaw">Outlaw</option>
                <option value="Unaligned">Unaligned</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="gang-type-hidden"
                  checked={isHidden}
                  onCheckedChange={(checked) => setIsHidden(checked === true)}
                  disabled={isFormDisabled}
                />
                <label
                  htmlFor="gang-type-hidden"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Hidden
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="gang-type-affiliation"
                  checked={affiliation}
                  onCheckedChange={(checked) => setAffiliation(checked === true)}
                  disabled={isFormDisabled}
                />
                <label
                  htmlFor="gang-type-affiliation"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Uses Affiliations
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Trading Post Type
              </label>
              <select
                value={tradingPostTypeId}
                onChange={(e) => setTradingPostTypeId(e.target.value)}
                className="w-full p-2 border rounded-md"
                disabled={isFormDisabled}
              >
                <option value="">None</option>
                {filteredTradingPosts.map((tradingPost) => (
                  <option key={tradingPost.id} value={tradingPost.id}>
                    {tradingPost.trading_post_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Origin Category
              </label>
              <select
                value={originCategoryId}
                onChange={(e) => setOriginCategoryId(e.target.value)}
                className="w-full p-2 border rounded-md"
                disabled={isFormDisabled}
              >
                <option value="">None</option>
                {originCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.category_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Parent Gang Type
              </label>
              <select
                value={parentGangTypeId}
                onChange={(e) => setParentGangTypeId(e.target.value)}
                className="w-full p-2 border rounded-md"
                disabled={isFormDisabled}
              >
                <option value="">None (root gang type)</option>
                {parentOptions.map((gangType) => (
                  <option key={gangType.id} value={gangType.id}>
                    {gangType.gang_type}
                  </option>
                ))}
              </select>
            </div>

            {!isCreateMode && selectedGangTypeId && (
              <GangWeaponRulesSection key={selectedGangTypeId} gangTypeId={selectedGangTypeId} editionId={editionId} />
            )}
            </>
            )}
          </div>
        </div>

        <div className="border-t px-[10px] py-2 flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={selectedCategory === 'portraits' ? portraitState.isBusy : isLoading}
            className="flex-1"
          >
            Cancel
          </Button>

          {selectedCategory === 'portraits' && portraitState.isCreateMode && (
            <Button
              onClick={() => portraitFormRef.current?.save()}
              disabled={!portraitState.canSave}
              className="flex-1 bg-neutral-900 text-white rounded-sm hover:bg-gray-800"
            >
              {portraitState.pendingAction === 'save' ? 'Creating...' : 'Create Portrait'}
            </Button>
          )}

          {selectedCategory === 'portraits' && portraitState.hasSelection && (
            <>
              <Button
                onClick={() => portraitFormRef.current?.save()}
                disabled={!portraitState.canSave}
                className="flex-1 bg-neutral-900 text-white rounded-sm hover:bg-gray-800"
              >
                {portraitState.pendingAction === 'save' ? 'Updating...' : 'Update Portrait'}
              </Button>
              <Button
                onClick={() => portraitFormRef.current?.remove()}
                disabled={!portraitState.canDelete}
                className="flex-1 bg-red-600 text-white rounded-sm hover:bg-red-700"
              >
                {portraitState.pendingAction === 'delete' ? 'Deleting...' : 'Delete Portrait'}
              </Button>
            </>
          )}

          {selectedCategory === 'types' && isCreateMode && (
            <Button
              onClick={() => handleSubmitGangType(OperationType.POST)}
              disabled={!gangTypeName.trim() || !editionId || isLoading}
              className="flex-1 bg-neutral-900 text-white rounded-sm hover:bg-gray-800"
            >
              {isLoading ? 'Creating...' : 'Create Gang Type'}
            </Button>
          )}

          {selectedCategory === 'types' && !isCreateMode && selectedGangTypeId && (
            <Button
              onClick={() => handleSubmitGangType(OperationType.UPDATE)}
              disabled={!gangTypeName.trim() || !editionId || isLoading}
              className="flex-1 bg-neutral-900 text-white rounded-sm hover:bg-gray-800"
            >
              {isLoading ? 'Updating...' : 'Update Gang Type'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
