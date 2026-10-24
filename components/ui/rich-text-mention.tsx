'use client';

import { forwardRef, useImperativeHandle, useState } from 'react';
import { ReactRenderer } from '@tiptap/react';
import Mention from '@tiptap/extension-mention';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { SEARCH_DEBOUNCE_MS, searchUsers, type UserSearchResult } from '@/components/shared/user-search-bar';

type MentionListProps = SuggestionProps<UserSearchResult, { id: string; label: string }>;

interface MentionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const MentionList = forwardRef<MentionListHandle, MentionListProps>(function MentionList({ items, command }, ref) {
  const [selected, setSelected] = useState(0);
  const [prevItems, setPrevItems] = useState(items);
  if (items !== prevItems) {
    setPrevItems(items);
    setSelected(0);
  }

  const pick = (index: number) => {
    const user = items[index];
    if (user) command({ id: user.id, label: user.username });
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (!items.length) return false;
      if (event.key === 'ArrowUp') setSelected((selected + items.length - 1) % items.length);
      else if (event.key === 'ArrowDown') setSelected((selected + 1) % items.length);
      else if (event.key === 'Enter' || event.key === 'Tab') pick(selected);
      else return false;
      return true;
    },
  }));

  if (!items.length) return null;
  return (
    <ul className="bg-card rounded-md border shadow-lg py-1 min-w-[160px]">
      {items.map((user, index) => (
        <li key={user.id}>
          <button
            type="button"
            // Keeps focus in the editor, so the suggestion stays open until the click lands
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(index)}
            className={`w-full px-3 py-1.5 text-left text-sm ${index === selected ? 'bg-muted' : 'hover:bg-muted'}`}
          >
            {user.username}
          </button>
        </li>
      ))}
    </ul>
  );
});

/**
 * @mentions of users, saved as a link to their profile that carries the user id
 * (data-id), so the server can notify them and a rename doesn't break it.
 */
export const UserMention = Mention.extend({
  parseHTML() {
    // Above Link, which would otherwise take the <a> as a plain link
    return [{ tag: 'a[data-type="mention"]', priority: 1000 }];
  },
}).configure({
  renderHTML({ options, node }) {
    return ['a', { ...options.HTMLAttributes, href: `/user/${node.attrs.id}`, class: 'text-blue-600' }, `@${node.attrs.label}`];
  },
  suggestion: {
    debounce: SEARCH_DEBOUNCE_MS,
    // The search needs two characters
    items: ({ query, signal }) => (query.length < 2 ? [] : searchUsers(query, signal)),
    render: () => {
      let list: ReactRenderer<MentionListHandle, MentionListProps> | null = null;

      const place = (props: MentionListProps) => {
        const rect = props.clientRect?.();
        if (!list || !rect) return;
        Object.assign(list.element.style, {
          position: 'fixed',
          left: `${rect.left}px`,
          top: `${rect.bottom + 4}px`,
          // Above the editor toolbar (z-[70])
          zIndex: '80',
        });
      };

      const close = () => {
        list?.element.remove();
        list?.destroy();
        list = null;
      };

      return {
        onStart: (props) => {
          list = new ReactRenderer(MentionList, { props, editor: props.editor });
          document.body.appendChild(list.element);
          place(props);
        },
        onUpdate: (props) => {
          list?.updateProps(props);
          place(props);
        },
        onKeyDown: ({ event }: SuggestionKeyDownProps) => {
          if (event.key === 'Escape') {
            close();
            return true;
          }
          return list?.ref?.onKeyDown(event) ?? false;
        },
        onExit: close,
      };
    },
  },
});
