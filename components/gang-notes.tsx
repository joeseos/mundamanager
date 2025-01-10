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
  const [wordCount, setWordCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const noteText = note || '';
    const count = noteText.split(/\s+/).length;
    setWordCount(count);
  }, [note]);

  useEffect(() => {
    setNote(initialNote || '');
  }, [initialNote]);

  const handleSave = async () => {
    try {
      setError(null);
      setIsSaving(true);
      
      if (wordCount > 250) {
        setError('Note cannot exceed 250 words');
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
        description: "Gang history updated successfully",
        variant: "default"
      });

      setIsEditing(false);
    } catch (error) {
      console.error('Error updating gang history:', error);
      setError(error instanceof Error ? error.message : 'Failed to update gang history');
      toast({
        title: "Error",
        description: "Failed to update gang history",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="container max-w-5xl w-full space-y-4">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold mb-6">Gang Notes</h2>
            <div className="flex items-center gap-2">
              {isEditing && (
                <span className={`text-sm ${wordCount > 250 ? 'text-red-500' : 'text-gray-500'}`}>
                  {wordCount}/250 words
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
                      disabled={wordCount > 250 || isSaving}
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
              placeholder="Write your gang's history here..."
            />
          ) : (
            <div className="whitespace-pre-wrap">
              {note || 'No history recorded yet.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 