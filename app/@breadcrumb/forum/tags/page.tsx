import { BreadcrumbBar } from "@/components/breadcrumb-bar"

export default function ForumTagsBreadcrumb() {
  return (
    <BreadcrumbBar
      items={[
        { label: "Forum", href: "/forum" },
        { label: "Tags" },
      ]}
    />
  )
}
