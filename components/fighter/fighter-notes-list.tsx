'use client';

import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { useToast } from '../ui/use-toast';
import { RichTextEditor } from '../ui/rich-text-editor';
import { UserPermissions } from '@/types/user-permissions';

interface FighterNotesProps {
  fighterId: string;
  initialNote?: string;
  initialNoteBackstory?: string;
  onNoteUpdate: (params: { fighter_id: string; note: string }) => void;
  onNoteBackstoryUpdate: (params: { fighter_id: string; note_backstory: string }) => void;
  userPermissions: UserPermissions;
}

interface NoteEditorProps {
  title: string;
  content: string;
  onContentChange: (content: string) => void;
  onSave: () => void;
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
  const { toast } = useToast();


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

  const handleSave = () => {
    setError(null);

    const charCount = getCharCount(content);
    if (charCount > charLimit) {
      setError(`${title} cannot exceed ${charLimit} characters`);
      return;
    }

    // Show success toast immediately
    toast({
      description: `${title} updated successfully`,
      variant: "default"
    });

    // Close editor immediately
    setIsEditing(false);

    // Call the mutation (optimistic update will handle the rest)
    onSave();
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
                    }}
                    variant="outline"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={getCharCount(content) > charLimit}
                  >
                    Save
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
          <RichTextEditor
            content={content}
            onChange={onContentChange}
            placeholder={placeholder}
            className="min-h-[200px]"
            charLimit={charLimit}
          />
        ) : (
          <div 
            className={`max-w-none ${!isEmptyContent(content) ? 'prose prose-sm' : 'text-gray-500 italic text-center'}`}
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

  const handleNoteSave = () => {
    const cleanNote = note.trim() === '' ? '' : note;
    onNoteUpdate({
      fighter_id: fighterId,
      note: cleanNote
    });
  };

  const handleNoteBackstorySave = () => {
    const cleanNoteBackstory = noteBackstory.trim() === '' ? '' : noteBackstory;
    onNoteBackstoryUpdate({
      fighter_id: fighterId,
      note_backstory: cleanNoteBackstory
    });
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
