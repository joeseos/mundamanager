import { BreadcrumbBar } from "@/components/breadcrumb-bar"
import { forumCategoryPath, getForumThread, parseForumThreadNumber } from "@/app/lib/forum"

export default async function ForumThreadBreadcrumb({
  params
}: {
  params: Promise<{ category: string; thread: string }>
}) {
  const { thread: segment } = await params
  const number = parseForumThreadNumber(segment)

  // Reads the page's cached entry
  const thread = number === null ? null : await getForumThread(number).catch(() => null)

  return (
    <BreadcrumbBar
      items={[
        { label: "Forum", href: "/forum" },
        ...(thread ? [{ label: thread.category.name, href: forumCategoryPath(thread.category.slug) }] : []),
        { label: thread?.title || "Thread" },
      ]}
    />
  )
}
