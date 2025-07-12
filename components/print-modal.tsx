'use client';

import { useState } from 'react';
import Modal from '@/components/modal';

interface PrintModalProps {
  gangId: string;
  onClose: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function PrintModal({ gangId, onClose }: PrintModalProps) {
  const [printOptions, setPrintOptions] = useState({
    includeGangCard: true,
    includeAdditionalDetails: true,
    includeInactiveFighters: true,
    includeRecoveryFighters: true,
  });

  const handleConfirm = () => {
    const gangCard = document.getElementById('gang_card');
    const details = document.getElementById('gang_card_additional_details');
    const inactiveFighters = document.querySelectorAll('[id^="is_inactive"]');
    const recoveryFighters = document.querySelectorAll('[id^="is_recovery"]');

    if (gangCard)
      gangCard.style.display = printOptions.includeGangCard ? '' : 'none';
    if (details)
      details.style.display = printOptions.includeAdditionalDetails
        ? ''
        : 'none';

    inactiveFighters.forEach((el) => {
      (el as HTMLElement).style.display = printOptions.includeInactiveFighters
        ? ''
        : 'none';
    });
    recoveryFighters.forEach((el) => {
      (el as HTMLElement).style.display = printOptions.includeRecoveryFighters
        ? ''
        : 'none';
    });

    document.querySelectorAll('a').forEach((link) => {
      link.setAttribute('data-href', link.getAttribute('href') || '');
      link.removeAttribute('href');
    });

    setTimeout(() => {
      window.print();

      document.querySelectorAll('a').forEach((link) => {
        const originalHref = link.getAttribute('data-href');
        if (originalHref) {
          link.setAttribute('href', originalHref);
          link.removeAttribute('data-href');
        }
      });

      if (gangCard) gangCard.style.display = '';
      if (details) details.style.display = '';
      inactiveFighters.forEach((el) => {
        (el as HTMLElement).style.display = '';
      });
      recoveryFighters.forEach((el) => {
        (el as HTMLElement).style.display = '';
      });
    }, 100);

    onClose();
  };

  return (
    <Modal
      title="Print Options"
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmText="Print"
      content={
        <div className="space-y-4">
          <div className="block text-sm font-medium text-gray-700">
            Include the following:
          </div>

          {[
            ['includeGangCard', 'Gang Card'],
            [
              'includeAdditionalDetails',
              'Additional Details (Territories, Stash, Notes)',
            ],
            ['includeInactiveFighters', 'Inactive Fighters'],
            ['includeRecoveryFighters', 'Fighters in Recovery'],
          ].map(([id, label]) => (
            <div key={id} className="flex items-center space-x-2">
              <input
                type="checkbox"
                id={id}
                checked={printOptions[id as keyof typeof printOptions]}
                onChange={(e) =>
                  setPrintOptions((prev) => ({
                    ...prev,
                    [id]: e.target.checked,
                  }))
                }
              />
              <label htmlFor={id} className="text-sm">
                {label}
              </label>
            </div>
          ))}
        </div>
      }
    />
  );
}
