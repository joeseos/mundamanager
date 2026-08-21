export const N23_TRADING_POST_TYPE_ID = 'cada4005-66e3-4e3c-8a77-146329bd1eda';
export const N26_TRADING_POST_TYPE_ID = '875c877f-ec67-444c-be04-99e9d09297df';

/**
 * @param {string | undefined} editionSlug
 * @param {string | null} editionId
 * @returns {{ edition_id: string | null; trading_post_type_id: string }}
 */
export function getCustomGangTypeEditionFields(editionSlug, editionId) {
  return {
    edition_id: editionId,
    trading_post_type_id:
      editionSlug === 'n26' ? N26_TRADING_POST_TYPE_ID : N23_TRADING_POST_TYPE_ID,
  };
}
