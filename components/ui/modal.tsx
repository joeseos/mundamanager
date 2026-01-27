'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';

interface ModalProps {
  title: React.ReactNode;
  helper?: React.ReactNode;
  content?: React.ReactNode;
  children?: React.ReactNode;
  onClose: () => void;
  onConfirm?: (() => Promise<boolean>) | (() => void);
  confirmText?: string;
  confirmDisabled?: boolean;
  headerContent?: React.ReactNode;
  hideCancel?: boolean;
  width?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl';
}

export default function Modal({ 
  title,
  helper,
  content,
  children,
  onClose, 
  onConfirm,
  confirmText = 'Confirm',
  confirmDisabled = false,
  headerContent,
  hideCancel,
  width = 'md'
}: ModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async (e?: React.MouseEvent) => {
    if (!onConfirm) return;
    
    // Prevent any form submission
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    setIsSubmitting(true);
    try {
      const result = await onConfirm();
      if (result !== false) {
        onClose();
      }
    } catch (error) {
      console.error('Error in modal confirmation:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getMaxWidth = () => {
    switch (width) {
      case 'sm': return 'max-w-sm';
      case 'md': return 'max-w-md';
      case 'lg': return 'max-w-lg';
      case 'xl': return 'max-w-xl';
      case '2xl': return 'max-w-2xl';
      case '4xl': return 'max-w-4xl';
      default: return 'max-w-md';
    }
  };

  return (
    <div 
      className="fixed inset-0 flex justify-center items-center z-[100] px-[10px] bg-black/50 dark:bg-neutral-700/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`bg-card rounded-lg shadow-xl w-full ${getMaxWidth()} min-h-0 max-h-svh overflow-y-auto flex flex-col`}>
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-foreground">{title}</h3>
            {helper && (
              <p className="text-sm text-muted-foreground">{helper}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {headerContent}
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-muted-foreground text-xl"
            >
              ×
            </button>
          </div>
        </div>
        
        <div className="px-[10px] py-4 overflow-y-auto flex-1">
          {content || children}
        </div>

        {onConfirm && (
          <div className="border-t px-[10px] py-2 flex justify-end gap-2 bg-card rounded-b-lg">
            {!hideCancel && (
              <Button
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
                className={`px-4 py-2 border rounded hover:bg-muted ${
                  isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                Cancel
              </Button>
              )}
            <Button
              onClick={(e) => handleConfirm(e)}
              disabled={confirmDisabled || isSubmitting}
              className={`px-4 py-2 bg-neutral-900 text-white rounded hover:bg-gray-800 ${
                (confirmDisabled || isSubmitting) ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isSubmitting && confirmText === 'Confirm' ? 'Confirming...' : confirmText}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
