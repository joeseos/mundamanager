'use client';

import { useQuery } from '@tanstack/react-query';
import { LuChartColumn } from "react-icons/lu";

interface ActivityStats {
  last2Weeks: number | null;
  last1Month: number | null;
  last3Months: number | null;
  last6Months: number | null;
}

interface Stats {
  userCount: number;
  gangCount: number | null;
  campaignCount: number | null;
  gangActivity: ActivityStats | null;
  campaignActivity: ActivityStats | null;
}

interface AdminStatsModalProps {
  onClose: () => void;
  onSubmit?: () => void;
}

function formatStatValue(value: number | null | undefined): string {
  return value !== null && value !== undefined ? value.toLocaleString() : 'N/A';
}

function ActivitySection({
  title,
  activity,
}: {
  title: string;
  activity: ActivityStats | null;
}) {
  const periods = [
    { label: 'Last 2 weeks', value: activity?.last2Weeks },
    { label: 'Last 1 month', value: activity?.last1Month },
    { label: 'Last 3 months', value: activity?.last3Months },
    { label: 'Last 6 months', value: activity?.last6Months },
  ] as const;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {periods.map(({ label, value }) => (
          <div key={label} className="p-2 bg-muted/50 rounded-lg border">
            <p className="text-center text-xs text-muted-foreground mb-2">{label}</p>
            <p className="text-center text-lg md:text-xl font-bold">{formatStatValue(value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminStatsModal({ onClose, onSubmit }: AdminStatsModalProps) {
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const response = await fetch('/api/admin/stats');
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    },
  });

  return (
    <div 
      className="fixed inset-0 bg-black/50 dark:bg-neutral-700/50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-lg shadow-xl w-full max-w-2xl min-h-0 max-h-svh overflow-y-auto flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div>
            <div className="flex items-center space-x-2">
              <LuChartColumn className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-xl md:text-2xl font-bold text-foreground">Statistics</h3>
            </div>
            <p className="text-sm text-muted-foreground">View database statistics.</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-muted-foreground text-xl"
          >
            ×
          </button>
        </div>

        <div className="px-[10px] py-4 overflow-y-auto grow">
          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <p className="text-muted-foreground">Loading stats...</p>
            </div>
          ) : stats ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-foreground">Total Counts</h4>
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2 bg-muted/50 rounded-lg border">
                    <p className="text-center text-sm text-muted-foreground mb-2">Users</p>
                    <p className="text-center text-lg md:text-xl font-bold">{stats.userCount.toLocaleString()}</p>
                  </div>
                  <div className="p-2 bg-muted/50 rounded-lg border">
                    <p className="text-center text-sm text-muted-foreground mb-2">Gangs</p>
                    <p className="text-center text-lg md:text-xl font-bold">
                      {formatStatValue(stats.gangCount)}
                    </p>
                  </div>
                  <div className="p-2 bg-muted/50 rounded-lg border">
                    <p className="text-center text-sm text-muted-foreground mb-2">Campaigns</p>
                    <p className="text-center text-lg md:text-xl font-bold">
                      {formatStatValue(stats.campaignCount)}
                    </p>
                  </div>
                </div>
              </div>

              <ActivitySection title="Gang Activity" activity={stats.gangActivity} />
              <ActivitySection title="Campaign Activity" activity={stats.campaignActivity} />
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
