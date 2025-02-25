"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useGangs } from '@/contexts/GangsContext'
import { createClient } from "@/utils/supabase/client"
import { SubmitButton } from "./submit-button"
import { useToast } from "@/components/ui/use-toast"

type GangType = {
  gang_type_id: string;
  gang_type: string;
  alignment: string;
};

interface CreateGangModalProps {
  onClose: () => void;
}

const FETCH_GANG_TYPES_QUERY = `
  query FetchGangTypes {
    gang_typesCollection {
      edges {
        node {
          gang_type_id
          gang_type
          alignment
        }
      }
    }
  }
`;

const CREATE_GANG_MUTATION = `
  mutation CreateGang($input: gangs_insert_input!) {
    insertIntogangsCollection(objects: [$input]) {
      records {
        id
        name
        credits
        reputation
        user_id
        gang_type_id
        gang_type
      }
    }
  }
`;

export default function CreateGangModal({ onClose }: CreateGangModalProps) {
  const { refreshGangs } = useGangs();
  const { toast } = useToast();
  const [gangTypes, setGangTypes] = useState<GangType[]>([]);
  const [gangName, setGangName] = useState("")
  const [gangType, setGangType] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchGangTypes = async () => {
      if (gangTypes.length === 0) {
        try {
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/graphql/v1`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
              },
              body: JSON.stringify({
                query: FETCH_GANG_TYPES_QUERY,
              }),
            }
          );

          if (!response.ok) {
            throw new Error('Failed to fetch gang types');
          }

          const { data, errors } = await response.json();

          if (errors) {
            throw new Error(errors[0].message);
          }

          const fetchedGangTypes = data.gang_typesCollection.edges.map((edge: any) => edge.node);
          const sortedGangTypes = fetchedGangTypes.sort((a: GangType, b: GangType) => 
            a.gang_type.localeCompare(b.gang_type)
          );
          setGangTypes(sortedGangTypes);
        } catch (err) {
          console.error('Error fetching gang types:', err);
          setError('Failed to load gang types. Please try again.');
        }
      }
    };

    fetchGangTypes();
  }, [gangTypes]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        const activeElement = document.activeElement;
        
        // If we're in an input field and the form isn't valid, let the default behavior happen
        if ((activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') 
            && (!gangName.trim() || !gangType || isLoading)) {
          return;
        }
        
        event.preventDefault();
        // If form is valid, create the gang
        if (gangName.trim() && gangType && !isLoading) {
          handleCreateGang();
        }
      } else if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, gangName, gangType, isLoading]);

  const handleCreateGang = async () => {
    if (gangName && gangType) {
      setIsLoading(true)
      setError(null)
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        const { data: { session } } = await supabase.auth.getSession();

        if (!user) {
          throw new Error('User not authenticated');
        }

        const selectedGangType = gangTypes.find(type => type.gang_type_id === gangType);
        if (!selectedGangType) {
          throw new Error('Invalid gang type selected');
        }

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/graphql/v1`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
              'Authorization': `Bearer ${session?.access_token}`
            },
            body: JSON.stringify({
              query: CREATE_GANG_MUTATION,
              variables: {
                input: {
                  name: gangName,
                  credits: "1000",
                  reputation: "1",
                  user_id: user.id,
                  gang_type_id: gangType,
                  gang_type: selectedGangType.gang_type,
                  alignment: selectedGangType.alignment
                }
              }
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.text();
          console.error('Response not OK:', errorData);
          throw new Error('Failed to create gang');
        }

        const { data, errors } = await response.json();

        if (errors) {
          console.error('GraphQL Errors:', errors);
          throw new Error(errors[0].message);
        }

        console.log('Gang created successfully:', data);

        toast({
          title: "Success!",
          description: `${gangName} has been created successfully.`,
        })

        // Reset form after successful creation
        setGangName("")
        setGangType("")
        // Refresh the gangs list
        await refreshGangs()
        onClose()
      } catch (err) {
        console.error('Error creating gang:', err)
        setError('Failed to create gang. Please try again.')
        toast({
          title: "Error",
          description: "Failed to create gang. Please try again.",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={handleOverlayClick}
    >
      <div className="bg-white shadow-md rounded-lg p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold">Create a New Gang</h2>
            <p className="text-sm text-gray-500">Fields marked with * are required.</p>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ×
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label htmlFor="gang-name" className="block text-sm font-medium text-gray-700 mb-1">
              Gang Name *
            </label>
            <Input
              id="gang-name"
              type="text"
              placeholder="Enter gang name"
              value={gangName}
              onChange={(e) => setGangName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="gang-type" className="block text-sm font-medium text-gray-700 mb-1">
              Gang Type *
            </label>
            <select
              id="gang-type"
              value={gangType}
              onChange={(e) => setGangType(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select gang type</option>
              {gangTypes.map((type) => (
                <option key={type.gang_type_id} value={type.gang_type_id}>
                  {type.gang_type}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <SubmitButton 
            onClick={handleCreateGang} 
            className="w-full" 
            disabled={isLoading || !gangName.trim() || !gangType}
            pendingText="Creating..."
          >
            Create Gang
          </SubmitButton>
        </div>
      </div>
    </div>
  )
} 