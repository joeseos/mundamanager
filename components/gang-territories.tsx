'use client';

import { useEffect, useState, useCallback } from 'react';

interface Territory {
  id: string;
  territory_name: string;
  campaign_id?: string;
  campaign_name?: string;
}

// Create a simple cache object that persists between renders
// This will store territory data for each gang
const territoriesCache: Record<string, {
  territories: Territory[],
  timestamp: number
}> = {};

// Cache expiration time (1 hour in milliseconds)
const CACHE_EXPIRATION = 60 * 60 * 1000;

export default function GangTerritories({ gangId }: { gangId: string }) {
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Define fetchTerritories with useCallback so it can be used in both useEffect and refresh button
  const fetchTerritories = useCallback(async (skipCache = false) => {
    // Check if we have cached data that isn't expired
    const cachedData = territoriesCache[gangId];
    const now = Date.now();
    
    if (!skipCache && cachedData && (now - cachedData.timestamp < CACHE_EXPIRATION)) {
      console.log('Using cached territory data for gang:', gangId);
      setTerritories(cachedData.territories);
      return;
    }
    
    // No valid cache or skipCache is true, need to fetch
    setIsLoading(true);
    
    try {
      console.log('Fetching territory data for gang:', gangId);
      const response = await fetch(`${window.location.origin}/api/gangs/${gangId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch territories');
      }

      const data = await response.json();
      
      // Store territories in state and cache
      setTerritories(data.territories || []);
      
      // Update cache with fresh data and timestamp
      territoriesCache[gangId] = {
        territories: data.territories || [],
        timestamp: now
      };
    } catch (error) {
      setError('Failed to load territories');
      console.error('Error fetching territories:', error);
    } finally {
      setIsLoading(false);
    }
  }, [gangId]);

  // Function to manually refresh data
  const refreshTerritories = useCallback(() => {
    fetchTerritories(true); // Skip cache on manual refresh
  }, [fetchTerritories]);

  // Initial data fetch
  useEffect(() => {
    fetchTerritories();
  }, [fetchTerritories]);

  if (isLoading) {
    return (
      <div className="px-6 py-3 text-gray-500 text-center">
        Loading territories...
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6 py-3 text-red-500 text-center">
        <div>{error}</div>
        <button 
          onClick={refreshTerritories}
          className="mt-2 px-4 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="px-6 py-3 bg-gray-50 flex justify-between items-center">
        <div className="text-sm font-medium text-gray-500">Territory Name</div>
        <button 
          onClick={refreshTerritories}
          className="text-xs text-gray-500 hover:text-gray-700"
          title="Refresh territories"
        >
          Refresh
        </button>
      </div>
      <div className="divide-y">
        {territories.length > 0 ? (
          territories.map((territory) => (
            <div key={territory.id} className="px-6 py-3">
              <div className="flex justify-between">
                <div>{territory.territory_name}</div>
                {territory.campaign_name && (
                  <div className="text-xs text-gray-500">
                    {territory.campaign_name}
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="text-gray-500 italic text-center p-4">
            No territories controlled.
          </div>
        )}
      </div>
    </div>
  );
} 