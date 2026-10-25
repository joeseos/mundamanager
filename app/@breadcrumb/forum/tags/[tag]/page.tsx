import { BreadcrumbBar } from "@/components/breadcrumb-bar"
import { getForumTag } from "@/app/lib/forum"

export default async function ForumTagBreadcrumb({
  params
}: {
  params: Promise<{ tag: string }>
}) {
  const { tag: slug } = await params

  // Reads the page's cached entry
  const tag = await getForumTag(slug).catch(() => null)

  return (
    <BreadcrumbBar
      items={[
        { label: "Forum", href: "/forum" },
        { label: "Tags", href: "/forum/tags" },
        { label: tag?.name || "Tag" },
      ]}
    />
  )
}
