import { BreadcrumbBar } from "@/components/breadcrumb-bar"

export default function ForumModerationBreadcrumb() {
  return <BreadcrumbBar items={[{ label: "Forum", href: "/forum" }, { label: "Moderation" }]} />
}
