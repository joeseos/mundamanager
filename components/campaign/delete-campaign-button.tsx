'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import Modal from "@/components/modal"
import { createClient } from "@/utils/supabase/client"

interface DeleteCampaignButtonProps {
  campaignId: string;
}

export default function DeleteCampaignButton({ campaignId }: DeleteCampaignButtonProps) {
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      // First check if user is OWNER
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: memberRole } = await supabase
        .from('campaign_members')
        .select('role')
        .eq('campaign_id', campaignId)
        .eq('user_id', user.id)
        .single()

      if (memberRole?.role !== 'OWNER') {
        throw new Error('Only the campaign owner can delete the campaign')
      }

      // Delete campaign and all related data
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', campaignId)

      if (error) throw error

      toast({
        description: "Campaign deleted successfully"
      })

      // Redirect to campaigns list
      router.push('/campaigns')
      router.refresh()

    } catch (error) {
      console.error('Error deleting campaign:', error)
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Failed to delete campaign"
      })
      return false
    } finally {
      setIsDeleting(false)
    }
    return true
  }

  return (
    <>
      <Button
        variant="destructive"
        onClick={() => setShowDeleteModal(true)}
        className="w-full"
        disabled={isDeleting}
      >
        {isDeleting ? "Deleting..." : "Delete Campaign"}
      </Button>

      {showDeleteModal && (
        <Modal
          title="Delete Campaign"
          content={
            <div>
              <p>Are you sure you want to delete this campaign?</p>
              <br />
              <p>This action cannot be undone and will remove all campaign data including territories, members, and gang assignments.</p>
            </div>
          }
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleDelete}
          confirmText="Delete Campaign"
          confirmDisabled={isDeleting}
        />
      )}
    </>
  )
} 