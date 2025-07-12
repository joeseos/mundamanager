'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/utils/supabase/client';
import { AuthApiError } from '@supabase/supabase-js';
import Modal from '@/components/modal';

export default function PasswordChange() {
  const [isEditing, setIsEditing] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const supabase = createClient();

  const validatePassword = (password: string): string | null => {
    if (password.length < 6) {
      return 'Password must be at least 6 characters long';
    }
    if (!/[A-Z]/.test(password)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[a-z]/.test(password)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[0-9]/.test(password)) {
      return 'Password must contain at least one number';
    }
    if (!/[!@#$%^&*]/.test(password)) {
      return 'Password must contain at least one special character (!@#$%^&*)';
    }
    return null;
  };

  const handleSave = async () => {
    if (!newPassword) return;

    setError(null);

    const validationError = validatePassword(newPassword);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    try {
      const { error: supabaseError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (supabaseError) {
        if (supabaseError instanceof AuthApiError) {
          if (supabaseError.status === 422) {
            setError(
              'New password must be different from your current password'
            );
          } else {
            setError(supabaseError.message);
          }
        } else {
          setError('Failed to update password. Please try again.');
        }
        return;
      }

      setShowSuccessModal(true);
      setIsEditing(false);
      setNewPassword('');
    } catch (error) {
      console.error('Error updating password:', error);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseModal = () => {
    setShowSuccessModal(false);
  };

  return (
    <>
      {isEditing ? (
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setError(null);
              }}
              placeholder="Enter new password"
              className="flex-grow"
              autoFocus
            />
            <Button
              onClick={handleSave}
              className="bg-black hover:bg-gray-800 text-white"
              size="sm"
              disabled={isLoading || !newPassword}
            >
              {isLoading ? 'Saving...' : 'Save'}
            </Button>
            <Button
              onClick={() => {
                setIsEditing(false);
                setNewPassword('');
                setError(null);
              }}
              variant="outline"
              size="sm"
              disabled={isLoading}
            >
              Cancel
            </Button>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="text-sm text-gray-500">
            Password must:
            <ul className="list-disc ml-5 mt-1">
              <li>Be at least 6 characters long</li>
              <li>Contain at least one uppercase letter</li>
              <li>Contain at least one lowercase letter</li>
              <li>Contain at least one number</li>
              <li>Contain at least one special character (!@#$%^&*)</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="flex items-center space-x-2">
          <div className="text-gray-900 bg-gray-100 rounded-md px-3 py-2 flex-grow">
            ••••••••
          </div>
          <Button
            onClick={() => setIsEditing(true)}
            className="bg-black hover:bg-gray-800 text-white"
            size="sm"
          >
            Change Password
          </Button>
        </div>
      )}

      {showSuccessModal && (
        <Modal
          title="Password Updated"
          content={
            <div className="text-center">
              <p className="text-gray-600">
                Your password has been successfully updated.
              </p>
            </div>
          }
          onClose={handleCloseModal}
          onConfirm={handleCloseModal}
        />
      )}
    </>
  );
}
