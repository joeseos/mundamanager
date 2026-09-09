'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from 'sonner';
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { EditionSelect } from '@/components/edition-select';
import { normaliseDefaultImageUrls, type DefaultImageEntry } from '@/types/gang';

enum OperationType {
  POST = 'POST',
  UPDATE = 'UPDATE'
}

interface AdminGangType {
  gang_type_id: string;
  gang_type: string;
  alignment: string | null;
  is_hidden: boolean;
  affiliation: boolean;
  trading_post_type_id: string | null;
  gang_origin_category_id: string | null;
  parent_gang_type_id: string | null;
  default_image_urls: unknown[] | null;
  edition_id: string | null;
}

interface TradingPostType {
  id: string;
  trading_post_name: string;
  edition_id?: string | null;
}

interface GangOrigin {
  id: string;
  origin_name: string;
  edition_id?: string | null;
  category_id: string | null;
  category_name: string;
}

interface OriginCategory {
  id: string;
  category_name: string;
}

interface ImageFormEntry {
  url: string;
  creditName: string;
  creditUrl: string;
  creditSuffix: string;
}

interface AdminGangTypesModalProps {
  onClose: () => void;
}

function emptyImageEntry(): ImageFormEntry {
  return { url: '', creditName: '', creditUrl: '', creditSuffix: '' };
}

function isPreviewableUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function DefaultImagePreview({ url, className }: { url: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const trimmed = url.trim();
  const previewable = isPreviewableUrl(trimmed);

  useEffect(() => {
    setFailed(false);
  }, [trimmed]);

  return (
    <div className={`overflow-hidden rounded-full border bg-muted flex items-center justify-center ${className ?? 'size-20'}`}>
      {previewable && !failed ? (
        // Native img: admin URLs may be hosts not listed in next/image remotePatterns.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={trimmed}
          alt=""
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-[10px] text-muted-foreground text-center px-1">
          {trimmed ? 'No preview' : 'No image'}
        </span>
      )}
    </div>
  );
}

function toImageFormEntries(raw: unknown[] | null | undefined): ImageFormEntry[] {
  const normalised = normaliseDefaultImageUrls(raw) ?? [];
  if (normalised.length === 0) return [];
  return normalised.map((entry) => ({
    url: entry.url ?? '',
    creditName: entry.credit?.name ?? '',
    creditUrl: entry.credit?.url ?? '',
    creditSuffix: entry.credit?.suffix ?? '',
  }));
}

function isEmptyImageRow(entry: ImageFormEntry): boolean {
  return !entry.url.trim()
    && !entry.creditName.trim()
    && !entry.creditUrl.trim()
    && !entry.creditSuffix.trim();
}

function withoutTrailingEmptyImageRows(entries: ImageFormEntry[]): ImageFormEntry[] {
  let end = entries.length;
  while (end > 0 && isEmptyImageRow(entries[end - 1])) {
    end -= 1;
  }
  return entries.slice(0, end);
}

function defaultImagesValidationError(entries: ImageFormEntry[]): string | null {
  const active = withoutTrailingEmptyImageRows(entries);
  for (let index = 0; index < active.length; index++) {
    const entry = active[index];
    const imageUrl = entry.url.trim();
    if (!imageUrl) {
      return `Image ${index + 1}: image URL is required`;
    }
    if (!isPreviewableUrl(imageUrl)) {
      return `Image ${index + 1}: image URL must be a valid http(s) URL`;
    }

    const creditUrl = entry.creditUrl.trim();
    if (creditUrl && !isPreviewableUrl(creditUrl)) {
      return `Image ${index + 1}: credit URL must be a valid http(s) URL`;
    }
  }
  return null;
}

function toDefaultImagePayload(entries: ImageFormEntry[]): DefaultImageEntry[] | null {
  const parsed = withoutTrailingEmptyImageRows(entries)
    .map((entry) => {
      const url = entry.url.trim();
      const creditName = entry.creditName.trim();
      const creditUrl = entry.creditUrl.trim();
      const creditSuffix = entry.creditSuffix.trim();
      const credit: DefaultImageEntry['credit'] = {
        ...(creditName ? { name: creditName } : {}),
        ...(creditUrl ? { url: creditUrl } : {}),
        ...(creditSuffix ? { suffix: creditSuffix } : {}),
      };

      return Object.keys(credit).length > 0 ? { url, credit } : { url };
    });

  return parsed.length > 0 ? parsed : null;
}

export function AdminGangTypesModal({ onClose }: AdminGangTypesModalProps) {
  const queryClient = useQueryClient();

  const [selectedGangTypeId, setSelectedGangTypeId] = useState('');
  const [gangTypeName, setGangTypeName] = useState('');
  const [alignment, setAlignment] = useState('');
  const [isHidden, setIsHidden] = useState(false);
  const [affiliation, setAffiliation] = useState(false);
  const [tradingPostTypeId, setTradingPostTypeId] = useState('');
  const [originCategoryId, setOriginCategoryId] = useState('');
  const [parentGangTypeId, setParentGangTypeId] = useState('');
  const [defaultImages, setDefaultImages] = useState<ImageFormEntry[]>([]);
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

  const { data: origins = [], isLoading: isLoadingOrigins } = useQuery<GangOrigin[]>({
    queryKey: ['admin-gang-origins'],
    queryFn: async () => {
      const response = await fetch('/api/admin/gang-origins');
      if (!response.ok) throw new Error('Failed to fetch gang origins');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = isLoadingGangTypes || isLoadingTradingPosts || isLoadingOrigins || isSubmitting;
  const isFormDisabled = (!isCreateMode && !selectedGangTypeId) || isLoading;

  const originCategories = useMemo<OriginCategory[]>(() => {
    const byId = new Map<string, OriginCategory>();
    for (const origin of origins) {
      if (!origin.category_id) continue;
      if (!byId.has(origin.category_id)) {
        byId.set(origin.category_id, {
          id: origin.category_id,
          category_name: origin.category_name,
        });
      }
    }
    return [...byId.values()].sort((a, b) => a.category_name.localeCompare(b.category_name));
  }, [origins]);

  const filteredGangTypes = useMemo(
    () => editionId
      ? gangTypes.filter(gt => gt.edition_id === editionId)
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
      gt.gang_type_id !== selectedGangTypeId
    ),
    [filteredGangTypes, selectedGangTypeId]
  );

  const clearFormFields = () => {
    setGangTypeName('');
    setAlignment('');
    setIsHidden(false);
    setAffiliation(false);
    setTradingPostTypeId('');
    setOriginCategoryId('');
    setParentGangTypeId('');
    setDefaultImages([]);
  };

  const applyGangType = (gangType: AdminGangType) => {
    setGangTypeName(gangType.gang_type ?? '');
    setAlignment(gangType.alignment ?? '');
    setIsHidden(Boolean(gangType.is_hidden));
    setAffiliation(Boolean(gangType.affiliation));
    setTradingPostTypeId(gangType.trading_post_type_id ?? '');
    setOriginCategoryId(gangType.gang_origin_category_id ?? '');
    setParentGangTypeId(gangType.parent_gang_type_id ?? '');
    setDefaultImages(toImageFormEntries(gangType.default_image_urls));
    setEditionId(gangType.edition_id ?? '');
  };

  const handleEditionChange = (newEditionId: string) => {
    setEditionId(newEditionId);

    if (newEditionId && selectedGangTypeId) {
      const gangType = gangTypes.find(gt => gt.gang_type_id === selectedGangTypeId);
      if (gangType && gangType.edition_id !== newEditionId) {
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
      const selected = gangTypes.find(gt => gt.gang_type_id === parentGangTypeId);
      if (selected && selected.edition_id !== newEditionId) {
        setParentGangTypeId('');
      }
    }
  };

  const handleGangTypeSelect = (gangTypeId: string) => {
    setSelectedGangTypeId(gangTypeId);
    const gangType = gangTypes.find(gt => gt.gang_type_id === gangTypeId);
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

  const updateImageEntry = (index: number, patch: Partial<ImageFormEntry>) => {
    setDefaultImages((current) => current.map((entry, i) => (
      i === index ? { ...entry, ...patch } : entry
    )));
  };

  const handleSubmitGangType = async (operation: OperationType) => {
    if (!gangTypeName.trim() || !editionId) {
      toast.error('Please fill in all required fields');
      return;
    }

    const imagesError = defaultImagesValidationError(defaultImages);
    if (imagesError) {
      toast.error(imagesError);
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
        default_image_urls: toDefaultImagePayload(defaultImages),
        edition_id: editionId,
      };

      const method = operation === OperationType.POST ? 'POST' : 'PATCH';
      const body = JSON.stringify(
        operation === OperationType.POST
          ? payload
          : { gang_type_id: selectedGangTypeId, ...payload }
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

      if (operation === OperationType.POST && resultData?.gang_type_id) {
        setSelectedGangTypeId(resultData.gang_type_id);
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
            <h3 className="text-xl md:text-2xl font-bold text-foreground">Manage Gang Types</h3>
            <p className="text-sm text-muted-foreground">Create or edit gang types</p>
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
            <EditionSelect value={editionId} onChange={handleEditionChange} defaultToCurrent />

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
                  <option key={gangType.gang_type_id} value={gangType.gang_type_id}>
                    {gangType.gang_type}
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
                  <option key={gangType.gang_type_id} value={gangType.gang_type_id}>
                    {gangType.gang_type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-muted-foreground">
                  Default Images
                </label>
                <Button
                  type="button"
                  onClick={() => setDefaultImages((current) => [...current, emptyImageEntry()])}
                  disabled={isFormDisabled}
                  className="text-xs h-7 px-3"
                >
                  <LuPlus className="h-4 w-4 mr-1" />
                  Add Image
                </Button>
              </div>
              {defaultImages.length === 0 && (
                <p className="text-xs text-muted-foreground">No default images.</p>
              )}
              <div className="space-y-3">
                {defaultImages.map((entry, index) => (
                  <div key={index} className="border rounded-md p-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium text-muted-foreground">
                        Image {index + 1}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDefaultImages((current) => current.filter((_, i) => i !== index))}
                        disabled={isFormDisabled}
                        className="text-xs h-7 px-2"
                      >
                        <LuTrash2 className="h-4 w-4 mr-1" />
                        Remove
                      </Button>
                    </div>
                    <div className="flex gap-3 items-start">
                      <DefaultImagePreview url={entry.url} className="size-24 shrink-0" />
                      <div className="flex-1 space-y-2 min-w-0">
                        <Input
                          type="text"
                          value={entry.url}
                          onChange={(e) => updateImageEntry(index, { url: e.target.value })}
                          placeholder="Image URL"
                          className="w-full"
                          disabled={isFormDisabled}
                        />
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <Input
                            type="text"
                            value={entry.creditName}
                            onChange={(e) => updateImageEntry(index, { creditName: e.target.value })}
                            placeholder="Credit name"
                            disabled={isFormDisabled}
                          />
                          <Input
                            type="text"
                            value={entry.creditUrl}
                            onChange={(e) => updateImageEntry(index, { creditUrl: e.target.value })}
                            placeholder="Credit URL"
                            disabled={isFormDisabled}
                          />
                          <Input
                            type="text"
                            value={entry.creditSuffix}
                            onChange={(e) => updateImageEntry(index, { creditSuffix: e.target.value })}
                            placeholder="Credit suffix"
                            disabled={isFormDisabled}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
              onClick={() => handleSubmitGangType(OperationType.POST)}
              disabled={!gangTypeName.trim() || !editionId || isLoading}
              className="flex-1 bg-neutral-900 text-white rounded-sm hover:bg-gray-800"
            >
              {isLoading ? 'Creating...' : 'Create Gang Type'}
            </Button>
          )}

          {!isCreateMode && selectedGangTypeId && (
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
