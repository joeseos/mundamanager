'use client';

import React, { useState } from 'react';
import { Input } from '../ui/input';
import Modal from '@/components/ui/modal';
import { toast } from 'sonner';
import { ResourceUpdate } from '@/types/gang';
import { hasTradePoints } from '@/types/edition';
import {
  RESOURCE_REASON_MAX_LENGTH,
  sanitizeResourceReason,
} from '@/utils/sanitize-resource-reason';

interface ResourceUpdates {
  credits?: number;
  credits_operation?: 'add' | 'subtract';
  credits_reason?: string;
  reputation?: number;
  reputation_operation?: 'add' | 'subtract';
  reputation_reason?: string;
  trade_points?: number;
  trade_points_operation?: 'add' | 'subtract';
  trade_points_reason?: string;
  resourceUpdates?: ResourceUpdate[];
}

interface CampaignResource {
  resource_id: string;
  resource_name: string;
  quantity: number;
  is_custom: boolean;
}

interface Campaign {
  campaign_id: string;
  campaign_gang_id: string;
  resources?: CampaignResource[];
}

interface GangResourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
  credits: number;
  reputation: number;
  tradePoints: number;
  editionSlug?: string | null;
  campaigns?: Campaign[];
  onSave: (updates: ResourceUpdates) => Promise<boolean>;
}

function isNonZeroDelta(value: string | undefined): boolean {
  return (parseInt(value || '') || 0) !== 0;
}

/**
 * Dedicated modal for adjusting gang resources (credits, reputation,
 * trade points, and campaign-specific resources).
 */
export default function GangResourcesModal({
  isOpen,
  onClose,
  credits,
  reputation,
  tradePoints,
  editionSlug,
  campaigns,
  onSave,
}: GangResourcesModalProps) {
  const [formState, setFormState] = useState({
    credits: '',
    reputation: '',
    trade_points: '',
  });
  const [resourceDeltas, setResourceDeltas] = useState<Record<string, string>>({});
  const [resourceReasons, setResourceReasons] = useState<Record<string, string>>({});

  const resetKey = `${isOpen}-${credits}-${reputation}-${tradePoints}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    if (isOpen) {
      setFormState({
        credits: '',
        reputation: '',
        trade_points: '',
      });
      setResourceDeltas({});
      setResourceReasons({});
    }
  }

  const setReason = (key: string, value: string) => {
    setResourceReasons(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async (): Promise<boolean> => {
    const updates: ResourceUpdates = {};

    const creditsDifference = parseInt(formState.credits) || 0;
    if (credits + creditsDifference < 0) {
      toast.error('Insufficient credits', {
        description: `Cannot subtract ${Math.abs(creditsDifference)} credits. Current balance: ${credits}`,
      });
      return false;
    }
    if (creditsDifference !== 0) {
      updates.credits = Math.abs(creditsDifference);
      updates.credits_operation = creditsDifference >= 0 ? 'add' : 'subtract';
      const reason = sanitizeResourceReason(resourceReasons['credits']);
      if (reason) updates.credits_reason = reason;
    }

    const reputationDifference = parseInt(formState.reputation) || 0;
    if (reputationDifference !== 0) {
      updates.reputation = Math.abs(reputationDifference);
      updates.reputation_operation = reputationDifference >= 0 ? 'add' : 'subtract';
      const reason = sanitizeResourceReason(resourceReasons['reputation']);
      if (reason) updates.reputation_reason = reason;
    }

    if (hasTradePoints(editionSlug)) {
      const tradePointsDifference = parseInt(formState.trade_points) || 0;
      if (tradePointsDifference !== 0) {
        updates.trade_points = Math.abs(tradePointsDifference);
        updates.trade_points_operation = tradePointsDifference >= 0 ? 'add' : 'subtract';
        const reason = sanitizeResourceReason(resourceReasons['trade_points']);
        if (reason) updates.trade_points_reason = reason;
      }
    }

    const resourceUpdatesList: ResourceUpdate[] = [];
    const campaignResources = campaigns?.[0]?.resources || [];

    for (const resource of campaignResources) {
      const deltaStr = resourceDeltas[resource.resource_id];
      const delta = parseInt(deltaStr) || 0;
      if (delta !== 0) {
        const reason = sanitizeResourceReason(resourceReasons[resource.resource_id]);
        resourceUpdatesList.push({
          resource_id: resource.resource_id,
          is_custom: resource.is_custom,
          quantity_delta: delta,
          ...(reason ? { reason } : {}),
        });
      }
    }

    if (resourceUpdatesList.length > 0) {
      updates.resourceUpdates = resourceUpdatesList;
    }

    if (Object.keys(updates).length === 0) {
      return false;
    }

    return await onSave(updates);
  };

  const reasonInput = (key: string) => (
    <Input
      type="text"
      value={resourceReasons[key] || ''}
      onChange={(e) => setReason(key, e.target.value)}
      placeholder="Reason (optional)"
      maxLength={RESOURCE_REASON_MAX_LENGTH}
      className="mt-1.5"
    />
  );

  const modalContent = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className="text-xs font-medium">Credits
            <span className="text-xs text-muted-foreground"> (Current: {credits})</span>
          </p>
          <Input
            type="tel"
            inputMode="url"
            pattern="-?[0-9]+"
            value={formState.credits}
            onChange={(e) => setFormState(prev => ({ ...prev, credits: e.target.value }))}
            className="flex-1"
            placeholder="0"
          />
          {isNonZeroDelta(formState.credits) && reasonInput('credits')}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium">
            Reputation
            <span className="text-xs text-muted-foreground"> (Current: {reputation})</span>
          </p>
          <Input
            type="tel"
            inputMode="url"
            pattern="-?[0-9]+"
            value={formState.reputation}
            onChange={(e) => setFormState(prev => ({ ...prev, reputation: e.target.value }))}
            className="flex-1"
            placeholder="0"
          />
          {isNonZeroDelta(formState.reputation) && reasonInput('reputation')}
        </div>

        {hasTradePoints(editionSlug) && (
          <div className="space-y-2">
            <p className="text-xs font-medium">
              Trade Points
              <span className="text-xs text-muted-foreground"> (Current: {tradePoints})</span>
            </p>
            <Input
              type="tel"
              inputMode="url"
              pattern="-?[0-9]+"
              value={formState.trade_points}
              onChange={(e) => setFormState(prev => ({ ...prev, trade_points: e.target.value }))}
              className="flex-1"
              placeholder="0"
            />
            {isNonZeroDelta(formState.trade_points) && reasonInput('trade_points')}
          </div>
        )}

        {campaigns?.[0]?.resources?.map((resource) => (
          <div key={resource.resource_id} className="space-y-2">
            <p className="text-xs font-medium">
              {resource.resource_name}
              <span className="text-xs text-muted-foreground"> (Current: {resource.quantity})</span>
            </p>
            <Input
              type="tel"
              inputMode="url"
              pattern="-?[0-9]+"
              value={resourceDeltas[resource.resource_id] || ''}
              onChange={(e) => setResourceDeltas(prev => ({
                ...prev,
                [resource.resource_id]: e.target.value,
              }))}
              className="flex-1"
              placeholder="0"
            />
            {isNonZeroDelta(resourceDeltas[resource.resource_id]) && reasonInput(resource.resource_id)}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      {isOpen && (
        <Modal
          title="Resources"
          helper="Add or remove resources (e.g. 5 or -5)"
          content={modalContent}
          onClose={onClose}
          onConfirm={handleSave}
          confirmText="Save Changes"
        />
      )}
    </>
  );
}
