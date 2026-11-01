'use client';

import { forwardRef, useImperativeHandle, useState } from 'react';
import { ReactRenderer } from '@tiptap/react';
import Mention from '@tiptap/extension-mention';
import type { SuggestionProps } from '@tiptap/suggestion';
import { SEARCH_DEBOUNCE_MS, searchUsers, type UserSearchResult } from '@/components/shared/user-search-bar';

type MentionListProps = SuggestionProps<UserSearchResult, { id: string; label: string }>;

interface MentionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const MentionList = forwardRef<MentionListHandle, MentionListProps>(function MentionList(
  { items: latestItems, loading, command },
  ref,
) {
  const [selected, setSelected] = useState(0);
  // Keeps the last results while the next ones load, instead of closing the list on each keystroke
  const [items, setItems] = useState(latestItems);
  if (!loading && latestItems !== items) {
    setItems(latestItems);
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
      else if (event.key === 'Enter') pick(selected);
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
    minQueryLength: 2,
    items: ({ query, signal }) => searchUsers(query, signal),
    render: () => {
      let list: ReactRenderer<MentionListHandle, MentionListProps> | null = null;
      let unmount: (() => void) | null = null;

      // The plugin closes the list on Escape and when the @ text goes, through onExit
      return {
        onStart: (props) => {
          list = new ReactRenderer(MentionList, { props, editor: props.editor });
          // Above the editor toolbar (z-[70])
          list.element.style.zIndex = '80';
          unmount = props.mount(list.element);
        },
        onUpdate: (props) => list?.updateProps(props),
        onKeyDown: ({ event }) => list?.ref?.onKeyDown(event) ?? false,
        onExit: () => {
          unmount?.();
          list?.destroy();
        },
      };
    },
  },
});
