"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useGangs } from '@/contexts/GangsContext'
import { createClient } from "@/utils/supabase/client";

type GangType = {
  gang_type_id: string;
  gang_type: string;
  alignment: string;
};

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

export default function CreateGang() {
  const { refreshGangs } = useGangs();
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
          // Sort the gang types alphabetically by gang_type
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

        // Reset form after successful creation
        setGangName("")
        setGangType("")
        // Refresh the gangs list
        await refreshGangs()
      } catch (err) {
        console.error('Error creating gang:', err)
        setError('Failed to create gang. Please try again.')
      } finally {
        setIsLoading(false)
      }
    }
  }

  return (
    <div className="bg-white shadow-md rounded-lg p-4 md:p-6">
      <h2 className="text-2xl font-bold mb-4">Create a New Gang</h2>
      <div className="space-y-4">
        <div>
          <label htmlFor="gang-name" className="block text-sm font-medium text-gray-700 mb-1">
            Gang Name
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
            Gang Type
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
        <Button onClick={handleCreateGang} className="w-full" disabled={isLoading}>
          {isLoading ? 'Creating...' : 'Save Gang'}
        </Button>
      </div>
    </div>
  )
}
