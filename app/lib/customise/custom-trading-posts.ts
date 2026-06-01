import { createClient } from "@/utils/supabase/server";
import { CustomTradingPost } from "@/app/actions/customise/custom-trading-posts";

export async function getUserCustomTradingPosts(userId: string): Promise<CustomTradingPost[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('custom_trading_posts')
    .select('*')
    .eq('user_id', userId)
    .order('custom_trading_post_name', { ascending: true });

  if (error) {
    console.error('Error fetching custom trading posts:', error);
    throw new Error(`Failed to fetch custom trading posts: ${error.message}`);
  }

  return data || [];
}
