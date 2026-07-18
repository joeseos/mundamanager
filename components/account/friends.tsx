'use client'

import { useState, useCallback } from 'react'
import { Badge } from "@/components/ui/badge"
import { toast } from 'sonner';
import Modal from '@/components/ui/modal'
import { deleteFriend, sendFriendRequest } from '@/app/actions/friends'
import { HiX } from "react-icons/hi";
import { useRouter } from 'next/navigation'
import UserSearchBar, { type UserSearchResult } from '@/components/shared/user-search-bar'

interface Friend {
  id: string;
  username: string;
  profile: {
    id: string;
    username: string;
    updated_at: string;
    user_role?: string;
  };
  status: string;
  direction: string;
}

interface FriendsSearchBarProps {
  userId: string;
  initialFriends: Friend[];
  onFriendAdd?: (friend: Friend) => void;
  disabled?: boolean;
}

export default function FriendsSearchBar({
  userId,
  initialFriends,
  onFriendAdd,
  disabled = false
}: FriendsSearchBarProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [friendToDelete, setFriendToDelete] = useState<Friend | null>(null)
  const router = useRouter()
  const [localFriends, setLocalFriends] = useState(initialFriends);
  const [prevFriends, setPrevFriends] = useState(initialFriends);
  if (initialFriends !== prevFriends) {
    setPrevFriends(initialFriends);
    setLocalFriends(initialFriends);
  }

  const handleAddFriend = async (user: UserSearchResult) => {
    setIsAdding(true)
    try {
      const result = await sendFriendRequest(userId, user.id);

      if (!result.success) {
        toast.error(`A friend request already exists or you are already friends with ${user.username}`);
        setIsAdding(false);
        return;
      }

      const friend: Friend = {
        id: user.id,
        username: user.username,
        profile: {
          id: user.id,
          username: user.username,
          updated_at: new Date().toISOString()
        },
        status: 'pending',
        direction: 'outgoing',
      };

      setLocalFriends(prev => {
        if (prev.some(f => f.id === friend.id)) return prev;
        return [...prev, friend];
      });

      if (onFriendAdd) {
        onFriendAdd(friend);
      }

      toast(`Friend request sent to ${user.username}`);
    } catch (error) {
      console.error('Error adding friend:', error);
      toast.error("Failed to send friend request");
    } finally {
      setIsAdding(false)
    }
  };

  const handleDeleteFriend = async () => {
    if (!friendToDelete) return false;
    const previousFriends = localFriends;
    setLocalFriends(prev => prev.filter(f => f.id !== friendToDelete.id));
    try {
      await deleteFriend(userId, friendToDelete.id);
      toast(`Removed ${friendToDelete.username} from your friends.`);
      setFriendToDelete(null);
      return true;
    } catch (error) {
      toast.error('Failed to remove friend.');
      setLocalFriends(previousFriends);
      setFriendToDelete(null);
      return false;
    }
  };

  // Split friends into accepted and pending (incoming/outgoing)
  const acceptedFriends = localFriends.filter(f => f.status === 'accepted');
  const pendingIncoming = localFriends.filter(f => f.status === 'pending' && f.direction === 'incoming');
  const pendingOutgoing = localFriends.filter(f => f.status === 'pending' && f.direction === 'outgoing');

  // Use programmatic navigation to avoid Link prefetching
  const handleUserClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>, userId: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    router.push(`/user/${userId}`);
  }, [router]);

  return (
    <div className="relative mb-4">
      {/* Accepted Friends List */}
      {acceptedFriends.length > 0 && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-2">
            {acceptedFriends.map(friend => (
              <Badge key={friend.id} variant="secondary" className="flex items-center gap-1">
                <a href={`/user/${friend.id}`} className="hover:underline" onClick={(e) => handleUserClick(e, friend.id)}>
                  {friend.username}
                </a>
                <button
                  className="ml-1 text-gray-500 hover:text-red-500"
                  onClick={() => setFriendToDelete(friend)}
                  aria-label={`Remove ${friend.username}`}
                >
                  <HiX size={14} />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}
      {/* Pending Incoming Requests */}
      {pendingIncoming.length > 0 && (
        <div className="mb-2">
          <div className="flex flex-wrap gap-2">
            {pendingIncoming.map(friend => (
              <Badge key={friend.id} variant="outline" className="bg-yellow-50 border-yellow-200 text-yellow-800 flex items-center gap-1">
                <a href={`/user/${friend.id}`} className="hover:underline" onClick={(e) => handleUserClick(e, friend.id)}>
                  {friend.username}
                </a> <span className="text-xs text-yellow-600">(pending)</span>
              </Badge>
            ))}
          </div>
        </div>
      )}
      {/* Pending Outgoing Requests */}
      {pendingOutgoing.length > 0 && (
        <div className="mb-2">
          <div className="flex flex-wrap gap-2">
            {pendingOutgoing.map(friend => (
              <Badge key={friend.id} variant="outline" className="flex items-center gap-1">
                <a href={`/user/${friend.id}`} className="hover:underline" onClick={(e) => handleUserClick(e, friend.id)}>
                  {friend.username}
                </a> <span className="text-xs text-muted-foreground">(pending)</span>
                <button
                  className="ml-1 text-gray-500 hover:text-red-500"
                  onClick={() => setFriendToDelete(friend)}
                  aria-label={`Abort friend request to ${friend.username}`}
                >
                  <HiX size={14} />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}
      <UserSearchBar
        placeholder="Search for users to add as friends"
        onSelect={handleAddFriend}
        disabled={disabled || isAdding}
        excludeIds={[userId, ...localFriends.map((f) => f.id)]}
      />
      {/* Delete Friend Confirmation Modal */}
      {friendToDelete && (
        <Modal
          title="Remove Friend"
          content={<p>Are you sure you want to remove {friendToDelete.username} from your friends?</p>}
          onClose={() => setFriendToDelete(null)}
          onConfirm={handleDeleteFriend}
          confirmText="Remove"
        />
      )}
    </div>
  )
}
