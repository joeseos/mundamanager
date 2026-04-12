'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from 'sonner';
import Modal from "@/components/ui/modal";

interface TradingPostType {
  id: string;
  trading_post_name: string;
}

interface AdminTradingPostProps {
  equipmentId: string;
  selectedTradingPosts: string[];
  setSelectedTradingPosts: (tradingPosts: string[] | ((prev: string[]) => string[])) => void;
  tradingPostTypes?: TradingPostType[];
  disabled?: boolean;
}

export function AdminTradingPost({
  equipmentId,
  selectedTradingPosts,
  setSelectedTradingPosts,
  tradingPostTypes: propTradingPostTypes = [],
  disabled = false
}: AdminTradingPostProps) {
  const [showTradingPostDialog, setShowTradingPostDialog] = useState(false);

  const { data: fetchedTradingPostTypes = [], isLoading } = useQuery<TradingPostType[]>({
    queryKey: ['admin-trading-post-types'],
    queryFn: async () => {
      const response = await fetch('/api/admin/equipment/trading-post-types');
      if (!response.ok) throw new Error('Failed to fetch trading post types');
      return response.json();
    },
    enabled: showTradingPostDialog && propTradingPostTypes.length === 0,
    staleTime: 5 * 60 * 1000,
  });

  const tradingPostTypes = propTradingPostTypes.length > 0 ? propTradingPostTypes : fetchedTradingPostTypes;

  const handleSave = () => {
    toast.success("Trading Post selections saved. Remember to update the equipment to apply changes.");
    return true;
  };

  const handleTradingPostToggle = (tradingPostId: string, checked: boolean) => {
    if (checked) {
      setSelectedTradingPosts(prev => [...prev, tradingPostId]);
    } else {
      setSelectedTradingPosts(prev => prev.filter(id => id !== tradingPostId));
    }
  };

  const modalContent = (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Select which trading posts should include this equipment.
      </div>
      
      {isLoading ? (
        <div className="p-4 text-center text-muted-foreground">Loading trading post types...</div>
      ) : (
        <div className="space-y-3">
          {tradingPostTypes.map((tradingPost) => (
            <div key={tradingPost.id} className="flex items-center space-x-3">
              <Checkbox
                id={`trading-post-${tradingPost.id}`}
                checked={selectedTradingPosts.includes(tradingPost.id)}
                onCheckedChange={(checked) => 
                  handleTradingPostToggle(tradingPost.id, checked as boolean)
                }
              />
              <label 
                htmlFor={`trading-post-${tradingPost.id}`} 
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {tradingPost.trading_post_name}
              </label>
            </div>
          ))}
        </div>
      )}
      
      {selectedTradingPosts.length > 0 && (
        <div className="mt-4 p-3 bg-muted rounded-lg">
          <div className="text-sm font-medium text-muted-foreground mb-2">
            Selected Trading Posts ({selectedTradingPosts.length}):
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedTradingPosts.map((tradingPostId) => {
              const tradingPost = tradingPostTypes.find(tp => tp.id === tradingPostId);
              return tradingPost ? (
                <span 
                  key={tradingPostId}
                  className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800"
                >
                  {tradingPost.trading_post_name}
                </span>
              ) : null;
            })}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="col-span-1">
      <label className="block text-sm font-medium text-muted-foreground mb-1">
        Trading Posts
      </label>
      <Button
        onClick={() => setShowTradingPostDialog(true)}
        variant="outline"
        size="sm"
        className="mb-2"
        disabled={disabled}
      >
        Manage Trading Posts
      </Button>
      
      {selectedTradingPosts.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selectedTradingPosts.map((tradingPostId) => {
            const tradingPost = tradingPostTypes.find(tp => tp.id === tradingPostId);
            return tradingPost ? (
              <span 
                key={tradingPostId}
                className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-muted text-foreground"
              >
                {tradingPost.trading_post_name}
              </span>
            ) : null;
          })}
        </div>
      )}

      {showTradingPostDialog && (
        <Modal
          title="Trading Post Management"
          helper="Select which trading posts should include this equipment"
          content={modalContent}
          onClose={() => setShowTradingPostDialog(false)}
          onConfirm={handleSave}
          confirmText="Save Selections"
        />
      )}
    </div>
  );
} 