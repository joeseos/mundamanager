"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { updateCampaignSettings } from "@/app/actions/campaigns/[id]/campaign-settings";

interface CampaignNotesProps {
  campaignId: string;
  initialNote?: string;
  onNoteUpdate?: (updatedNote: string) => void;
}

export function CampaignNotes({ campaignId, initialNote = '', onNoteUpdate }: CampaignNotesProps) {
  const NOTE_CHAR_LIMIT = 2500;
  const [note, setNote] = useState(initialNote || '');
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [charCount, setCharCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setCharCount((note || '').length);
  }, [note]);

  useEffect(() => {
    if (!isEditing) {
      setNote(initialNote || '');
    }
  }, [initialNote, isEditing]);

  const handleSave = async () => {
    try {
      setError(null);
      setIsSaving(true);
      if (charCount > NOTE_CHAR_LIMIT) {
        setError(`Notes cannot exceed ${NOTE_CHAR_LIMIT} characters`);
        return;
      }
      const result = await updateCampaignSettings({
        campaignId,
        note,
      });
      if (!result.success) {
        throw new Error(result.error);
      }
      toast({
        description: "Campaign Notes updated successfully",
        variant: "default"
      });
      setIsEditing(false);
      onNoteUpdate?.(note);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to update campaign notes');
      toast({
        title: "Error",
        description: "Failed to update campaign notes",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <h2 className="text-xl md:text-2xl font-bold mb-6">Notes</h2>
        <div className="flex items-center gap-2">
          {isEditing && (
            <span className={`text-sm ${charCount > NOTE_CHAR_LIMIT ? 'text-red-500' : 'text-gray-500'}`}>
              {charCount}/{NOTE_CHAR_LIMIT} characters
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
                  disabled={charCount > NOTE_CHAR_LIMIT || isSaving}
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
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)}
          className="min-h-[200px]"
          placeholder="Add notes here..."
        />
      ) : (
        <div className={`whitespace-pre-wrap break-words ${note ? '' : 'text-gray-500 italic text-center'}`}>
          {note || 'No notes added.'}
        </div>
      )}
    </div>
  );
} 