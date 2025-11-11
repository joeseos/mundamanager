'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateUsernameAction } from "@/app/actions/user";

interface UsernameChangeProps {
  currentUsername: string;
  userId: string;
}

export default function UsernameChange({ currentUsername, userId }: UsernameChangeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const validateUsername = (username: string): string | null => {
    const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;
    if (!usernameRegex.test(username)) {
      return 'Username must be 3-20 characters and can only contain letters, numbers, underscores, and hyphens';
    }
    if (username.toLowerCase() === currentUsername.toLowerCase()) {
      return 'New username must be different from your current username';
    }
    return null;
  };

  const handleSave = async () => {
    if (!newUsername) return;

    setError(null);
    setSuccess(null);

    // Validate username
    const usernameValidationError = validateUsername(newUsername);
    if (usernameValidationError) {
      setError(usernameValidationError);
      return;
    }

    setIsLoading(true);
    try {
      const result = await updateUsernameAction(userId, newUsername);

      if (result.error) {
        setError(result.error);
      } else if (result.success) {
        setSuccess(result.success);
        setIsEditing(false);
        setNewUsername('');
        // Refresh the page to show updated username
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
    } catch (error) {
      console.error('Error updating username:', error);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setNewUsername('');
    setError(null);
    setSuccess(null);
  };

  return (
    <>
      {isEditing ? (
        <div className="space-y-2">
          <Input
            type="text"
            value={newUsername}
            onChange={(e) => {
              setNewUsername(e.target.value);
              setError(null);
            }}
            placeholder="New username"
            className="w-full"
            minLength={3}
            maxLength={20}
            autoFocus
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              onClick={handleCancel}
              variant="outline"
              size="sm"
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="bg-neutral-900 hover:bg-gray-800 text-white"
              size="sm"
              disabled={isLoading || !newUsername}
            >
              {isLoading ? 'Updating...' : 'Update Username'}
            </Button>
          </div>
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
          <div className="text-foreground bg-muted rounded-md px-3 py-2 flex-1 min-w-0 truncate">
            {currentUsername || 'Not set'}
          </div>
          <Button
            onClick={() => setIsEditing(true)}
            className="bg-neutral-900 hover:bg-gray-800 text-white shrink-0 w-full sm:w-auto"
            size="sm"
          >
            Change Username
          </Button>
        </div>
      )}

      {success && !isEditing && (
        <p className="text-sm text-green-500 mt-2">{success}</p>
      )}
    </>
  );
}
