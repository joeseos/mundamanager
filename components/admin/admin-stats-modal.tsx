'use client';

import { useEffect, useState } from 'react';
import { LuChartColumn } from "react-icons/lu";

interface Stats {
  userCount: number;
  gangCount: number | null;
  campaignCount: number | null;
}

interface AdminStatsModalProps {
  onClose: () => void;
  onSubmit?: () => void;
}

export function AdminStatsModal({ onClose, onSubmit }: AdminStatsModalProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/admin/stats');
        if (!response.ok) throw new Error('Failed to fetch stats');
        const data = await response.json();
        setStats(data);
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <div 
      className="fixed inset-0 bg-black/50 dark:bg-neutral-700/50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-lg shadow-xl w-full max-w-2xl min-h-0 max-h-svh overflow-y-auto flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <LuChartColumn className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-xl md:text-2xl font-bold text-foreground">Statistics</h3>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-muted-foreground text-xl"
          >
            ×
          </button>
        </div>

        <div className="px-[10px] py-4 overflow-y-auto flex-grow">
          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <p className="text-muted-foreground">Loading stats...</p>
            </div>
          ) : stats ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-6 bg-muted/50 rounded-lg border">
                <p className="text-sm text-muted-foreground mb-2">Total Users</p>
                <p className="text-3xl font-bold">{stats.userCount.toLocaleString()}</p>
              </div>
              <div className="p-6 bg-muted/50 rounded-lg border">
                <p className="text-sm text-muted-foreground mb-2">Total Gangs</p>
                <p className="text-3xl font-bold">
                  {stats.gangCount !== null ? stats.gangCount.toLocaleString() : 'N/A'}
                </p>
              </div>
              <div className="p-6 bg-muted/50 rounded-lg border">
                <p className="text-sm text-muted-foreground mb-2">Total Campaigns</p>
                <p className="text-3xl font-bold">
                  {stats.campaignCount !== null ? stats.campaignCount.toLocaleString() : 'N/A'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center items-center py-8">
              <p className="text-muted-foreground">Failed to load stats</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

