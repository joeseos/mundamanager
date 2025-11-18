'use client';

import { useState } from 'react';
import Modal from "@/components/ui/modal";
import { Checkbox } from "@/components/ui/checkbox";

interface PrintModalProps {
  gangId: string;
  onClose: () => void;
}

export default function PrintModal({ gangId, onClose }: PrintModalProps) {
  const [printOptions, setPrintOptions] = useState({
    includeGangCard: true,
    includeAdditionalDetails: true,
    includeInactiveFighters: true,
    includeRecoveryFighters: true,
  });
  const [printStyle, setPrintStyle] = useState<'eco' | 'fancy'>('eco');

  const handleConfirm = () => {
    const gangCard = document.getElementById('gang_card');
    const details = document.getElementById('gang_card_additional_details');
    const inactiveFighters = document.querySelectorAll('[id^="is_inactive"]');
    const recoveryFighters = document.querySelectorAll('[id^="is_recovery"]');

    if (printStyle === 'fancy') {
      document.body.classList.add('fancy-print');
    } else {
      document.body.classList.remove('fancy-print');
    }

    if (gangCard) gangCard.style.display = printOptions.includeGangCard ? '' : 'none';
    if (details) details.style.display = printOptions.includeAdditionalDetails ? '' : 'none';

    inactiveFighters.forEach(el => {
      (el as HTMLElement).style.display = printOptions.includeInactiveFighters ? '' : 'none';
    });
    recoveryFighters.forEach(el => {
      (el as HTMLElement).style.display = printOptions.includeRecoveryFighters ? '' : 'none';
    });

    document.querySelectorAll('a').forEach(link => {
      link.setAttribute('data-href', link.getAttribute('href') || '');
      link.removeAttribute('href');
    });

    setTimeout(() => {
      window.print();

      document.querySelectorAll('a').forEach(link => {
        const originalHref = link.getAttribute('data-href');
        if (originalHref) {
          link.setAttribute('href', originalHref);
          link.removeAttribute('data-href');
        }
      });

      if (gangCard) gangCard.style.display = '';
      if (details) details.style.display = '';
      inactiveFighters.forEach(el => {
        (el as HTMLElement).style.display = '';
      });
      recoveryFighters.forEach(el => {
        (el as HTMLElement).style.display = '';
      });
      document.body.classList.remove('fancy-print');
    }, 100);

    onClose();
  };

  return (
    <Modal
      title="Print Options"
      helper="These settings only affect desktop printing. They have no effect when printing from a mobile device."
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmText="Print"
      content={
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="block text-sm font-medium text-muted-foreground">Print style</div>
            <div className="flex flex-col gap-2">
              {[
                {
                  id: 'eco',
                  label: 'Eco',
                  description: 'Hide decorative backgrounds to save ink.'
                },
                {
                  id: 'fancy',
                  label: 'Fancy',
                  description: 'Include illustrated card backgrounds when printing.'
                }
              ].map(({ id, label, description }) => (
                <label
                  key={id}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                    printStyle === id ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="print-style"
                    value={id}
                    checked={printStyle === id}
                    onChange={() => setPrintStyle(id as 'eco' | 'fancy')}
                    className="mt-1 sr-only"
                  />
                  <div>
                    <div className="text-sm font-medium">{label}</div>
                    <div className="text-xs text-muted-foreground">{description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="block text-sm font-medium text-muted-foreground">Include the following:</div>

          {[
            ['includeGangCard', 'Gang Card'],
            ['includeAdditionalDetails', 'Additional Details (Territories, Stash, Notes)'],
            ['includeInactiveFighters', 'Inactive Fighters'],
            ['includeRecoveryFighters', 'Fighters in Recovery'],
          ].map(([id, label]) => (
            <div key={id} className="flex items-center space-x-2">
              <Checkbox
                id={id}
                checked={printOptions[id as keyof typeof printOptions]}
                onCheckedChange={(checked) =>
                  setPrintOptions(prev => ({ ...prev, [id]: checked }))
                }
              />
              <label htmlFor={id} className="text-sm">{label}</label>
            </div>
          ))}
        </div>
      }
    />
  );
}
