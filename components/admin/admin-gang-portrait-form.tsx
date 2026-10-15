'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Cropper from 'react-easy-crop';
import { toast } from 'sonner';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { DefaultImageCreditLine } from '@/components/ui/default-image-credit-line';
import { Input } from '@/components/ui/input';
import Modal from '@/components/ui/modal';
import { createClient } from '@/utils/supabase/client';
import { gangPortraitPublicUrl } from '@/types/gang';
import { isValidHttpUrl } from '@/utils/http-url';
import {
  compareGangPortraits,
  GANG_PORTRAIT_STYLES,
  type GangPortrait,
} from '@/utils/gang-portraits';
import {
  type CropArea,
  getCroppedImg,
  processImageFile,
  validateImageFile,
} from '@/utils/image-processing';

const COGWHEEL_URL =
  'https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/cogwheel-gang-portrait_vbu4c5.webp';
const PORTRAIT_BUCKET = 'gang-type-images';
const PORTRAIT_PX = 512;
const STYLES_SET = new Set<string>(GANG_PORTRAIT_STYLES);

const STYLE_FILE_SLUG: Record<string, string> = {
  colour: 'colour',
  'black & white': 'bw',
  'ai-assisted': 'ai',
};

export interface PortraitFormState {
  canSave: boolean;
  canDelete: boolean;
  hasSelection: boolean;
  isBusy: boolean;
  pendingAction: 'save' | 'delete' | null;
  isCreateMode: boolean;
}

export interface PortraitFormHandle {
  save: () => void;
  remove: () => void;
}

interface AdminGangPortraitFormProps {
  onStateChange: (state: PortraitFormState) => void;
}

function slugPart(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.slice(0, 60) || 'portrait';
}

function portraitBaseName(group: string, label: string, style: string): string {
  const parts = [slugPart(group)];
  if (label.trim()) parts.push(slugPart(label));
  if (style !== 'colour') parts.push(STYLE_FILE_SLUG[style] ?? slugPart(style));
  return parts.join('-');
}

function candidatePath(base: string, suffix?: number): string {
  const name = suffix ? `${base}-${suffix}` : base;
  return `admin/${name}.webp`;
}

function isDuplicateStorageError(error: { message?: string; statusCode?: string | number }): boolean {
  const message = error.message?.toLowerCase() ?? '';
  const status = String(error.statusCode ?? '');
  return status === '409' || message.includes('already exists') || message.includes('duplicate');
}

async function listAdminPaths(): Promise<Set<string>> {
  const supabase = createClient();
  const paths = new Set<string>();
  const pageSize = 1000;

  for (let offset = 0; offset < 10000; offset += pageSize) {
    const { data, error } = await supabase.storage.from(PORTRAIT_BUCKET).list('admin', {
      limit: pageSize,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error || !data) return paths;
    for (const file of data) {
      if (file.name) paths.add(`admin/${file.name}`);
    }
    if (data.length < pageSize) break;
  }

  return paths;
}

function nextFreePath(base: string, taken: Set<string>): string {
  let suffix: number | undefined;
  let path = candidatePath(base);
  while (taken.has(path)) {
    suffix = suffix ? suffix + 1 : 2;
    path = candidatePath(base, suffix);
  }
  return path;
}

async function uploadPortraitBlob(
  blob: Blob,
  group: string,
  label: string,
  style: string,
  reservedPaths: Set<string>,
): Promise<string> {
  const taken = new Set<string>([...reservedPaths, ...(await listAdminPaths())]);
  const base = portraitBaseName(group, label, style);
  const supabase = createClient();

  for (let attempt = 0; attempt < 50; attempt++) {
    const path = nextFreePath(base, taken);
    const { error } = await supabase.storage.from(PORTRAIT_BUCKET).upload(path, blob, {
      contentType: 'image/webp',
      cacheControl: 'no-cache',
      upsert: false,
    });
    if (!error) return path;
    if (!isDuplicateStorageError(error)) throw error;
    taken.add(path);
  }

  throw new Error('Could not find a free image path');
}

function isAdminUploadedPath(storagePath: string): boolean {
  return storagePath.startsWith('admin/') && !storagePath.includes('..');
}

async function removePortraitFile(storagePath: string) {
  if (!isAdminUploadedPath(storagePath)) return;
  const supabase = createClient();
  const { error } = await supabase.storage.from(PORTRAIT_BUCKET).remove([storagePath]);
  if (error) throw error;
}

function portraitOption(portrait: GangPortrait) {
  const primary = [portrait.group_label, portrait.label].filter(Boolean).join(' · ');
  const artist = portrait.credit?.name?.trim() ?? '';
  const detail = [artist ? `• ${artist}` : '', portrait.style].filter(Boolean).join(' · ');
  return {
    value: portrait.id,
    label: (
      <span className="inline-flex items-baseline gap-1 min-w-0">
        <span className="truncate">{primary}</span>
        {detail && (
          <span className="text-xs text-muted-foreground shrink-0">
            {detail}
          </span>
        )}
      </span>
    ),
    displayValue: [primary, artist, portrait.style].filter(Boolean).join(' '),
  };
}

export const AdminGangPortraitForm = forwardRef<PortraitFormHandle, AdminGangPortraitFormProps>(
  function AdminGangPortraitForm({ onStateChange }, ref) {
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const onStateChangeRef = useRef(onStateChange);
    onStateChangeRef.current = onStateChange;

    const [selectedId, setSelectedId] = useState('');
    const [groupLabel, setGroupLabel] = useState('');
    const [style, setStyle] = useState<string>(GANG_PORTRAIT_STYLES[0]);
    const [label, setLabel] = useState('');
    const [creditName, setCreditName] = useState('');
    const [creditUrl, setCreditUrl] = useState('');
    const [creditSuffix, setCreditSuffix] = useState('');
    const [isCreateMode, setIsCreateMode] = useState(false);
    const [isBusy, setIsBusy] = useState(false);
    const [pendingAction, setPendingAction] = useState<'save' | 'delete' | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [pendingImage, setPendingImage] = useState<string | null>(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null);

    const { data: portraits = [], isLoading } = useQuery<GangPortrait[]>({
      queryKey: ['admin-gang-portraits'],
      queryFn: async () => {
        const response = await fetch('/api/admin/gang-portraits');
        if (!response.ok) throw new Error('Failed to fetch gang portraits');
        return response.json();
      },
      staleTime: 60 * 1000,
    });

    const options = useMemo(() => {
      return [...portraits]
        .sort((a, b) => {
          const group = a.group_label.localeCompare(b.group_label, undefined, { sensitivity: 'base' });
          if (group !== 0) return group;
          return compareGangPortraits(a, b);
        })
        .map((portrait) => portraitOption(portrait));
    }, [portraits]);

    const selectedPortrait = portraits.find((portrait) => portrait.id === selectedId);
    const fieldsDisabled = (!isCreateMode && !selectedId) || isBusy || isLoading || isProcessing;
    const creditUrlTrimmed = creditUrl.trim();
    const creditUrlValid = creditUrlTrimmed === '' || isValidHttpUrl(creditUrlTrimmed);
    const metadataValid =
      groupLabel.trim() !== '' &&
      STYLES_SET.has(style) &&
      creditName.trim() !== '' &&
      creditUrlValid;
    const imageReady = Boolean(pendingImage && croppedAreaPixels);
    const hasSelection = !isCreateMode && Boolean(selectedId);
    const canSave =
      metadataValid &&
      !isBusy &&
      !isLoading &&
      !isProcessing &&
      (isCreateMode ? imageReady : hasSelection && (!pendingImage || imageReady));
    const canDelete = hasSelection && !isBusy && !isLoading;

    useEffect(() => {
      onStateChangeRef.current({
        canSave,
        canDelete,
        hasSelection,
        isBusy: isBusy || isProcessing,
        pendingAction,
        isCreateMode,
      });
    }, [canSave, canDelete, hasSelection, isBusy, isProcessing, isCreateMode, pendingAction]);

    const clearPendingImage = () => {
      setPendingImage(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const clearFields = () => {
      setGroupLabel('');
      setStyle(GANG_PORTRAIT_STYLES[0]);
      setLabel('');
      setCreditName('');
      setCreditUrl('');
      setCreditSuffix('');
      clearPendingImage();
    };

    const applyPortrait = (portrait: GangPortrait) => {
      setGroupLabel(portrait.group_label ?? '');
      setStyle(portrait.style || GANG_PORTRAIT_STYLES[0]);
      setLabel(portrait.label ?? '');
      setCreditName(portrait.credit?.name ?? '');
      setCreditUrl(portrait.credit?.url ?? '');
      setCreditSuffix(portrait.credit?.suffix ?? '');
      clearPendingImage();
    };

    const handleSelect = (portraitId: string) => {
      setSelectedId(portraitId);
      const portrait = portraits.find((item) => item.id === portraitId);
      if (portrait) {
        applyPortrait(portrait);
        setIsCreateMode(false);
      } else {
        clearFields();
        setIsCreateMode(false);
      }
    };

    const handleCreateNew = () => {
      setSelectedId('');
      clearFields();
      setIsCreateMode(true);
    };

    const onCropComplete = useCallback((_area: CropArea, pixels: CropArea) => {
      setCroppedAreaPixels(pixels);
    }, []);

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const validation = validateImageFile(file);
      if (!validation.valid) {
        toast.error(validation.error?.includes('10MB') ? 'File too large' : 'Unsupported file type', {
          description: validation.error,
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      try {
        setIsProcessing(true);
        const processedFile = await processImageFile(file);
        const reader = new FileReader();
        reader.onload = () => {
          setCrop({ x: 0, y: 0 });
          setZoom(1);
          setCroppedAreaPixels(null);
          setPendingImage(reader.result as string);
        };
        reader.readAsDataURL(processedFile);
      } catch (error) {
        console.error('Error processing portrait image:', error);
        toast.error('File processing failed', {
          description: 'Failed to process the image. Please try a different file.',
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
      } finally {
        setIsProcessing(false);
      }
    };

    const refreshPortraits = async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-gang-portraits'] });
      await queryClient.invalidateQueries({ queryKey: ['gang-portraits'] });
    };

    const handleSave = useCallback(async () => {
      if (!metadataValid || isBusy) return;
      if (isCreateMode && !imageReady) return;
      if (!isCreateMode && !selectedId) return;
      if (pendingImage && !croppedAreaPixels) return;

      setPendingAction('save');
      setIsBusy(true);
      let uploadedPath: string | null = null;
      const previousPath = selectedPortrait?.storage_path ?? null;

      try {
        let storagePath = previousPath ?? '';
        if (pendingImage && croppedAreaPixels) {
          const cropped = await getCroppedImg(pendingImage, croppedAreaPixels, PORTRAIT_PX, PORTRAIT_PX);
          const reserved = new Set(portraits.map((portrait) => portrait.storage_path));
          if (previousPath) reserved.add(previousPath);
          uploadedPath = await uploadPortraitBlob(cropped, groupLabel, label, style, reserved);
          storagePath = uploadedPath;
        }

        if (!storagePath) {
          throw new Error('Choose an image before saving');
        }

        const payload = {
          storage_path: storagePath,
          group_label: groupLabel.trim(),
          style,
          label: label.trim(),
          credit_name: creditName.trim(),
          credit_url: creditUrl.trim(),
          credit_suffix: creditSuffix.trim(),
        };

        const response = await fetch('/api/admin/gang-portraits', {
          method: isCreateMode ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(isCreateMode ? payload : { id: selectedId, ...payload }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to ${isCreateMode ? 'create' : 'update'} portrait`);
        }

        const saved = await response.json() as GangPortrait;

        if (previousPath && uploadedPath && previousPath !== uploadedPath) {
          try {
            await removePortraitFile(previousPath);
          } catch (removeError) {
            console.error('Error removing the previous portrait file:', removeError);
            toast.error('Portrait saved, but the previous image file could not be removed');
          }
        }

        toast.success(`Portrait ${isCreateMode ? 'created' : 'updated'} successfully`);
        await refreshPortraits();
        setSelectedId(saved.id);
        setIsCreateMode(false);
        applyPortrait(saved);
      } catch (error) {
        console.error('Error saving gang portrait:', error);
        if (uploadedPath) {
          try {
            await removePortraitFile(uploadedPath);
          } catch (removeError) {
            console.error('Error removing the unused portrait file:', removeError);
          }
        }
        toast.error(error instanceof Error ? error.message : 'Failed to save portrait');
      } finally {
        setIsBusy(false);
        setPendingAction(null);
      }
    }, [
      creditName,
      creditSuffix,
      creditUrl,
      croppedAreaPixels,
      groupLabel,
      imageReady,
      isBusy,
      isCreateMode,
      label,
      metadataValid,
      pendingImage,
      portraits,
      selectedId,
      selectedPortrait?.storage_path,
      style,
    ]);

    const handleDelete = useCallback(async () => {
      if (!selectedId || !selectedPortrait || isBusy) return false;

      setPendingAction('delete');
      setIsBusy(true);
      try {
        const response = await fetch('/api/admin/gang-portraits', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selectedId }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to delete portrait');
        }

        const removed = await response.json() as { storage_path?: string };
        if (removed.storage_path) {
          try {
            await removePortraitFile(removed.storage_path);
          } catch (removeError) {
            console.error('Error removing the portrait file:', removeError);
            toast.error('Portrait deleted, but the image file could not be removed');
          }
        }

        toast.success('Portrait deleted successfully');
        await refreshPortraits();
        setSelectedId('');
        clearFields();
        setIsCreateMode(false);
        return true;
      } catch (error) {
        console.error('Error deleting gang portrait:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to delete portrait');
        return false;
      } finally {
        setIsBusy(false);
        setPendingAction(null);
      }
    }, [isBusy, selectedId, selectedPortrait]);

    useImperativeHandle(ref, () => ({
      save: () => { void handleSave(); },
      remove: () => {
        if (!selectedId || !selectedPortrait || isBusy) return;
        setDeleteConfirmOpen(true);
      },
    }), [handleDelete, handleSave, isBusy, selectedId, selectedPortrait]);

    const previewUrl = !isCreateMode && selectedPortrait
      ? gangPortraitPublicUrl(selectedPortrait.storage_path)
      : undefined;
    const showPortraitPreview = Boolean(previewUrl || isCreateMode || selectedId);
    const previewCredit = {
      name: creditName.trim(),
      url: creditUrl.trim(),
      suffix: creditSuffix.trim(),
    };

    return (
      <>
      <div className="space-y-4">
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="block text-sm font-medium text-muted-foreground">
              Select Portrait
            </label>
            <Button
              onClick={handleCreateNew}
              disabled={isBusy || isLoading || isProcessing}
              className="text-xs h-7 px-3"
            >
              Create New
            </Button>
          </div>
          <Combobox
            value={selectedId}
            onValueChange={handleSelect}
            options={options}
            placeholder="Select a portrait to edit"
            disabled={isBusy || isLoading || isProcessing}
            clearable
            showLabelWhenClosed
          />
          {isCreateMode && (
            <p className="text-xs text-amber-600 mt-1">
              Creating a new portrait. Select from the dropdown to cancel and edit an existing one.
            </p>
          )}
        </div>

        <div className="flex flex-col items-center gap-3">
          {showPortraitPreview && (
            <div className="flex flex-col items-center">
              <div className="relative flex size-[200px] md:size-[250px] items-center justify-center">
                {previewUrl ? (
                  <Image
                    src={previewUrl}
                    alt={groupLabel || 'Portrait'}
                    width={180}
                    height={180}
                    className="absolute z-10 mt-1 size-[145px] rounded-full object-cover md:size-[180px]"
                    quality={100}
                  />
                ) : (
                  <div
                    className="absolute z-10 size-[145px] rounded-full bg-muted md:size-[180px]"
                    aria-hidden="true"
                  />
                )}
                <div className="pointer-events-none absolute z-20 size-[200px] md:size-[250px]">
                  <Image
                    src={COGWHEEL_URL}
                    alt=""
                    width={250}
                    height={250}
                    className="absolute z-20"
                    quality={100}
                  />
                </div>
              </div>
              <DefaultImageCreditLine credit={previewCredit} />
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/svg+xml,.heic,.heif,.avif,.svg"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={fieldsDisabled}
            className="w-full"
          >
            {isProcessing ? 'Processing image...' : previewUrl || pendingImage ? 'Replace image' : 'Choose image'}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Supported: JPG, PNG, WEBP, GIF, AVIF, SVG, HEIC • Max 10MB
          </p>
        </div>

        {pendingImage && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Crop Image</h3>
              <button
                type="button"
                onClick={clearPendingImage}
                className="text-xs text-muted-foreground underline"
                disabled={isBusy}
              >
                Cancel image
              </button>
            </div>
            <div className="relative w-full h-64 bg-muted rounded-lg overflow-hidden">
              <Cropper
                image={pendingImage}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                showGrid={true}
                objectFit="contain"
                style={{
                  containerStyle: {
                    width: '100%',
                    height: '100%',
                    backgroundColor: '#f3f4f6',
                  },
                }}
              />
            </div>
            <div className="flex items-center mt-2">
              <label className="text-sm font-medium text-muted-foreground">Zoom:</label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full ml-2 mt-1"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            Group label *
          </label>
          <Input
            type="text"
            value={groupLabel}
            onChange={(e) => setGroupLabel(e.target.value)}
            placeholder="E.g. House Escher"
            className="w-full"
            disabled={fieldsDisabled}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            Style *
          </label>
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            className="w-full p-2 border rounded-md"
            disabled={fieldsDisabled}
          >
            {GANG_PORTRAIT_STYLES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            Label
          </label>
          <Input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Optional, e.g. Pride 1"
            className="w-full"
            disabled={fieldsDisabled}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            Credit name *
          </label>
          <Input
            type="text"
            value={creditName}
            onChange={(e) => setCreditName(e.target.value)}
            placeholder="Artist Name"
            className="w-full"
            disabled={fieldsDisabled}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            Credit URL
          </label>
          <Input
            type="url"
            value={creditUrl}
            onChange={(e) => setCreditUrl(e.target.value)}
            placeholder="https://"
            className="w-full"
            disabled={fieldsDisabled}
          />
          {creditUrlTrimmed !== '' && !creditUrlValid && (
            <p className="text-xs text-red-600 mt-1">Enter an http or https URL.</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            Credit suffix
          </label>
          <Input
            type="text"
            value={creditSuffix}
            onChange={(e) => setCreditSuffix(e.target.value)}
            placeholder="Optional, e.g. (AI-assisted)"
            className="w-full"
            disabled={fieldsDisabled}
          />
        </div>
      </div>
      {deleteConfirmOpen && (
        <Modal
          title="Delete Portrait"
          width="sm"
          content={
            <p>
              Delete this portrait? Gangs using it will fall back to the silhouette.
              {selectedPortrait && isAdminUploadedPath(selectedPortrait.storage_path)
                ? ' The uploaded image file will also be removed.'
                : ''}
            </p>
          }
          onClose={() => setDeleteConfirmOpen(false)}
          onConfirm={handleDelete}
          confirmText="Delete"
        />
      )}
      </>
    );
  }
);
