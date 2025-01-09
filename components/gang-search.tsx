'use client'

import { useState, useEffect } from 'react'
import { Input } from "@/components/ui/input"
import { createClient } from "@/utils/supabase/client"
import { Database } from "@/types/supabase"
import { useToast } from "@/components/ui/use-toast"
import { Button } from "@/components/ui/button"

type Gang = Database['public']['Tables']['gangs']['Row'] & {
  gang_type?: string;
  user?: {
    username: string;
  };
};

interface GangSearchProps {
  campaignId: string;
}

export default function GangSearch({ campaignId }: GangSearchProps) {
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Gang[]>([])
  const [campaignGangs, setCampaignGangs] = useState<Gang[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const supabase = createClient()
  const { toast } = useToast()

  // Load existing campaign gangs
  useEffect(() => {
    const loadCampaignGangs = async () => {
      try {
        // First get the gang IDs
        const { data: campaignGangsData, error: campaignGangsError } = await supabase
          .from('campaign_gangs')
          .select('gang_id')
          .eq('campaign_id', campaignId);

        if (campaignGangsError) throw campaignGangsError;

        if (!campaignGangsData?.length) {
          setCampaignGangs([]);
          return;
        }

        // Then get the gang details
        const gangIds = campaignGangsData.map(cg => cg.gang_id);
        const { data: gangsData, error: gangsError } = await supabase
          .from('gangs')
          .select('*')
          .in('id', gangIds);

        if (gangsError) throw gangsError;

        // Get usernames for each gang
        const userIds = gangsData?.map(gang => gang.user_id) || [];
        const { data: usersData, error: usersError } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', userIds);

        if (usersError) throw usersError;

        // Create a map of user IDs to usernames
        const userMap = Object.fromEntries(
          (usersData || []).map(user => [user.id, user.username])
        );

        // Combine the data
        const transformedGangs = gangsData?.map(gang => ({
          ...gang,
          user: {
            username: userMap[gang.user_id]
          }
        })) || [];

        setCampaignGangs(transformedGangs);

      } catch (error) {
        console.error('Error loading campaign gangs:', error);
        toast({
          variant: "destructive",
          description: "Failed to load campaign gangs"
        });
      }
    };

    loadCampaignGangs();
  }, [campaignId]);

  // Search for gangs
  useEffect(() => {
    const searchGangs = async () => {
      if (query.trim() === '') {
        setSearchResults([])
        return
      }

      setIsLoading(true)
      try {
        // First get the gangs
        const { data: gangsData, error: gangsError } = await supabase
          .from('gangs')
          .select('*')
          .ilike('name', `%${query}%`)
          .limit(5)

        if (gangsError) throw gangsError

        if (!gangsData?.length) {
          setSearchResults([])
          return
        }

        // Then get the gang types
        const gangTypeIds = gangsData.map(gang => gang.gang_type_id)
        const { data: gangTypesData, error: gangTypesError } = await supabase
          .from('gang_types')
          .select('gang_type_id, gang_type')
          .in('gang_type_id', gangTypeIds)

        if (gangTypesError) throw gangTypesError

        // Create a map of gang type IDs to names
        const gangTypeMap = Object.fromEntries(
          (gangTypesData || []).map(type => [type.gang_type_id, type.gang_type])
        )

        // Then get the usernames
        const userIds = gangsData.map(gang => gang.user_id)
        const { data: usersData, error: usersError } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', userIds)

        if (usersError) throw usersError

        // Create a map of user IDs to usernames
        const userMap = Object.fromEntries(
          (usersData || []).map(user => [user.id, user.username])
        )

        // Transform the data to include gang_type and username
        const transformedData = gangsData.map(gang => ({
          ...gang,
          gang_type: gangTypeMap[gang.gang_type_id],
          user: {
            username: userMap[gang.user_id]
          }
        }))

        // Filter out gangs that are already in the campaign
        const filteredResults = transformedData.filter(
          gang => !campaignGangs.some(cGang => cGang.id === gang.id)
        )
        setSearchResults(filteredResults)
      } catch (error) {
        console.error('Error searching gangs:', error)
        setSearchResults([])
      } finally {
        setIsLoading(false)
      }
    }

    const debounceTimer = setTimeout(searchGangs, 300)
    return () => clearTimeout(debounceTimer)
  }, [query, campaignGangs])

  const handleAddGang = async (gang: Database['public']['Tables']['gangs']['Row']) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/campaign_gangs`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            campaign_id: campaignId,
            gang_id: gang.id
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to add gang to campaign');
      }

      setCampaignGangs([...campaignGangs, gang]);
      toast({
        description: `Added ${gang.name} to the campaign`
      });
      setQuery('');
      setSearchResults([]);
    } catch (error) {
      console.error('Error adding gang to campaign:', error);
      toast({
        description: 'Failed to add gang to campaign',
        variant: "destructive"
      });
    }
  };

  const handleRemoveGang = async (gang: Gang) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/campaign_gangs?campaign_id=eq.${campaignId}&gang_id=eq.${gang.id}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            'Authorization': `Bearer ${session?.access_token}`,
            'Prefer': 'return=minimal'
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to remove gang from campaign');
      }

      setCampaignGangs(campaignGangs.filter(g => g.id !== gang.id));
      toast({
        description: `Removed ${gang.name} from the campaign`
      });
    } catch (error) {
      console.error('Error removing gang from campaign:', error);
      toast({
        variant: "destructive",
        description: "Failed to remove gang from campaign"
      });
    }
  };

  return (
    <div className="w-full">
      <div className="relative">
        <Input
          type="text"
          placeholder="Search to add gang"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full"
          disabled={isAdding}
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        )}
        {searchResults.length > 0 && query && (
          <div className="absolute mt-1 w-full bg-white rounded-lg border shadow-lg z-10">
            <ul className="py-2">
              {searchResults.map(gang => (
                <li key={gang.id}>
                  <button
                    onClick={() => handleAddGang(gang)}
                    className="w-full px-4 py-2 text-left hover:bg-gray-100"
                    disabled={isAdding}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{gang.name}</span>
                      <span className="text-sm text-gray-600">
                        {gang.gang_type} - Owner: {gang.user?.username || 'Unknown'}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {campaignGangs.length > 0 && (
        <div className="mt-4">
          <h3 className="font-medium mb-2">Campaign Gangs:</h3>
          <ul className="space-y-2">
            {campaignGangs.map(gang => (
              <li key={gang.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div className="flex items-center gap-2">
                  <span>{gang.name} ({gang.gang_type})</span>
                  <span className="text-sm text-gray-500">- {gang.user?.username}</span>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleRemoveGang(gang)}
                  className="text-xs px-1.5 h-6"
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
} 