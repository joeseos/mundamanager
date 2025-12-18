'use client';

import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { useToast } from '../ui/use-toast';
import { RichTextEditor } from '../ui/rich-text-editor';
import { UserPermissions } from '@/types/user-permissions';
import { isHtmlEffectivelyEmpty } from '@/utils/htmlCleanUp';

interface GangNotesProps {
  gangId: string;
  initialNote?: string;
  initialNoteBackstory?: string;
  onNoteUpdate?: (updatedNote: string) => void;
  onNoteBackstoryUpdate?: (updatedNoteBackstory: string) => void;
  userPermissions?: UserPermissions;
}

interface NoteEditorProps {
  title: string;
  content: string;
  onContentChange: (content: string) => void;
  onSave: () => Promise<void>;
  placeholder: string;
  charLimit: number;
  userPermissions?: UserPermissions;
}

function NoteEditor({ 
  title, 
  content, 
  onContentChange, 
  onSave, 
  placeholder, 
  charLimit, 
  userPermissions 
}: NoteEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [savedContent, setSavedContent] = useState<string>('');
  const { toast } = useToast();

  // Update content when not editing
  useEffect(() => {
    if (!isEditing) {
      onContentChange(content);
    }
  }, [content, isEditing, onContentChange]);

  // Track when the note has been refreshed from server
  useEffect(() => {
    if (isRefreshing && content === savedContent) {
      // The server has returned our saved content, so refresh is complete
      setIsRefreshing(false);
    }
  }, [content, isRefreshing, savedContent]);

  // Calculate character count from HTML content (rough estimate)
  const getCharCount = (htmlContent: string) => {
    const textContent = htmlContent.replace(/<[^>]*>/g, '');
    return textContent.length;
  };

  const handleSave = async () => {
    try {
      setError(null);
      setIsSaving(true);

      const charCount = getCharCount(content);
      if (charCount > charLimit) {
        setError(`${title} cannot exceed ${charLimit} characters`);
        return;
      }

      await onSave();

      toast({
        description: `${title} updated successfully`,
        variant: "default"
      });

      setSavedContent(content);
      setIsEditing(false);
      setIsRefreshing(true);
    } catch (error) {
      console.error(`Error updating ${title.toLowerCase()}:`, error);
      setError(error instanceof Error ? error.message : `Failed to update ${title.toLowerCase()}`);
      toast({
        title: "Error",
        description: `Failed to update ${title.toLowerCase()}`,
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-card rounded-lg shadow-md p-4 mb-6">
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <h2 className="text-xl md:text-2xl font-bold mb-6">{title}</h2>
          <div className="flex items-center gap-2">
            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <Button
                    onClick={() => {
                      setIsEditing(false);
                      setError(null);
                    }}
                    variant="outline"
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={getCharCount(content) > charLimit || isSaving}
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
          <div className="bg-white rounded-md">
            <RichTextEditor
              content={content}
              onChange={onContentChange}
              placeholder={placeholder}
              className="min-h-[200px]"
              charLimit={charLimit}
              enableImages={false}
            />
          </div>
        ) : (
          <div 
          className={`max-w-none ${!isHtmlEffectivelyEmpty(content) ? 'prose prose-sm break-words' : 'text-muted-foreground italic text-center'}`}
          dangerouslySetInnerHTML={{ __html: !isHtmlEffectivelyEmpty(content) ? content : `No ${title.toLowerCase()} added. ${title === 'Gang Notes' ? 'They\'ll appear on the Gang card when printed.' : ''}` }}
          />
        )}
      </div>
    </div>
  );
}

export function GangNotes({ 
  gangId, 
  initialNote = '', 
  initialNoteBackstory = '',
  onNoteUpdate, 
  onNoteBackstoryUpdate, 
  userPermissions 
}: GangNotesProps) {
  const [note, setNote] = useState(initialNote || '');
  const [noteBackstory, setNoteBackstory] = useState(initialNoteBackstory || '');

  // Update notes when initial values change
  useEffect(() => {
    setNote(initialNote || '');
  }, [initialNote]);

  useEffect(() => {
    setNoteBackstory(initialNoteBackstory || '');
  }, [initialNoteBackstory]);

  const handleNoteSave = async () => {
    const cleanNote = isHtmlEffectivelyEmpty(note) ? '' : note;
    
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

    onNoteUpdate?.(note);
  };

  const handleNoteBackstorySave = async () => {
    const cleanNoteBackstory = isHtmlEffectivelyEmpty(noteBackstory) ? '' : noteBackstory;
    
    const response = await fetch(`/api/gangs/${gangId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ note_backstory: cleanNoteBackstory }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to update backstory notes');
    }

    onNoteBackstoryUpdate?.(noteBackstory);
  };

  return (
    <div className="container max-w-5xl w-full space-y-4 mx-auto">
      <NoteEditor
        title="Gang Notes"
        content={note}
        onContentChange={setNote}
        onSave={handleNoteSave}
        placeholder="Add notes here, they'll appear on the Gang card when printed."
        charLimit={1500}
        userPermissions={userPermissions}
      />
      
      <NoteEditor
        title="Gang Backstory"
        content={noteBackstory}
        onContentChange={setNoteBackstory}
        onSave={handleNoteBackstorySave}
        placeholder="Add backstory here..."
        charLimit={2500}
        userPermissions={userPermissions}
      />
    </div>
  );
}