'use client'

import { useState, useEffect, useMemo } from 'react'
import { Input } from "@/components/ui/input"
import { createClient } from "@/utils/supabase/client"
import { Database } from "@/types/supabase"
import { useToast } from "@/components/ui/use-toast"
import { Button } from "@/components/ui/button"
import { LuTrash2 } from 'react-icons/lu'
import { useMutation } from '@tanstack/react-query'
import { addGangToCampaignDirect, removeGangFromCampaignDirect } from "@/app/actions/campaigns/[id]/campaign-gangs"

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
        // Combine the queries into a single join operation
        const { data: gangsData, error: gangsError } = await supabase
          .from('gangs')
          .select(`
            *,
            gang_types(gang_type),
            profiles(username)
          `)
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
        const transformedResults = gangsData.map(gang => ({
          ...gang,
          gang_type: gangTypeMap[gang.gang_type_id],
          user: {
            username: userMap[gang.user_id]
          }
        }))

        // Filter out gangs that are already in the campaign
        const filteredResults = transformedResults.filter(
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

  // TanStack Query mutation for adding gang
  const addGangMutation = useMutation({
    mutationFn: async (variables: { gangId: string; gangName: string }) => {
      const result = await addGangToCampaignDirect({
        campaignId,
        gangId: variables.gangId
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to add gang to campaign');
      }
      return result;
    },
    onMutate: async (variables) => {
      // Find the gang from search results for optimistic update
      const gang = searchResults.find(g => g.id === variables.gangId);
      if (!gang) return {};

      // Store previous state for rollback
      const previousGangs = [...campaignGangs];
      
      // Optimistically add gang to the list
      setCampaignGangs([...campaignGangs, gang]);
      
      // Clear search
      setQuery('');
      setSearchResults([]);

      return { previousGangs, gangName: variables.gangName };
    },
    onSuccess: (result, variables, context) => {
      toast({
        description: result.message || `Added ${context?.gangName} to the campaign`
      });
    },
    onError: (error, variables, context) => {
      // Rollback optimistic update
      if (context?.previousGangs) {
        setCampaignGangs(context.previousGangs);
      }
      
      toast({
        description: error instanceof Error ? error.message : 'Failed to add gang to campaign',
        variant: "destructive"
      });
    }
  });

  // TanStack Query mutation for removing gang
  const removeGangMutation = useMutation({
    mutationFn: async (variables: { gangId: string; gangName: string }) => {
      const result = await removeGangFromCampaignDirect({
        campaignId,
        gangId: variables.gangId
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to remove gang from campaign');
      }
      return result;
    },
    onMutate: async (variables) => {
      // Store previous state for rollback
      const previousGangs = [...campaignGangs];
      
      // Optimistically remove gang from the list
      setCampaignGangs(campaignGangs.filter(g => g.id !== variables.gangId));

      return { previousGangs, gangName: variables.gangName };
    },
    onSuccess: (result, variables, context) => {
      toast({
        description: result.message || `Removed ${context?.gangName} from the campaign`
      });
    },
    onError: (error, variables, context) => {
      // Rollback optimistic update
      if (context?.previousGangs) {
        setCampaignGangs(context.previousGangs);
      }
      
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Failed to remove gang from campaign"
      });
    }
  });

  const handleAddGang = (gang: Database['public']['Tables']['gangs']['Row']) => {
    addGangMutation.mutate({
      gangId: gang.id,
      gangName: gang.name
    });
  };

  const handleRemoveGang = (gang: Gang) => {
    removeGangMutation.mutate({
      gangId: gang.id,
      gangName: gang.name
    });
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
          disabled={addGangMutation.isPending || removeGangMutation.isPending}
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        )}
        {searchResults.length > 0 && query && (
          <div className="absolute mt-1 w-full bg-card rounded-lg border shadow-lg z-10">
            <ul className="py-2">
              {searchResults.map(gang => (
                <li key={gang.id}>
                  <button
                    onClick={() => handleAddGang(gang)}
                    className="w-full px-4 py-2 text-left hover:bg-muted"
                    disabled={addGangMutation.isPending || removeGangMutation.isPending}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{gang.name}</span>
                      <span className="text-sm text-muted-foreground">
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
        <div className="mt-2">
          <h3 className="font-medium mb-2">Campaign Gangs:</h3>
          <ul className="space-y-2">
            {campaignGangs.map(gang => (
              <li key={gang.id} className="flex items-center justify-between p-2 bg-muted rounded">
                <div className="flex items-center gap-2">
                  <span>{gang.name} ({gang.gang_type})</span>
                  <span className="text-sm text-muted-foreground">- {gang.user?.username}</span>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleRemoveGang(gang)}
                  className="text-xs px-1.5 h-6"
                  disabled={addGangMutation.isPending || removeGangMutation.isPending}
                >
                  <LuTrash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
} 