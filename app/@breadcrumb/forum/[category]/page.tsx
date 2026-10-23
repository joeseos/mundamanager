import { BreadcrumbBar } from "@/components/breadcrumb-bar"
import { getForumCategory } from "@/app/lib/forum"

export default async function ForumCategoryBreadcrumb({
  params
}: {
  params: Promise<{ category: string }>
}) {
  const { category: slug } = await params

  // Reads the page's cached entry
  const category = await getForumCategory(slug).catch(() => null)

  return (
    <BreadcrumbBar
      items={[
        { label: "Forum", href: "/forum" },
        { label: category?.name || "Category" },
      ]}
    />
  )
}
