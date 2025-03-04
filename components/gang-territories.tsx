'use client';

import { useEffect, useState } from 'react';

interface Territory {
  id: string;
  territory_name: string;
}

export default function GangTerritories({ gangId }: { gangId: string }) {
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTerritories = async () => {
      try {
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
        setTerritories(data.territories || []);
      } catch (error) {
        setError('Failed to load territories');
        console.error('Error fetching territories:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTerritories();
  }, [gangId]);

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
        {error}
      </div>
    );
  }

  return (
    <div>
      <div className="px-6 py-3 bg-gray-50">
        <div className="text-sm font-medium text-gray-500">Territory Name</div>
      </div>
      <div className="divide-y">
        {territories.length > 0 ? (
          territories.map((territory) => (
            <div key={territory.id} className="px-6 py-3">
              <div>{territory.territory_name}</div>
            </div>
          ))
        ) : (
          <div className="text-gray-500 italic text-center">
            No territories controlled.
          </div>
        )}
      </div>
    </div>
  );
} 