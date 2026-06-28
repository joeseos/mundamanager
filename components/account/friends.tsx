'use client'

import { useState, useEffect, useCallback } from 'react'
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { toast } from 'sonner';
import Modal from '@/components/ui/modal'
import { deleteFriend, sendFriendRequest } from '@/app/actions/friends'
import { HiX } from "react-icons/hi";
import { useRouter } from 'next/navigation'

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
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Friend[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [friendToDelete, setFriendToDelete] = useState<Friend | null>(null)
  const router = useRouter()
  const [localFriends, setLocalFriends] = useState(initialFriends);
  const [prevFriends, setPrevFriends] = useState(initialFriends);
  if (initialFriends !== prevFriends) {
    setPrevFriends(initialFriends);
    setLocalFriends(initialFriends);
  }

  // Search functionality
  useEffect(() => {
    const searchUsers = async () => {
      if (query.trim() === '') {
        setSearchResults([])
        return
      }

      setIsLoading(true)
      try {
        // Use the improved search API that prioritizes exact matches
        const response = await fetch(`/api/search-users?query=${encodeURIComponent(query)}`)
        
        if (!response.ok) {
          throw new Error('Failed to search users')
        }

        const profilesData = await response.json()

        // Filter out current user and transform to Friend type
        const transformedResults: Friend[] = (profilesData || [])
          .filter((profile: { id: string; username: string }) => profile.id !== userId)
          .map((profile: { id: string; username: string }) => ({
            id: profile.id,
            username: profile.username,
            profile: {
              id: profile.id,
              username: profile.username,
              updated_at: new Date().toISOString()
            },
            status: 'none', // default for search results
            direction: 'none',
          }));

        setSearchResults(transformedResults);
      } catch (error) {
        console.error('Error searching users:', error);
        setSearchResults([]);
      } finally {
        setIsLoading(false);
      }
    };

    const debounceTimer = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounceTimer);
  }, [query, userId]);

  const handleAddFriend = async (friend: Friend) => {
    setIsAdding(true)
    try {
      const result = await sendFriendRequest(userId, friend.id);

      if (!result.success) {
        toast.error(`A friend request already exists or you are already friends with ${friend.username}`);
        setIsAdding(false);
        return;
      }

      setLocalFriends(prev => {
        if (prev.some(f => f.id === friend.id)) return prev;
        return [...prev, { ...friend, status: 'pending', direction: 'outgoing' }];
      });

      if (onFriendAdd) {
        onFriendAdd(friend);
      }

      toast(`Friend request sent to ${friend.username}`);
      setQuery('');
      setSearchResults([]);
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
      <Input
        type="text"
        placeholder="Search for users to add as friends"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full"
        disabled={disabled || isAdding}
      />
      {isLoading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      )}
      {searchResults.length > 0 && query && (
        <div className="absolute mt-1 w-full bg-card rounded-lg border shadow-lg z-10">
          <ul className="py-2">
            {searchResults.map(friend => (
              <li key={friend.id}>
                <button
                  onClick={() => handleAddFriend(friend)}
                  className="w-full px-4 py-2 text-left hover:bg-muted"
                  disabled={isAdding}
                >
                  <span className="font-medium">{friend.username}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
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