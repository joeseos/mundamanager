import { MetadataRoute } from 'next'
import { getPublishedArticles } from '@/app/lib/articles'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://www.mundamanager.com'
  const articles = await getPublishedArticles()
  
  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/user-guide`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/articles`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...articles.map((article) => ({
      url: `${baseUrl}/articles/${article.slug}`,
      lastModified: new Date(article.updated_at ?? article.published_at),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    {
      url: `${baseUrl}/api-access`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/join-the-team`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    }
  ]
}
