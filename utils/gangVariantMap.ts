// utils/gangVariantMap.ts

/**
 * Maps gang variant IDs to their modifier logic when fetching fighter types.
 * Each variant can point to an alternate gang_type_id to fetch fighters from,
 * and apply transformations like removing Leaders from the base list.
 */

export interface GangVariantModifier {
  variantGangTypeId: string;
  removeLeaders?: boolean;
}

export const gangVariantFighterModifiers: Record<string, GangVariantModifier> =
  {
    '2c67ccbc-e103-433c-9535-bc6f9435fa38': {
      variantGangTypeId: 'ccd90329-b009-4277-93fa-749949211e7f',
    },
    'd66feb66-7a3b-4306-9d0b-58725b72ee0d': {
      variantGangTypeId: 'bedb8343-25c3-466d-8ed1-e060f71688d1',
    },
    'ad325025-d293-4078-b14b-4306be45f1c8': {
      variantGangTypeId: '4b476889-37ec-41ea-865e-95119665dadd',
    },
    'de141ade-f974-4b75-9a43-f775cccc6e36': {
      variantGangTypeId: 'd606d8a4-2971-426b-93d4-92d91d51381b',
      removeLeaders: true,
    },
  };
