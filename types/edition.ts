// Row shape of the public.editions table. Edition *behaviour* — which ruleset
// has which features — lives in utils/edition.ts.
export interface Edition {
  id: string;
  name: string;
  slug: string;
  is_current: boolean;
  released_at: string | null;
}
