'use client';

import React, { useState } from 'react';

interface ModalProps {
  title: React.ReactNode;
  helper?: string;
  content?: React.ReactNode;
  children?: React.ReactNode;
  onClose: () => void;
  onConfirm?: (() => Promise<boolean>) | (() => void);
  confirmText?: string;
  confirmDisabled?: boolean;
  headerContent?: React.ReactNode;
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
  headerContent
}: ModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!onConfirm) return;
    
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

  return (
    <div 
      className="fixed inset-0 min-h-screen bg-gray-300 bg-opacity-50 flex justify-center items-center z-[100] px-[10px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md min-h-0 max-h-svh overflow-y-auto">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">{title}</h3>
            {helper && (
              <p className="text-sm text-gray-500">{helper}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {headerContent}
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-xl"
            >
              ×
            </button>
          </div>
        </div>
        
        <div className="px-[10px] py-4">
          {content || children}
        </div>

        {onConfirm && (
          <div className="border-t px-[10px] py-2 flex justify-end gap-2">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className={`px-4 py-2 border rounded hover:bg-gray-100 ${
                isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={confirmDisabled || isSubmitting}
              className={`px-4 py-2 bg-black text-white rounded hover:bg-gray-800 ${
                (confirmDisabled || isSubmitting) ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isSubmitting ? 'Confirming...' : confirmText}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
