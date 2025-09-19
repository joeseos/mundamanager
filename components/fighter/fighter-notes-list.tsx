'use client';

import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { useToast } from '../ui/use-toast';
import { RichTextEditor } from '../ui/rich-text-editor';
import { UserPermissions } from '@/types/user-permissions';
import { updateFighterDetails } from '@/app/actions/edit-fighter';
import { useMutation } from '@tanstack/react-query';

interface FighterNotesProps {
  fighterId: string;
  initialNote?: string;
  initialNoteBackstory?: string;
  onNoteUpdate?: (updatedNote: string) => void;
  onNoteBackstoryUpdate?: (updatedNoteBackstory: string) => void;
  userPermissions: UserPermissions;
}

interface NoteEditorProps {
  title: string;
  content: string;
  onContentChange: (content: string) => void;
  onSave: (content: string) => Promise<void>;
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
  const [originalContent, setOriginalContent] = useState<string>('');
  const { toast } = useToast();

  const noteMutation = useMutation({
    mutationFn: onSave,
    onError: (error) => {
      console.error(`Error updating ${title.toLowerCase()}:`, error);
    },
  });

  // Store original content when starting to edit
  useEffect(() => {
    if (isEditing) {
      setOriginalContent(content);
    }
  }, [isEditing, content]);

  // Calculate character count from HTML content (rough estimate)
  const getCharCount = (htmlContent: string) => {
    const textContent = htmlContent.replace(/<[^>]*>/g, '');
    return textContent.length;
  };

  // Check if content is effectively empty (no meaningful text)
  const isEmptyContent = (htmlContent: string) => {
    if (!htmlContent) return true;
    // Remove HTML tags and count characters
    const textContent = htmlContent.replace(/<[^>]*>/g, '').trim();
    return textContent.length === 0;
  };

  const handleSave = async () => {
    setError(null);

    const charCount = getCharCount(content);
    if (charCount > charLimit) {
      setError(`${title} cannot exceed ${charLimit} characters`);
      return;
    }

    // Exit edit mode immediately for optimistic update
    setIsEditing(false);

    // Fire mutation in background
    noteMutation.mutateAsync(content).then(() => {
      toast({
        description: `${title} updated successfully`,
        variant: "default"
      });
    }).catch((error) => {
      // Rollback: re-enter edit mode with original content
      setIsEditing(true);
      onContentChange(originalContent);
      
      const errorMessage = error instanceof Error ? error.message : `Failed to update ${title.toLowerCase()}`;
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    });
  };

  return (
    <div>
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="flex items-center gap-2">
            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <Button
                    onClick={() => {
                      setIsEditing(false);
                      setError(null);
                      onContentChange(originalContent);
                    }}
                    variant="outline"
                    disabled={noteMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={getCharCount(content) > charLimit || noteMutation.isPending}
                  >
                    {noteMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </>
              ) : (
                <Button 
                  onClick={() => setIsEditing(true)}
                  disabled={!userPermissions?.canEdit}
                >
                  Edit
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
            />
          </div>
        ) : (
          <div 
            className={`max-w-none ${!isEmptyContent(content) ? 'prose prose-sm' : 'text-muted-foreground italic text-center'}`}
            dangerouslySetInnerHTML={{ __html: !isEmptyContent(content) ? content : `No ${title.toLowerCase()} added. ${title === 'Fighter Notes' ? 'They\'ll appear on the fighter card when printed.' : ''}` }}
          />
        )}
      </div>
    </div>
  );
}

export function FighterNotes({ 
  fighterId, 
  initialNote = '', 
  initialNoteBackstory = '',
  onNoteUpdate, 
  onNoteBackstoryUpdate, 
  userPermissions 
}: FighterNotesProps) {
  const [note, setNote] = useState(initialNote || '');
  const [noteBackstory, setNoteBackstory] = useState(initialNoteBackstory || '');

  // Update notes when initial values change
  useEffect(() => {
    setNote(initialNote || '');
  }, [initialNote]);

  useEffect(() => {
    setNoteBackstory(initialNoteBackstory || '');
  }, [initialNoteBackstory]);

  const handleNoteSave = async (content: string) => {
    const cleanNote = content.trim() === '' ? '' : content;
    
    const result = await updateFighterDetails({
      fighter_id: fighterId,
      note: cleanNote
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to update notes');
    }

    onNoteUpdate?.(content);
  };

  const handleNoteBackstorySave = async (content: string) => {
    const cleanNoteBackstory = content.trim() === '' ? '' : content;
    
    const result = await updateFighterDetails({
      fighter_id: fighterId,
      note_backstory: cleanNoteBackstory
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to update backstory notes');
    }

    onNoteBackstoryUpdate?.(content);
  };

  return (
    <div className="container max-w-5xl w-full space-y-4 mx-auto">
      <NoteEditor
        title="Fighter Notes"
        content={note}
        onContentChange={setNote}
        onSave={handleNoteSave}
        placeholder="Add notes here, they'll appear on the fighter card when printed."
        charLimit={1000}
        userPermissions={userPermissions}
      />
      
      <NoteEditor
        title="Fighter Backstory"
        content={noteBackstory}
        onContentChange={setNoteBackstory}
        onSave={handleNoteBackstorySave}
        placeholder="Add backstory here..."
        charLimit={2000}
        userPermissions={userPermissions}
      />
    </div>
  );
}
