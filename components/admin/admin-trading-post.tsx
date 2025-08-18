'use client';

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
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
  const [tradingPostTypes, setTradingPostTypes] = useState<TradingPostType[]>(propTradingPostTypes);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Update trading post types when prop changes
  useEffect(() => {
    if (propTradingPostTypes.length > 0) {
      setTradingPostTypes(propTradingPostTypes);
    }
  }, [propTradingPostTypes]);

  // Fetch trading post types only if not provided as prop and dialog is opened
  useEffect(() => {
    const fetchTradingPostTypes = async () => {
      // Only fetch if dialog is open AND we don't have types from props
      if (!showTradingPostDialog || propTradingPostTypes.length > 0) return;
      
      setIsLoading(true);
      try {
        const response = await fetch('/api/admin/equipment/trading-post-types');
        if (!response.ok) throw new Error('Failed to fetch trading post types');
        const data = await response.json();
        setTradingPostTypes(data);
      } catch (error) {
        console.error('Error fetching trading post types:', error);
        toast({
          description: 'Failed to load trading post types',
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchTradingPostTypes();
  }, [showTradingPostDialog, propTradingPostTypes.length, toast]);

  const handleSave = () => {
    toast({
      description: "Trading Post selections saved. Remember to update the equipment to apply changes.",
      variant: "default"
    });
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
      <div className="text-sm text-gray-600">
        Select which trading posts should include this equipment.
      </div>
      
      {isLoading ? (
        <div className="p-4 text-center text-gray-500">Loading trading post types...</div>
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
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <div className="text-sm font-medium text-gray-700 mb-2">
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
      <label className="block text-sm font-medium text-gray-700 mb-1">
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
                className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800"
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