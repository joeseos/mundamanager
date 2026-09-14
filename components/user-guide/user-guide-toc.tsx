import type { UserGuideHeading } from '@/utils/user-guide-content';

interface TocNode extends UserGuideHeading {
  children: TocNode[];
}

/**
 * Nests a flat, document-ordered heading list by level. A heading becomes a
 * child of the nearest preceding heading with a smaller level; anything else
 * sits at the top.
 */
function buildTocTree(headings: UserGuideHeading[]): TocNode[] {
  const roots: TocNode[] = [];
  const stack: TocNode[] = [];

  for (const heading of headings) {
    const node: TocNode = { ...heading, children: [] };

    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }

    stack.push(node);
  }

  return roots;
}

function TocList({
  nodes,
  activeId,
  nested = false,
}: {
  nodes: TocNode[];
  activeId: string | null;
  nested?: boolean;
}) {
  return (
    <ul className={`list-disc marker:text-red-800 pl-5 ${nested ? 'mt-1 space-y-1' : 'space-y-1.5'}`}>
      {nodes.map((node) => {
        const isActive = node.id === activeId;
        return (
          <li key={node.id}>
            <a
              href={`#${node.id}`}
              aria-current={isActive ? 'location' : undefined}
              className={`underline hover:text-red-800 ${isActive ? 'text-red-800 font-medium' : ''}`}
            >
              {node.text}
            </a>
            {node.children.length > 0 && (
              <TocList nodes={node.children} activeId={activeId} nested />
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface UserGuideTocProps {
  headings: UserGuideHeading[];
  /** Heading currently in view (scroll-spy); highlighted in the list. */
  activeId?: string | null;
}

export function UserGuideToc({ headings, activeId = null }: UserGuideTocProps) {
  if (headings.length === 0) return null;

  return (
    <nav aria-label="Table of contents" className="text-sm">
      <h2 className="text-lg font-semibold text-foreground mb-2">Contents</h2>
      <TocList nodes={buildTocTree(headings)} activeId={activeId} />
    </nav>
  );
}
