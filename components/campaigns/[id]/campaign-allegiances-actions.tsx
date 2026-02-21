'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from 'sonner';
import Modal from "@/components/ui/modal"
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { 
  createCampaignAllegiance, 
  updateCampaignAllegiance, 
  deleteCampaignAllegiance 
} from "@/app/actions/campaigns/[id]/campaign-allegiances"
import { LuTrash2, LuPencil, LuCheck, LuX } from 'react-icons/lu'

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
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [editingAllegianceId, setEditingAllegianceId] = useState<string | null>(null)
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

  const handleAddAllegiance = () => {
    if (!newAllegianceName.trim()) {
      return
    }

    // Check for duplicates
    if (allegiances.some(a => a.allegiance_name.toLowerCase() === newAllegianceName.trim().toLowerCase())) {
      toast({
        variant: "destructive",
        description: "This allegiance already exists"
      })
      setNewAllegianceName('')
      return
    }

    createMutation.mutate(newAllegianceName.trim())
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

      setEditingAllegianceId(null)
      setEditAllegianceName('')
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

      // Keep editing mode on error so user can fix and retry
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Failed to update allegiance"
      })
    }
  })

  const handleSaveEdit = () => {
    if (!editingAllegianceId || !editAllegianceName.trim()) {
      toast({
        variant: "destructive",
        description: "Allegiance name cannot be empty"
      })
      return
    }

    // Check for duplicates (excluding the current allegiance being edited)
    if (allegiances.some(a => 
      a.id !== editingAllegianceId && 
      a.allegiance_name.toLowerCase() === editAllegianceName.trim().toLowerCase()
    )) {
      toast({
        variant: "destructive",
        description: "This allegiance already exists"
      })
      return
    }

    updateMutation.mutate({
      allegianceId: editingAllegianceId,
      allegianceName: editAllegianceName.trim()
    })
  }

  const handleCancelEdit = () => {
    setEditingAllegianceId(null)
    setEditAllegianceName('')
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

  const startEditing = (allegiance: Allegiance) => {
    setEditingAllegianceId(allegiance.id)
    setEditAllegianceName(allegiance.allegiance_name)
  }

  const openDeleteModal = (allegiance: Allegiance) => {
    setDeletingAllegiance(allegiance)
    setShowDeleteModal(true)
  }

  if (!canManage) {
    return null
  }

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
      {/* Add Allegiance Input */}
      <div className="flex space-x-2 mb-4">
        <Input
          type="text"
          value={newAllegianceName}
          onChange={(e) => setNewAllegianceName(e.target.value)}
          placeholder="Add an Allegiance (max 50 characters)"
          maxLength={50}
          className="flex-grow text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAddAllegiance()
            }
          }}
        />
        <Button
          onClick={handleAddAllegiance}
          type="button"
          disabled={!newAllegianceName.trim() || createMutation.isPending}
        >
          Add
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading allegiances...</div>
      ) : allegiances.length > 0 && (
        <div className="space-y-2">
          {allegiances.map((allegiance) => {
            const isEditing = editingAllegianceId === allegiance.id
            
            return (
              <div
                key={allegiance.id}
                className="flex items-center justify-between p-1 pl-4 border rounded-lg hover:bg-muted transition-colors"
              >
                {isEditing ? (
                  <>
                    <Input
                      value={editAllegianceName}
                      onChange={(e) => setEditAllegianceName(e.target.value)}
                      placeholder="Enter allegiance name (max 50 characters)"
                      maxLength={50}
                      className="flex-grow mr-2 h-7 text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleSaveEdit()
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          handleCancelEdit()
                        }
                      }}
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline_accept"
                        size="sm"
                        onClick={handleSaveEdit}
                        className="h-8 w-8 p-0"
                        title="Save"
                        disabled={!editAllegianceName.trim() || updateMutation.isPending}
                      >
                        <LuCheck className="size-4" />
                      </Button>
                      <Button
                        variant="outline_cancel"
                        size="sm"
                        onClick={handleCancelEdit}
                        className="h-8 w-8 p-0"
                        title="Cancel"
                        disabled={updateMutation.isPending}
                      >
                        <LuX className="size-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-sm" title={allegiance.allegiance_name}>
                      {allegiance.allegiance_name.length > 30 
                        ? `${allegiance.allegiance_name.substring(0, 30)}...` 
                        : allegiance.allegiance_name}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEditing(allegiance)}
                        className="h-8 w-8 p-0"
                        title="Edit allegiance"
                      >
                        <LuPencil className="size-4" />
                      </Button>
                      <Button
                        variant="outline_remove"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => openDeleteModal(allegiance)}
                        title="Delete allegiance"
                      >
                        <LuTrash2 className="size-4" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
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

