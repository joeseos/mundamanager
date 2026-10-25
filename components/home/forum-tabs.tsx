"use client"

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ForumArticle, ForumCategory } from '@/app/lib/forum'
import { ForumArticleCard } from '@/components/forum/forum-article-card'
import { ForumCategoryList } from '@/components/forum/forum-category-list'

// Fetched the first time the tab opens, then kept while the home page is open
function useForumData<T>(url: string) {
  return useQuery<T[]>({
    queryKey: [url],
    queryFn: async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch ${url}`);
      return response.json();
    },
    staleTime: 60 * 1000,
  });
}

function ForumTabSection({ title, href, linkText, children }: { title: string; href: string; linkText: string; children: ReactNode }) {
  return (
    <div className="bg-card shadow-md rounded-lg p-4">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-xl md:text-2xl font-bold">{title}</h2>
        <Link href={href} prefetch={false} className="text-sm text-muted-foreground hover:text-foreground">
          {linkText}
        </Link>
      </div>
      {children}
    </div>
  );
}

const muted = (text: string) => <p className="text-muted-foreground italic">{text}</p>;

export function ArticlesTab() {
  const { data: articles, isError } = useForumData<ForumArticle>('/api/forum/articles');
  let content = muted('Loading...');
  if (isError) content = muted('Failed to load the articles.');
  else if (articles?.length === 0) content = muted('No articles yet.');
  else if (articles) {
    content = (
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {articles.map((article) => (
          <ForumArticleCard key={article.number} article={article} />
        ))}
      </div>
    );
  }
  return (
    <ForumTabSection title="Articles" href="/articles" linkText="All articles">
      {content}
    </ForumTabSection>
  );
}

export function ForumTab() {
  const { data: categories, isError } = useForumData<ForumCategory>('/api/forum/categories');
  let content = muted('Loading...');
  if (isError) content = muted('Failed to load the forum.');
  else if (categories) content = <ForumCategoryList categories={categories} />;
  return (
    <ForumTabSection title="Forum" href="/forum" linkText="Visit the forum">
      {content}
    </ForumTabSection>
  );
}
