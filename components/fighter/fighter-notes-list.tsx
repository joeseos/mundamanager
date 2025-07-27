import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { useToast } from '../ui/use-toast';
import { Textarea } from '../ui/textarea';
import { UserPermissions } from '@/types/user-permissions';
import { updateFighterDetails } from '@/app/actions/edit-fighter';

interface NotesListProps {
  fighterId: string;
  initialNote?: string;
  userPermissions: UserPermissions;
}

export function NotesList({ fighterId, initialNote = '', userPermissions }: NotesListProps) {
  // Ensure note is always a string
  const [note, setNote] = useState(initialNote || '');
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [charCount, setCharCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  // Update character count when note changes
  useEffect(() => {
    const noteText = note || '';
    setCharCount(noteText.length); // Use .length for character count
  }, [note]);

  // When initialNote changes, update the note state
  useEffect(() => {
    setNote(initialNote || '');
  }, [initialNote]);

  const handleSave = async () => {
    try {
      setError(null);
      setIsSaving(true);

      // Client-side validation
      if (charCount > 1000) {
        setError('Notes cannot exceed 1000 characters');
        return;
      }

      const result = await updateFighterDetails({
        fighter_id: fighterId,
        note: note
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to update notes');
      }

      toast({
        description: "Notes updated successfully",
        variant: "default"
      });

      setIsEditing(false);
    } catch (error) {
      console.error('Error updating notes:', error);
      setError(error instanceof Error ? error.message : 'Failed to update notes');
      toast({
        title: "Error",
        description: "Failed to update notes",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Notes</h3>
        <div className="flex items-center gap-2">
          {isEditing && (
            <span className={`text-sm ${charCount > 1000 ? 'text-red-500' : 'text-gray-500'}`}>
              {charCount}/1000 characters
            </span>
          )}
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
                  disabled={charCount > 1000 || isSaving}
                >
                  {isSaving ? "Saving..." : "Save"}
                </Button>
              </>
            ) : (
              <Button onClick={() => setIsEditing(true)} disabled={!userPermissions.canEdit}>
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
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="min-h-[100px]"
          placeholder="Add notes here..."
        />
      ) : (
        <div className={`whitespace-pre-wrap break-words ${!note ? 'text-gray-500 italic' : ''}`}>
          {note || "No notes added. They'll appear on the fighter card."}
        </div>
      )}
    </div>
  );
}
