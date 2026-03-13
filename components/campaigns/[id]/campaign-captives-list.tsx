'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { GiHandcuffs } from 'react-icons/gi'

interface HoldingGang {
  gangId: string
  gangName: string
  captives: Array<{
    fighterId: string
    fighterName: string
    fighterType?: string
    originalGangName: string
  }>
}

interface CampaignCaptivesListProps {
  captives: HoldingGang[]
}

export default function CampaignCaptivesList({ captives }: CampaignCaptivesListProps) {
  if (!captives || captives.length === 0) {
    return (
      <p className="text-muted-foreground italic text-sm">
        No fighters are currently held captive by gangs in this campaign.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {captives.map(({ gangId, gangName, captives: captiveList }) => (
        <div key={gangId} className="border rounded-lg p-3 bg-muted/30">
          <div className="flex items-center gap-2 mb-2">
            <Link
              href={`/gang/${gangId}`}
              className="font-semibold hover:underline text-foreground"
              prefetch={false}
            >
              {gangName}
            </Link>
            <span className="text-sm text-muted-foreground">
              holds {captiveList.length} captive{captiveList.length !== 1 ? 's' : ''}:
            </span>
          </div>
          <ul className="flex flex-wrap items-center gap-1.5">
            <GiHandcuffs className="h-4 w-4 shrink-0 text-red-500" />
            {captiveList.map((c) => (
              <li key={c.fighterId}>
                <Link
                  href={`/fighter/${c.fighterId}`}
                  prefetch={false}
                  className="inline-flex"
                >
                  <Badge variant="outline" className="hover:bg-muted font-normal">
                    {c.fighterName}
                    {c.fighterType && (
                      <span className="ml-1 text-muted-foreground">- {c.fighterType}</span>
                    )}
                    <span className="ml-1 text-muted-foreground">({c.originalGangName})</span>
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
