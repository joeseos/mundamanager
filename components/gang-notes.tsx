'use client';

import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { useToast } from './ui/use-toast';
import { Textarea } from './ui/textarea';

interface GangNotesProps {
  gangId: string;
  initialNote?: string;
}

export function GangNotes({ gangId, initialNote = '' }: GangNotesProps) {
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
      if (charCount > 1500) {
        setError('Notes cannot exceed 1500 characters');
        return;
      }

      const response = await fetch(`/api/gangs/${gangId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ note }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update notes');
      }

      toast({
        description: "Gang Notes updated successfully",
        variant: "default"
      });

      setIsEditing(false);
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
            <h2 className="text-2xl font-bold mb-6">Gang Notes</h2>
            <div className="flex items-center gap-2">
              {isEditing && (
                <span className={`text-sm ${charCount > 1500 ? 'text-red-500' : 'text-gray-500'}`}>
                  {charCount}/1500 characters
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
                      disabled={charCount > 1500 || isSaving}
                    >
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => setIsEditing(true)}>
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
              className="min-h-[200px]"
              placeholder="Add notes here..."
            />
          ) : (
            <div className={`whitespace-pre-wrap break-words ${note ? '' : 'text-gray-500 italic text-center'}`}>
              {note || 'No notes added.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 