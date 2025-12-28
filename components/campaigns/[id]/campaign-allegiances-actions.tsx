'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/use-toast"
import Modal from "@/components/ui/modal"
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { 
  createCampaignAllegiance, 
  updateCampaignAllegiance, 
  deleteCampaignAllegiance 
} from "@/app/actions/campaigns/[id]/campaign-allegiances"
import { LuTrash2, LuPencil, LuPlus } from 'react-icons/lu'

interface Allegiance {
  id: string;
  allegiance_name: string;
  is_custom: boolean;
}

interface CampaignAllegiancesActionsProps {
  campaignId: string;
  isCustomCampaign: boolean;
  canManage: boolean;
  initialAllegiances?: Array<{ id: string; allegiance_name: string; is_custom: boolean }>;
  onAllegiancesChange?: () => void;
  onMembersUpdate?: (allegianceId: string) => void;
  onAllegianceRenamed?: (allegianceId: string, newName: string) => void;
}

export default function CampaignAllegiancesActions({
  campaignId,
  isCustomCampaign,
  canManage,
  initialAllegiances = [],
  onAllegiancesChange,
  onMembersUpdate,
  onAllegianceRenamed
}: CampaignAllegiancesActionsProps) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [editingAllegiance, setEditingAllegiance] = useState<Allegiance | null>(null)
  const [deletingAllegiance, setDeletingAllegiance] = useState<Allegiance | null>(null)
  const [newAllegianceName, setNewAllegianceName] = useState('')
  const [editAllegianceName, setEditAllegianceName] = useState('')
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // Fetch custom allegiances using TanStack Query with caching
  const { data: allAllegiances = initialAllegiances, isLoading } = useQuery({
    queryKey: ['campaign-allegiances', campaignId],
    queryFn: async () => {
      const response = await fetch(`/api/campaigns/${campaignId}/allegiances`)
      if (!response.ok) {
        throw new Error('Failed to fetch allegiances')
      }
      return response.json() as Promise<Array<{ id: string; allegiance_name: string; is_custom: boolean }>>
    },
    initialData: initialAllegiances,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,  // 10 minutes
    enabled: canManage, // Only fetch if user can manage
  })

  // Filter to only show custom allegiances
  const allegiances = (allAllegiances || []).filter((a: Allegiance) => a.is_custom)

  // Mutation for creating allegiance with optimistic update
  const createMutation = useMutation({
    mutationFn: async (allegianceName: string) => {
      const result = await createCampaignAllegiance({
        campaignId,
        allegiance_name: allegianceName.trim()
      })
      if (!result.success) {
        throw new Error(result.error || 'Failed to create allegiance')
      }
      return result.data
    },
    onMutate: async (allegianceName) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['campaign-allegiances', campaignId] })

      // Snapshot the previous value
      const previousAllegiances = queryClient.getQueryData<Array<{ id: string; allegiance_name: string; is_custom: boolean }>>(['campaign-allegiances', campaignId])

      // Optimistically update with temporary ID
      const optimisticAllegiance = {
        id: `temp-${Date.now()}`,
        allegiance_name: allegianceName.trim(),
        is_custom: true
      }

      // Optimistically update the cache
      queryClient.setQueryData<Array<{ id: string; allegiance_name: string; is_custom: boolean }>>(
        ['campaign-allegiances', campaignId],
        (old = initialAllegiances) => [...old, optimisticAllegiance]
      )

      return { previousAllegiances }
    },
    onSuccess: (data, _variables, context) => {
      // Update cache with real data from server
      queryClient.setQueryData<Array<{ id: string; allegiance_name: string; is_custom: boolean }>>(
        ['campaign-allegiances', campaignId],
        (old = initialAllegiances) => {
          // Replace optimistic entry with real data
          const withoutTemp = old.filter(a => !a.id.startsWith('temp-'))
          // data is the Supabase row with id, campaign_id, allegiance_name
          // Transform to match our Allegiance interface
          if (data && 'id' in data && 'allegiance_name' in data) {
            const newAllegiance = {
              id: data.id as string,
              allegiance_name: data.allegiance_name as string,
              is_custom: true
            }
            return [...withoutTemp, newAllegiance]
          }
          return withoutTemp
        }
      )

      toast({
        description: "Allegiance created successfully"
      })

      setNewAllegianceName('')
      setShowAddModal(false)
      // Notify parent to refresh allegiance lists
      onAllegiancesChange?.()
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousAllegiances) {
        queryClient.setQueryData(['campaign-allegiances', campaignId], context.previousAllegiances)
      }

      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Failed to create allegiance"
      })
    }
  })

  const handleCreate = async () => {
    if (!newAllegianceName.trim()) {
      toast({
        variant: "destructive",
        description: "Allegiance name cannot be empty"
      })
      return false
    }

    createMutation.mutate(newAllegianceName.trim())
    return true
  }

  // Mutation for updating allegiance with optimistic update
  const updateMutation = useMutation({
    mutationFn: async ({ allegianceId, allegianceName }: { allegianceId: string; allegianceName: string }) => {
      const result = await updateCampaignAllegiance({
        campaignId,
        allegianceId,
        allegiance_name: allegianceName.trim()
      })
      if (!result.success) {
        throw new Error(result.error || 'Failed to update allegiance')
      }
      return result.data
    },
    onMutate: async ({ allegianceId, allegianceName }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['campaign-allegiances', campaignId] })

      // Snapshot the previous value
      const previousAllegiances = queryClient.getQueryData<Array<{ id: string; allegiance_name: string; is_custom: boolean }>>(['campaign-allegiances', campaignId])

      // Optimistically update the cache
      queryClient.setQueryData<Array<{ id: string; allegiance_name: string; is_custom: boolean }>>(
        ['campaign-allegiances', campaignId],
        (old = initialAllegiances) => old.map(a => 
          a.id === allegianceId 
            ? { ...a, allegiance_name: allegianceName.trim() }
            : a
        )
      )

      // Optimistically update gangs with this allegiance
      onAllegianceRenamed?.(allegianceId, allegianceName.trim())

      return { previousAllegiances }
    },
    onSuccess: () => {
      // Invalidate to refetch fresh data
      queryClient.invalidateQueries({ queryKey: ['campaign-allegiances', campaignId] })

      toast({
        description: "Allegiance updated successfully"
      })

      setEditingAllegiance(null)
      setEditAllegianceName('')
      setShowEditModal(false)
      // Notify parent to refresh allegiance lists
      onAllegiancesChange?.()
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousAllegiances) {
        queryClient.setQueryData(['campaign-allegiances', campaignId], context.previousAllegiances)
      }

      // Rollback gang updates
      const oldAllegiance = context?.previousAllegiances?.find(a => a.id === variables.allegianceId)
      if (oldAllegiance) {
        onAllegianceRenamed?.(variables.allegianceId, oldAllegiance.allegiance_name)
      }

      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Failed to update allegiance"
      })
    }
  })

  const handleEdit = async () => {
    if (!editingAllegiance || !editAllegianceName.trim()) {
      toast({
        variant: "destructive",
        description: "Allegiance name cannot be empty"
      })
      return false
    }

    updateMutation.mutate({
      allegianceId: editingAllegiance.id,
      allegianceName: editAllegianceName.trim()
    })
    return true
  }

  // Mutation for deleting allegiance with optimistic update
  const deleteMutation = useMutation({
    mutationFn: async (allegianceId: string) => {
      const result = await deleteCampaignAllegiance({
        campaignId,
        allegianceId
      })
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete allegiance')
      }
      return result
    },
    onMutate: async (allegianceId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['campaign-allegiances', campaignId] })

      // Snapshot the previous value
      const previousAllegiances = queryClient.getQueryData<Array<{ id: string; allegiance_name: string; is_custom: boolean }>>(['campaign-allegiances', campaignId])

      // Optimistically update the cache
      queryClient.setQueryData<Array<{ id: string; allegiance_name: string; is_custom: boolean }>>(
        ['campaign-allegiances', campaignId],
        (old = initialAllegiances) => old.filter(a => a.id !== allegianceId)
      )

      // Optimistically update members: clear allegiance from all gangs that have it
      onMembersUpdate?.(allegianceId)

      return { previousAllegiances }
    },
    onSuccess: () => {
      // Invalidate to refetch fresh data
      queryClient.invalidateQueries({ queryKey: ['campaign-allegiances', campaignId] })

      toast({
        description: "Allegiance deleted successfully"
      })

      setDeletingAllegiance(null)
      setShowDeleteModal(false)
      // Notify parent to refresh allegiance lists
      onAllegiancesChange?.()
    },
    onError: (error, allegianceId, context) => {
      // Rollback on error
      if (context?.previousAllegiances) {
        queryClient.setQueryData(['campaign-allegiances', campaignId], context.previousAllegiances)
      }

      // Rollback gang updates
      onMembersUpdate?.(allegianceId)

      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Failed to delete allegiance"
      })
    }
  })

  const handleDelete = async () => {
    if (!deletingAllegiance) return false

    deleteMutation.mutate(deletingAllegiance.id)
    return true
  }

  const openEditModal = (allegiance: Allegiance) => {
    setEditingAllegiance(allegiance)
    setEditAllegianceName(allegiance.allegiance_name)
    setShowEditModal(true)
  }

  const openDeleteModal = (allegiance: Allegiance) => {
    setDeletingAllegiance(allegiance)
    setShowDeleteModal(true)
  }

  if (!canManage) {
    return null
  }

  const addModalContent = (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium mb-2 block">Allegiance Name</label>
        <Input
          value={newAllegianceName}
          onChange={(e) => setNewAllegianceName(e.target.value)}
          placeholder="Enter allegiance name"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleCreate()
            }
          }}
          autoFocus
        />
      </div>
    </div>
  )

  const editModalContent = editingAllegiance ? (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium mb-2 block">Allegiance Name</label>
        <Input
          value={editAllegianceName}
          onChange={(e) => setEditAllegianceName(e.target.value)}
          placeholder="Enter allegiance name"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleEdit()
            }
          }}
          autoFocus
        />
      </div>
    </div>
  ) : null

  const deleteModalContent = deletingAllegiance ? (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Are you sure you want to delete the allegiance <strong>{deletingAllegiance.allegiance_name}</strong>?
        <span className="block mt-2 text-amber-600">
          This action cannot be undone. Any gangs using this allegiance will have their allegiance automatically cleared.
        </span>
      </p>
    </div>
  ) : null

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Button
          onClick={() => setShowAddModal(true)}
          size="sm"
        >
          Add Custom Allegiance
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading allegiances...</div>
      ) : allegiances.length > 0 && (
        <div className="space-y-2">
          {allegiances.map((allegiance) => (
            <div
              key={allegiance.id}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted transition-colors"
            >
              <span className="font-medium">{allegiance.allegiance_name}</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEditModal(allegiance)}
                  className="h-8 w-8 p-0"
                  title="Edit allegiance"
                >
                  <LuPencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openDeleteModal(allegiance)}
                  className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                  title="Delete allegiance"
                >
                  <LuTrash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <Modal
          title="Add Custom Allegiance"
          content={addModalContent}
          onClose={() => {
            setShowAddModal(false)
            setNewAllegianceName('')
          }}
          onConfirm={handleCreate}
          confirmText="Create"
          confirmDisabled={!newAllegianceName.trim()}
        />
      )}

      {showEditModal && editingAllegiance && (
        <Modal
          title="Edit Custom Allegiance"
          content={editModalContent}
          onClose={() => {
            setShowEditModal(false)
            setEditingAllegiance(null)
            setEditAllegianceName('')
          }}
          onConfirm={handleEdit}
          confirmText="Save"
          confirmDisabled={!editAllegianceName.trim() || updateMutation.isPending}
        />
      )}

      {showDeleteModal && deletingAllegiance && (
        <Modal
          title="Delete Custom Allegiance"
          content={deleteModalContent}
          onClose={() => {
            setShowDeleteModal(false)
            setDeletingAllegiance(null)
          }}
          onConfirm={handleDelete}
          confirmText="Delete"
          confirmDisabled={deleteMutation.isPending}
        />
      )}
    </div>
  )
}

