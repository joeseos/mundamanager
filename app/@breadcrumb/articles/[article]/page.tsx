import { BreadcrumbBar } from "@/components/breadcrumb-bar"
import { getForumArticle, parseForumThreadNumber } from "@/app/lib/forum"

export default async function ArticleBreadcrumb({
  params
}: {
  params: Promise<{ article: string }>
}) {
  const { article: segment } = await params
  const number = parseForumThreadNumber(segment)

  // Reads the page's cached entry
  const article = number === null ? null : await getForumArticle(number).catch(() => null)

  return (
    <BreadcrumbBar
      items={[
        { label: "Articles", href: "/articles" },
        { label: article?.title || "Article" },
      ]}
    />
  )
}
