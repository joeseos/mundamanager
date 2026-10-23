import { BreadcrumbBar } from "@/components/breadcrumb-bar"
import { getPublishedArticle } from "@/app/lib/articles"

export default async function ArticleBreadcrumb({
  params
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // Reads the article page's cached entry
  const article = await getPublishedArticle(slug).catch(() => null)

  return (
    <BreadcrumbBar
      items={[
        { label: 'Articles', href: '/articles' },
        { label: article?.title || 'Article' },
      ]}
    />
  )
}
