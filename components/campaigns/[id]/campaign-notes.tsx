"use client";

import { useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Button } from "@/components/ui/button";
import { toast } from 'sonner';
import type { RichTextEditorHandle } from "@/components/ui/rich-text-editor";
import "@/components/ui/rich-text-editor.css"; // .prose styles for the read-only notes
import { updateCampaignSettings } from "@/app/actions/campaigns/[id]/campaign-settings";
import { isHtmlEffectivelyEmpty } from "@/utils/htmlCleanUp";

// The editor (Tiptap and ProseMirror, about 130 KB gzipped) only shows after
// Edit is clicked, so its code loads then instead of with the page.
// An empty box holds the editor's space while the code loads.
// next/dynamic passes editorRef through to it.
const RichTextEditor = dynamic(
  () => import("@/components/ui/rich-text-editor").then((mod) => mod.RichTextEditor),
  {
    ssr: false,
    loading: () => <div className="border rounded-md min-h-[200px]" />,
  }
);

interface CampaignNotesProps {
  campaignId: string;
  initialNote?: string;
  onNoteUpdate?: (updatedNote: string) => void;
}

export function CampaignNotes({ campaignId, initialNote = '', onNoteUpdate }: CampaignNotesProps) {
  const NOTE_CHAR_LIMIT = 3500;
  const [note, setNote] = useState(initialNote || '');
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [savedContent, setSavedContent] = useState<string>('');
  
  const editorRef = useRef<RichTextEditorHandle>(null);

  // Calculate character count from HTML content (rough estimate)
  const getCharCount = (htmlContent: string) => {
    // Remove HTML tags and count characters
    const textContent = htmlContent.replace(/<[^>]*>/g, '');
    return textContent.length;
  };

  const [prevInitialNote, setPrevInitialNote] = useState(initialNote);
  if (initialNote !== prevInitialNote) {
    setPrevInitialNote(initialNote);
    if (!isEditing) {
      setNote(initialNote || '');
    }
    if (isRefreshing && initialNote === savedContent) {
      setIsRefreshing(false);
    }
  }

  const handleSave = async () => {
    try {
      setError(null);
      setIsSaving(true);
      const charCount = getCharCount(note);
      if (charCount > NOTE_CHAR_LIMIT) {
        setError(`Campaign notes cannot exceed ${NOTE_CHAR_LIMIT} characters`);
        return;
      }
      // Finalize staged assets and pending deletions
      const finalizedNote = (await editorRef.current?.finalizeAssets(note)) ?? note;
      // Clean up empty content before saving (but keep image-only notes)
      const cleanNote = isHtmlEffectivelyEmpty(finalizedNote) ? '' : finalizedNote;
      const result = await updateCampaignSettings({
        campaignId,
        note: cleanNote,
      });
      if (!result.success) {
        throw new Error(result.error);
      }
      toast.success("Campaign Pack updated successfully");
      // Track the actual value sent to the server so refresh state matches
      setSavedContent(cleanNote);
      setIsEditing(false);
      setIsRefreshing(true);
      onNoteUpdate?.(cleanNote);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to update campaign notes');
      toast.error("Error", { description: "Failed to update campaign notes" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-start">
        <h2 className="text-xl md:text-2xl font-bold mb-6">Campaign Pack</h2>
        <div className="flex items-center gap-2">
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button
                  onClick={() => {
                    setIsEditing(false);
                    setNote(initialNote);
                    setError(null);
              // Discard staged assets
              void editorRef.current?.discardAssets();
                  }}
                  variant="outline"
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={getCharCount(note) > NOTE_CHAR_LIMIT || isSaving}
                >
                  {isSaving ? "Saving..." : "Save"}
                </Button>
              </>
            ) : (
              <Button 
                onClick={() => setIsEditing(true)}
                disabled={isRefreshing}
              >
                {isRefreshing ? "Updating..." : "Edit"}
              </Button>
            )}
          </div>
        </div>
      </div>
      {error && (
        <p className="text-red-500 text-sm">{error}</p>
      )}
      {isEditing ? (
        <div className="bg-white rounded-md">
          <RichTextEditor
            ref={editorRef}
            content={note}
            onChange={setNote}
            placeholder="Add notes here..."
            className="min-h-[200px]"
            charLimit={NOTE_CHAR_LIMIT}
            campaignId={campaignId}
            enableImages={true}
          />
        </div>
      ) : (
        <div 
          className={`max-w-none ${!isHtmlEffectivelyEmpty(note) ? 'prose prose-sm' : 'text-gray-500 italic text-center'}`}
          dangerouslySetInnerHTML={{ __html: !isHtmlEffectivelyEmpty(note) ? note : 'No notes added.' }}
        />
      )}
    </div>
  );
} 