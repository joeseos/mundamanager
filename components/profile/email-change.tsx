'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/utils/supabase/client";
import { AuthApiError } from '@supabase/supabase-js';
import Modal from "@/components/ui/modal";

interface EmailChangeProps {
  currentEmail: string;
}

export default function EmailChange({ currentEmail }: EmailChangeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const supabase = createClient();

  const validateEmail = (email: string): string | null => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return 'Please enter a valid email address';
    }
    if (email === currentEmail) {
      return 'New email must be different from your current email';
    }
    return null;
  };


  const handleSave = async () => {
    if (!newEmail) return;

    setError(null);

    // Validate email
    const emailValidationError = validateEmail(newEmail);
    if (emailValidationError) {
      setError(emailValidationError);
      return;
    }

    setIsLoading(true);
    try {
      // Update email directly - Supabase will handle security via email confirmation
      const { error: updateError } = await supabase.auth.updateUser({
        email: newEmail
      });

      if (updateError) {
        if (updateError instanceof AuthApiError) {
          if (updateError.status === 422) {
            setError('This email address is already in use');
          } else if (updateError.status === 429) {
            setError('Too many requests. Please wait a moment and try again.');
          } else {
            setError(updateError.message);
          }
        } else {
          setError('Failed to update email. Please try again.');
        }
        return;
      }

      setShowSuccessModal(true);
      setIsEditing(false);
      setNewEmail('');
    } catch (error) {
      console.error('Error updating email:', error);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setNewEmail('');
    setError(null);
  };

  const handleCloseModal = () => {
    setShowSuccessModal(false);
  };

  return (
    <>
      {isEditing ? (
        <div className="space-y-2">
          <Input
            type="email"
            value={newEmail}
            onChange={(e) => {
              setNewEmail(e.target.value);
              setError(null);
            }}
            placeholder="Enter new email address"
            className="w-full"
            autoFocus
          />
          <div className="flex items-center space-x-2">
            <Button
              onClick={handleSave}
              className="bg-neutral-900 hover:bg-gray-800 text-white"
              size="sm"
              disabled={isLoading || !newEmail}
            >
              {isLoading ? 'Updating...' : 'Update Email'}
            </Button>
            <Button
              onClick={handleCancel}
              variant="outline"
              size="sm"
              disabled={isLoading}
            >
              Cancel
            </Button>
          </div>
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          <div className="text-sm text-muted-foreground">
            <p>You will receive confirmation emails at both your current and new email addresses.</p>
            <p>Both confirmations are required to complete the email change.</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center space-x-2">
          <div className="text-foreground bg-muted rounded-md px-3 py-2 flex-grow">
            {currentEmail}
          </div>
          <Button
            onClick={() => setIsEditing(true)}
            className="bg-neutral-900 hover:bg-gray-800 text-white"
            size="sm"
          >
            Change Email
          </Button>
        </div>
      )}

      {showSuccessModal && (
        <Modal
          title="Email Change Initiated"
          content={
            <div className="space-y-3">
              <p className="text-muted-foreground">
                We've sent confirmation emails to both your current email address
                <strong> {currentEmail}</strong> and your new email address
                <strong> {newEmail}</strong>.
              </p>
              <p className="text-muted-foreground">
                You must click the confirmation links in both emails
                to complete the email change process.
              </p>
              <div className="bg-muted p-3 rounded-md">
                <p className="text-sm text-muted-foreground">
                  <strong>Important:</strong> Your email will not change until both confirmations are completed.
                  This security measure prevents unauthorized account changes.
                </p>
              </div>
            </div>
          }
          onClose={handleCloseModal}
          onConfirm={handleCloseModal}
          confirmText="Got it"
          hideCancel
        />
      )}
    </>
  );
}