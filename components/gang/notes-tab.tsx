'use client';

import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { useToast } from '../ui/use-toast';
import { RichTextEditor } from '../ui/rich-text-editor';
import { UserPermissions } from '@/types/user-permissions';

interface GangNotesProps {
  gangId: string;
  initialNote?: string;
  onNoteUpdate?: (updatedNote: string) => void;
  userPermissions?: UserPermissions;
}

export function GangNotes({ gangId, initialNote = '', onNoteUpdate, userPermissions }: GangNotesProps) {
  const NOTE_CHAR_LIMIT = 1500;
  const [note, setNote] = useState(initialNote || '');
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [savedContent, setSavedContent] = useState<string>('');
  const { toast } = useToast();

  // Calculate character count from HTML content (rough estimate)
  const getCharCount = (htmlContent: string) => {
    // Remove HTML tags and count characters
    const textContent = htmlContent.replace(/<[^>]*>/g, '');
    return textContent.length;
  };

  // Check if content is effectively empty (no meaningful text)
  const isEmptyContent = (htmlContent: string) => {
    if (!htmlContent) return true;
    // Remove HTML tags and check if there's any meaningful text
    const textContent = htmlContent.replace(/<[^>]*>/g, '').trim();
    return textContent.length === 0;
  };

  useEffect(() => {
    if (!isEditing) {
      setNote(initialNote || '');
    }
  }, [initialNote, isEditing]);

  // Track when the note has been refreshed from server
  useEffect(() => {
    if (isRefreshing && initialNote === savedContent) {
      // The server has returned our saved content, so refresh is complete
      setIsRefreshing(false);
    }
  }, [initialNote, isRefreshing, savedContent]);

  const handleSave = async () => {
    try {
      setError(null);
      setIsSaving(true);

      const charCount = getCharCount(note);
      if (charCount > NOTE_CHAR_LIMIT) {
        setError(`Notes cannot exceed ${NOTE_CHAR_LIMIT} characters`);
        return;
      }

      // Clean up empty content before saving
      const cleanNote = isEmptyContent(note) ? '' : note;

      const response = await fetch(`/api/gangs/${gangId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ note: cleanNote }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update notes');
      }

      toast({
        description: "Gang Notes updated successfully",
        variant: "default"
      });

      setSavedContent(note);
      setIsEditing(false);
      setIsRefreshing(true);
      onNoteUpdate?.(note);
    } catch (error) {
      console.error('Error updating gang notes:', error);
      setError(error instanceof Error ? error.message : 'Failed to update gang notes');
      toast({
        title: "Error",
        description: "Failed to update gang notes",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="container max-w-5xl w-full space-y-4 mx-auto">
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <h2 className="text-xl md:text-2xl font-bold mb-6">Gang Notes</h2>
            <div className="flex items-center gap-2">
              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <Button
                      onClick={() => {
                        setIsEditing(false);
                        setNote(initialNote);
                        setError(null);
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
                    disabled={!userPermissions?.canEdit || isRefreshing}
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
            <RichTextEditor
              content={note}
              onChange={setNote}
              placeholder="Add notes here..."
              className="min-h-[200px]"
              charLimit={NOTE_CHAR_LIMIT}
            />
          ) : (
            <div 
              className={`prose max-w-none ${!isEmptyContent(note) ? 'prose-sm' : 'text-gray-500 italic text-center'}`}
              dangerouslySetInnerHTML={{ __html: !isEmptyContent(note) ? note : 'No notes added. They\'ll appear on the Gang card when printed.' }}
            />
          )}
        </div>
      </div>
    </div>
  );
} 