'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/use-toast"
import Modal from "@/components/ui/modal"
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { 
  createCampaignResource, 
  updateCampaignResource, 
  deleteCampaignResource 
} from "@/app/actions/campaigns/[id]/campaign-resources"
import { LuTrash2, LuPencil, LuCheck, LuX } from 'react-icons/lu'

interface Resource {
  id: string;
  resource_name: string;
  is_custom: boolean;
}

interface CampaignResourcesActionsProps {
  campaignId: string;
  isCustomCampaign: boolean;
  canManage: boolean;
  initialResources?: Array<{ id: string; resource_name: string; is_custom: boolean }>;
  onResourcesChange?: () => void;
}

export default function CampaignResourcesActions({
  campaignId,
  isCustomCampaign,
  canManage,
  initialResources = [],
  onResourcesChange
}: CampaignResourcesActionsProps) {
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null)
  const [deletingResource, setDeletingResource] = useState<Resource | null>(null)
  const [newResourceName, setNewResourceName] = useState('')
  const [editResourceName, setEditResourceName] = useState('')
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // Fetch custom resources using TanStack Query with caching
  const { data: allResources = initialResources, isLoading } = useQuery({
    queryKey: ['campaign-resources', campaignId],
    queryFn: async () => {
      const response = await fetch(`/api/campaigns/${campaignId}/resources`)
      if (!response.ok) {
        throw new Error('Failed to fetch resources')
      }
      return response.json() as Promise<Array<{ id: string; resource_name: string; is_custom: boolean }>>
    },
    initialData: initialResources,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,  // 10 minutes
    enabled: canManage, // Only fetch if user can manage
  })

  // Filter to only show custom resources
  const resources = (allResources || []).filter((r: Resource) => r.is_custom)

  // Mutation for creating resource with optimistic update
  const createMutation = useMutation({
    mutationFn: async (resourceName: string) => {
      const result = await createCampaignResource({
        campaignId,
        resource_name: resourceName.trim()
      })
      if (!result.success) {
        throw new Error(result.error || 'Failed to create resource')
      }
      return result.data
    },
    onMutate: async (resourceName) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['campaign-resources', campaignId] })

      // Snapshot the previous value
      const previousResources = queryClient.getQueryData<Array<{ id: string; resource_name: string; is_custom: boolean }>>(['campaign-resources', campaignId])

      // Optimistically update with temporary ID
      const optimisticResource = {
        id: `temp-${Date.now()}`,
        resource_name: resourceName.trim(),
        is_custom: true
      }

      // Optimistically update the cache
      queryClient.setQueryData<Array<{ id: string; resource_name: string; is_custom: boolean }>>(
        ['campaign-resources', campaignId],
        (old = initialResources) => [...old, optimisticResource]
      )

      return { previousResources }
    },
    onSuccess: (data, _variables, context) => {
      // Update cache with real data from server
      queryClient.setQueryData<Array<{ id: string; resource_name: string; is_custom: boolean }>>(
        ['campaign-resources', campaignId],
        (old = initialResources) => {
          // Replace optimistic entry with real data
          const withoutTemp = old.filter(r => !r.id.startsWith('temp-'))
          // data is the Supabase row with id, campaign_id, resource_name
          // Transform to match our Resource interface
          if (data && 'id' in data && 'resource_name' in data) {
            const newResource = {
              id: data.id as string,
              resource_name: data.resource_name as string,
              is_custom: true
            }
            return [...withoutTemp, newResource]
          }
          return withoutTemp
        }
      )

      toast({
        description: "Resource created successfully"
      })

      setNewResourceName('')
      // Notify parent to refresh resource lists
      onResourcesChange?.()
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousResources) {
        queryClient.setQueryData(['campaign-resources', campaignId], context.previousResources)
      }

      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Failed to create resource"
      })
    }
  })

  const handleAddResource = () => {
    if (!newResourceName.trim()) {
      return
    }

    // Check for duplicates
    if (resources.some(r => r.resource_name.toLowerCase() === newResourceName.trim().toLowerCase())) {
      toast({
        variant: "destructive",
        description: "This resource already exists"
      })
      setNewResourceName('')
      return
    }

    createMutation.mutate(newResourceName.trim())
  }

  // Mutation for updating resource with optimistic update
  const updateMutation = useMutation({
    mutationFn: async ({ resourceId, resourceName }: { resourceId: string; resourceName: string }) => {
      const result = await updateCampaignResource({
        campaignId,
        resourceId,
        resource_name: resourceName.trim()
      })
      if (!result.success) {
        throw new Error(result.error || 'Failed to update resource')
      }
      return result.data
    },
    onMutate: async ({ resourceId, resourceName }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['campaign-resources', campaignId] })

      // Snapshot the previous value
      const previousResources = queryClient.getQueryData<Array<{ id: string; resource_name: string; is_custom: boolean }>>(['campaign-resources', campaignId])

      // Optimistically update the cache
      queryClient.setQueryData<Array<{ id: string; resource_name: string; is_custom: boolean }>>(
        ['campaign-resources', campaignId],
        (old = initialResources) => old.map(r => 
          r.id === resourceId 
            ? { ...r, resource_name: resourceName.trim() }
            : r
        )
      )

      return { previousResources }
    },
    onSuccess: () => {
      // Invalidate to refetch fresh data
      queryClient.invalidateQueries({ queryKey: ['campaign-resources', campaignId] })

      toast({
        description: "Resource updated successfully"
      })

      setEditingResourceId(null)
      setEditResourceName('')
      // Notify parent to refresh resource lists
      onResourcesChange?.()
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousResources) {
        queryClient.setQueryData(['campaign-resources', campaignId], context.previousResources)
      }

      // Keep editing mode on error so user can fix and retry
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Failed to update resource"
      })
    }
  })

  const handleSaveEdit = () => {
    if (!editingResourceId || !editResourceName.trim()) {
      toast({
        variant: "destructive",
        description: "Resource name cannot be empty"
      })
      return
    }

    // Check for duplicates (excluding the current resource being edited)
    if (resources.some(r => 
      r.id !== editingResourceId && 
      r.resource_name.toLowerCase() === editResourceName.trim().toLowerCase()
    )) {
      toast({
        variant: "destructive",
        description: "This resource already exists"
      })
      return
    }

    updateMutation.mutate({
      resourceId: editingResourceId,
      resourceName: editResourceName.trim()
    })
  }

  const handleCancelEdit = () => {
    setEditingResourceId(null)
    setEditResourceName('')
  }

  // Mutation for deleting resource with optimistic update
  const deleteMutation = useMutation({
    mutationFn: async (resourceId: string) => {
      const result = await deleteCampaignResource({
        campaignId,
        resourceId
      })
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete resource')
      }
      return result
    },
    onMutate: async (resourceId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['campaign-resources', campaignId] })

      // Snapshot the previous value
      const previousResources = queryClient.getQueryData<Array<{ id: string; resource_name: string; is_custom: boolean }>>(['campaign-resources', campaignId])

      // Optimistically update the cache
      queryClient.setQueryData<Array<{ id: string; resource_name: string; is_custom: boolean }>>(
        ['campaign-resources', campaignId],
        (old = initialResources) => old.filter(r => r.id !== resourceId)
      )

      return { previousResources }
    },
    onSuccess: () => {
      // Invalidate to refetch fresh data
      queryClient.invalidateQueries({ queryKey: ['campaign-resources', campaignId] })

      toast({
        description: "Resource deleted successfully"
      })

      setDeletingResource(null)
      setShowDeleteModal(false)
      // Notify parent to refresh resource lists
      onResourcesChange?.()
    },
    onError: (error, resourceId, context) => {
      // Rollback on error
      if (context?.previousResources) {
        queryClient.setQueryData(['campaign-resources', campaignId], context.previousResources)
      }

      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Failed to delete resource"
      })
    }
  })

  const handleDelete = async () => {
    if (!deletingResource) return false

    deleteMutation.mutate(deletingResource.id)
    return true
  }

  const startEditing = (resource: Resource) => {
    setEditingResourceId(resource.id)
    setEditResourceName(resource.resource_name)
  }

  const openDeleteModal = (resource: Resource) => {
    setDeletingResource(resource)
    setShowDeleteModal(true)
  }

  if (!canManage) {
    return null
  }

  const deleteModalContent = deletingResource ? (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Are you sure you want to delete the resource <strong>{deletingResource.resource_name}</strong>?
        <span className="block mt-2 text-amber-600">
          This action cannot be undone. Any gang resource quantities for this resource will be permanently deleted.
        </span>
      </p>
    </div>
  ) : null

  return (
    <div>
      {/* Add Resource Input */}
      <div className="flex space-x-2 mb-4">
        <Input
          type="text"
          value={newResourceName}
          onChange={(e) => setNewResourceName(e.target.value)}
          placeholder="Add a Resource (max 50 characters)"
          maxLength={50}
          className="flex-grow text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAddResource()
            }
          }}
        />
        <Button
          onClick={handleAddResource}
          type="button"
          disabled={!newResourceName.trim() || createMutation.isPending}
        >
          Add
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading resources...</div>
      ) : resources.length > 0 && (
        <div className="space-y-2">
          {resources.map((resource) => {
            const isEditing = editingResourceId === resource.id
            
            return (
              <div
                key={resource.id}
                className="flex items-center justify-between p-1 pl-4 border rounded-lg hover:bg-muted transition-colors"
              >
                {isEditing ? (
                  <>
                    <Input
                      value={editResourceName}
                      onChange={(e) => setEditResourceName(e.target.value)}
                      placeholder="Enter resource name (max 50 characters)"
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
                        disabled={!editResourceName.trim() || updateMutation.isPending}
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
                    <span className="text-sm" title={resource.resource_name}>
                      {resource.resource_name.length > 30 
                        ? `${resource.resource_name.substring(0, 30)}...` 
                        : resource.resource_name}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEditing(resource)}
                        className="h-8 w-8 p-0"
                        title="Edit resource"
                      >
                        <LuPencil className="size-4" />
                      </Button>
                      <Button
                        variant="outline_remove"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => openDeleteModal(resource)}
                        title="Delete resource"
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

      {showDeleteModal && deletingResource && (
        <Modal
          title="Delete Custom Resource"
          content={deleteModalContent}
          onClose={() => {
            setShowDeleteModal(false)
            setDeletingResource(null)
          }}
          onConfirm={handleDelete}
          confirmText="Delete"
          confirmDisabled={deleteMutation.isPending}
        />
      )}
    </div>
  )
}
