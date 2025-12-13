'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/utils/supabase/client";
import { AuthApiError } from '@supabase/supabase-js';
import Modal from "@/components/ui/modal";
import { LuEye, LuEyeOff } from "react-icons/lu";

export default function PasswordChange() {
  const [isEditing, setIsEditing] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordRequirements, setPasswordRequirements] = useState({
    hasLowerCase: false,
    hasUpperCase: false,
    hasNumber: false,
    hasSpecialChar: false,
    hasMinLength: false,
  });
  const supabase = createClient();

  const checkPasswordRequirements = (password: string) => {
    setPasswordRequirements({
      hasLowerCase: /[a-z]/.test(password),
      hasUpperCase: /[A-Z]/.test(password),
      hasNumber: /\d/.test(password),
      hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?~]/.test(password),
      hasMinLength: password.length >= 6,
    });
  };

  const handleSave = async () => {
    if (!newPassword) return;
    
    setError(null);

    const hasLowerCase = /[a-z]/.test(newPassword);
    const hasUpperCase = /[A-Z]/.test(newPassword);
    const hasNumber = /\d/.test(newPassword);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?~]/.test(newPassword);
    const hasMinLength = newPassword.length >= 6;

    if (!hasLowerCase || !hasUpperCase || !hasNumber || !hasSpecialChar || !hasMinLength) {
      setError('Password must contain at least 6 characters, including uppercase, lowercase, number, and special character');
      return;
    }

    setIsLoading(true);
    try {
      const { error: supabaseError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (supabaseError) {
        if (supabaseError instanceof AuthApiError) {
          if (supabaseError.status === 422) {
            setError('New password must be different from your current password');
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
      setPasswordRequirements({
        hasLowerCase: false,
        hasUpperCase: false,
        hasNumber: false,
        hasSpecialChar: false,
        hasMinLength: false,
      });
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
            <div className="relative flex-grow">
              <Input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setError(null);
                  checkPasswordRequirements(e.target.value);
                }}
                placeholder="Enter new password"
                className="pr-10"
                autoFocus
              />
              <button
                type="button"
                onMouseDown={() => setShowPassword(true)}
                onMouseUp={() => setShowPassword(false)}
                onMouseLeave={() => setShowPassword(false)}
                onTouchStart={() => setShowPassword(true)}
                onTouchEnd={() => setShowPassword(false)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors select-none touch-none"
                aria-label="Hold to reveal password"
              >
                {showPassword ? (
                  <LuEyeOff className="h-5 w-5" />
                ) : (
                  <LuEye className="h-5 w-5" />
                )}
              </button>
            </div>
            <Button 
              onClick={handleSave}
              className="bg-neutral-900 hover:bg-gray-800 text-white"
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
                setPasswordRequirements({
                  hasLowerCase: false,
                  hasUpperCase: false,
                  hasNumber: false,
                  hasSpecialChar: false,
                  hasMinLength: false,
                });
              }}
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
          <div className="mt-2 text-sm space-y-1">
            <p className={passwordRequirements.hasMinLength ? "text-green-500" : "text-gray-400"}>
              ✓ At least 6 characters
            </p>
            <p className={passwordRequirements.hasLowerCase ? "text-green-500" : "text-gray-400"}>
              ✓ One lowercase letter
            </p>
            <p className={passwordRequirements.hasUpperCase ? "text-green-500" : "text-gray-400"}>
              ✓ One uppercase letter
            </p>
            <p className={passwordRequirements.hasNumber ? "text-green-500" : "text-gray-400"}>
              ✓ One number
            </p>
            <p className={passwordRequirements.hasSpecialChar ? "text-green-500" : "text-gray-400"}>
              ✓ One special character (!@#$%^&*()_+-=[]{}|;:,&lt;&gt;?~)
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center space-x-2">
          <div className="text-foreground bg-muted rounded-md px-3 py-2 flex-grow">
            ••••••••
          </div>
          <Button 
            onClick={() => setIsEditing(true)}
            className="bg-neutral-900 hover:bg-gray-800 text-white"
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
              <p className="text-muted-foreground">
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