"use client";

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Strike from '@tiptap/extension-strike';
import Blockquote from '@tiptap/extension-blockquote';
import Placeholder from '@tiptap/extension-placeholder';
import { Button } from '@/components/ui/button';
import {
  Italic, 
  Underline as UnderlineIcon, 
  Link as LinkIcon, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  AlignJustify,
  Heading1, 
  Heading2, 
  Heading3,
  Palette,
  Unlink,
  List,
  ListOrdered,
  Strikethrough
} from 'lucide-react';
import { BiSolidQuoteRight } from "react-icons/bi";
import { HiMiniBold } from "react-icons/hi2";
import { useState, useEffect, useRef } from 'react';
import '@/components/ui/rich-text-editor.css';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  charLimit?: number;
}

const colors = [
  { name: 'Default', value: 'inherit' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Gray', value: '#6b7280' },
  { name: 'Black', value: '#000000' },
  { name: 'Dark Red', value: '#dc2626' },
  { name: 'Dark Blue', value: '#1d4ed8' },
];

export function RichTextEditor({ content, onChange, placeholder, className, charLimit }: RichTextEditorProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [toolbarTop, setToolbarTop] = useState(90);
  const [scrollY, setScrollY] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [, forceUpdate] = useState({});
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline cursor-pointer',
        },
      }),
      TextStyle,
      Color,
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Strike,
      Blockquote,
      Placeholder.configure({
        placeholder: placeholder || 'Start typing...',
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // Only clean up if the content is effectively empty (just empty tags)
      const textContent = html.replace(/<[^>]*>/g, '').trim();
      if (textContent === '') {
        // If there's no text content, return empty string
        onChange('');
      } else {
        // If there is text content, pass the HTML as-is
        onChange(html);
      }
    },
    onSelectionUpdate: () => {
      // Force re-render when selection changes
      forceUpdate({});
    },
    onFocus: () => {
      // Force re-render when editor gains focus
      forceUpdate({});
    },
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-[200px] ProseMirror',
      },
    },
    immediatelyRender: false,
  });

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        setShowColorPicker(false);
      }
      if (linkInputRef.current && !linkInputRef.current.contains(event.target as Node)) {
        setShowLinkInput(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Detect mobile device and handle mobile-specific behavior
  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = window.innerWidth <= 768 || 
                            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(isMobileDevice);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // Handle mobile keyboard and viewport changes
  useEffect(() => {
    if (!isMobile) return;

    let initialViewportHeight = window.innerHeight;

    const handleVisualViewportChange = () => {
      if (window.visualViewport) {
        // Detect if keyboard is open
        const currentViewportHeight = window.visualViewport.height;
        const keyboardOpen = currentViewportHeight < initialViewportHeight * 0.8;
        setIsKeyboardOpen(keyboardOpen);

        if (keyboardOpen) {
          // Keyboard is open - use scroll-dependent positioning
          const baseTop = 90;
          const scrollOffset = Math.min(scrollY, baseTop); // Don't go below 0
          const viewportOffset = window.visualViewport.offsetTop;
          const newTop = Math.max(0, baseTop - scrollOffset + viewportOffset);
          setToolbarTop(newTop);
        } else {
          // Keyboard is closed - use default position
          setToolbarTop(90);
        }
      }
    };

    const handleScroll = () => {
      setScrollY(window.scrollY);
      
      // Only apply scroll offset if keyboard is open
      if (isKeyboardOpen && window.visualViewport) {
        const baseTop = 90;
        const scrollOffset = Math.min(window.scrollY, baseTop);
        const viewportOffset = window.visualViewport.offsetTop;
        const newTop = Math.max(0, baseTop - scrollOffset + viewportOffset);
        setToolbarTop(newTop);
      }
    };

    // Listen for visual viewport changes (keyboard open/close)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleVisualViewportChange);
      window.visualViewport.addEventListener('scroll', handleVisualViewportChange);
    }
    
    // Listen for page scroll
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewportChange);
        window.visualViewport.removeEventListener('scroll', handleVisualViewportChange);
      }
      window.removeEventListener('scroll', handleScroll);
    };
  }, [isMobile, scrollY, isKeyboardOpen]);

  if (!editor) {
    return null;
  }

  // Calculate character count from HTML content
  const getCharCount = (htmlContent: string) => {
    const textContent = htmlContent.replace(/<[^>]*>/g, '');
    return textContent.length;
  };

  const charCount = getCharCount(content);
  const isOverLimit = charLimit && charCount > charLimit;

  const addLink = () => {
    if (linkUrl) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
      setLinkUrl('');
      setShowLinkInput(false);
    }
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
  };

  const setColor = (color: string) => {
    editor.chain().focus().setColor(color).run();
    setShowColorPicker(false);
  };

  const MenuButton = ({ 
    onClick, 
    isActive = false, 
    children, 
    title 
  }: { 
    onClick: () => void; 
    isActive?: boolean; 
    children: React.ReactNode; 
    title: string;
  }) => (
    <Button
      variant={isActive ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      title={title}
      className="h-8 w-8 p-0"
    >
      {children}
    </Button>
  );

  return (
    <div className={`border rounded-md ${className}`} ref={editorRef}>
      {/* Toolbar */}
      <div className={`border-b p-2 flex flex-wrap gap-[3px] items-center bg-white z-[70] shadow-sm ${
        isMobile 
          ? 'fixed left-0 right-0 border-b-2 border-gray-200' 
          : 'sticky top-[90px]'
      }`} style={isMobile ? { 
        top: `${toolbarTop}px`,
        position: 'fixed'
      } : {}}>
        {/* Text formatting */}
        <MenuButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          title="Bold"
        >
          <HiMiniBold className="h-4 w-4" />
        </MenuButton>
        
        <MenuButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </MenuButton>
        
        <MenuButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive('underline')}
          title="Underline"
        >
          <UnderlineIcon className="h-4 w-4" />
        </MenuButton>
        
        <MenuButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive('strike')}
          title="Strikethrough"
        >
          <Strikethrough className="h-4 w-4" />
        </MenuButton>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Headings */}
        <MenuButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          <Heading1 className="h-4 w-4" />
        </MenuButton>
        
        <MenuButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          <Heading2 className="h-4 w-4" />
        </MenuButton>
        
        <MenuButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive('heading', { level: 3 })}
          title="Heading 3"
        >
          <Heading3 className="h-4 w-4" />
        </MenuButton>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Lists */}
        <MenuButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          title="Bullet List"
        >
          <List className="h-4 w-4" />
        </MenuButton>
        
        <MenuButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          title="Numbered List"
        >
          <ListOrdered className="h-4 w-4" />
        </MenuButton>
        
        <MenuButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive('blockquote')}
          title="Quote"
        >
          <BiSolidQuoteRight className="h-4 w-4" />
        </MenuButton>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Text alignment */}
        <MenuButton
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          isActive={editor.isActive({ textAlign: 'left' })}
          title="Align Left"
        >
          <AlignLeft className="h-4 w-4" />
        </MenuButton>
        
        <MenuButton
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          isActive={editor.isActive({ textAlign: 'center' })}
          title="Align Center"
        >
          <AlignCenter className="h-4 w-4" />
        </MenuButton>
        
        <MenuButton
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          isActive={editor.isActive({ textAlign: 'right' })}
          title="Align Right"
        >
          <AlignRight className="h-4 w-4" />
        </MenuButton>
        
        <MenuButton
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          isActive={editor.isActive({ textAlign: 'justify' })}
          title="Justify"
        >
          <AlignJustify className="h-4 w-4" />
        </MenuButton>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Color picker */}
        <div className="relative" ref={colorPickerRef}>
          <MenuButton
            onClick={() => setShowColorPicker(!showColorPicker)}
            title="Text Colour"
          >
            <Palette className="h-4 w-4" />
          </MenuButton>
          
          {showColorPicker && (
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 bg-white border rounded-md shadow-xl p-3 z-50 min-w-[120px]">
              <div className="grid grid-cols-3 gap-2 justify-items-center">
                {colors.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => setColor(color.value)}
                    className="w-8 h-8 rounded border-2 border-gray-200 hover:border-gray-400 hover:scale-110 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                    style={{ 
                      backgroundColor: color.value === 'inherit' ? 'transparent' : color.value,
                      borderColor: color.value === 'inherit' ? '#d1d5db' : color.value
                    }}
                    title={color.name}
                  >
                    {color.value === 'inherit' && (
                      <span className="text-xs text-gray-500">A</span>
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-xs text-gray-500 text-center">
                Click to apply color
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-6 bg-gray-300 mx-1" />

                 {/* Link controls */}
         {editor.isActive('link') ? (
           <MenuButton
             onClick={removeLink}
             title="Remove Link"
           >
             <Unlink className="h-4 w-4" />
           </MenuButton>
         ) : (
           <MenuButton
             onClick={() => setShowLinkInput(!showLinkInput)}
             title="Add Link"
           >
             <LinkIcon className="h-4 w-4" />
           </MenuButton>
         )}

         {/* Character count */}
         {charLimit && (
           <div className="flex flex-col items-center ml-auto text-xs font-mono">
             <span className={`leading-none ${isOverLimit ? 'text-red-500' : 'text-gray-500'}`}>
               {charCount}/{charLimit}
             </span>
             <span className={isOverLimit ? 'text-red-500' : 'text-gray-500'}>
               Characters
             </span>
           </div>
         )}
         
         {/* Link input */}
         {showLinkInput && (
           <div className="absolute top-full left-1/2 transform -translate-x-1/2  bg-white border rounded-md shadow-xl p-3 z-50 min-w-[300px]" ref={linkInputRef}>
             <div className="flex gap-2">
               <input
                 type="url"
                 placeholder="Enter URL..."
                 value={linkUrl}
                 onChange={(e) => setLinkUrl(e.target.value)}
                 className="flex-1 px-3 py-1 border rounded text-sm"
                 onKeyDown={(e) => {
                   if (e.key === 'Enter') {
                     addLink();
                   }
                 }}
               />
               <Button size="sm" onClick={addLink}>Add</Button>
               <Button size="sm" variant="outline" onClick={() => setShowLinkInput(false)}>Cancel</Button>
             </div>
           </div>
         )}
         
       </div>

      {/* Editor content */}
      <div className={isMobile ? '' : ''}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
} 