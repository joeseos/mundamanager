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
import Image from '@tiptap/extension-image';

// Extend Image to support alignment attribute
const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-align'),
        renderHTML: (attributes) => {
          if (!attributes.align) {
            return {};
          }
          return { 'data-align': attributes.align };
        },
      },
    };
  },
});
import { Button } from '@/components/ui/button';
import {
  LuItalic, 
  LuUnderline, 
  LuLink, 
  LuAlignLeft, 
  LuAlignCenter, 
  LuAlignRight, 
  LuAlignJustify,
  LuHeading1, 
  LuHeading2, 
  LuHeading3,
  LuPalette,
  LuImage,
  LuUnlink,
  LuList,
  LuListOrdered,
  LuStrikethrough
} from "react-icons/lu";
import { BiSolidQuoteRight } from "react-icons/bi";
import { HiMiniBold } from "react-icons/hi2";
import { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import '@/components/ui/rich-text-editor.css';
import { useToast } from '@/components/ui/use-toast';
import { useRichTextImages } from '@/hooks/use-rich-text-images';

export interface RichTextEditorHandle {
  finalizeAssets: (currentHtml: string) => Promise<string>;
  discardAssets: () => Promise<void>;
}

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  charLimit?: number;
  campaignId?: string; // Optional campaign ID for image uploads
  enableImages?: boolean; // When false, hide all image upload/hotlink UI
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

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor(
  { content, onChange, placeholder, className, charLimit, campaignId, enableImages }: RichTextEditorProps,
  ref
) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [showImageInput, setShowImageInput] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [toolbarTop, setToolbarTop] = useState(90);
  const [scrollY, setScrollY] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [, forceUpdate] = useState({});
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Ref to hold the image insertion function (set after editor is ready)
  const insertImageRef = useRef<((url: string) => void) | null>(null);

  // Callbacks for the image hook
  const handleImageInserted = useCallback((url: string) => {
    insertImageRef.current?.(url);
  }, []);

  const handleCloseImageInput = useCallback(() => {
    setShowImageInput(false);
    setIsEditingImage(false);
    setImageUrl('');
  }, []);

  // Image asset management hook
  const {
    isUploadingImage,
    uploadedImageCount,
    hostedImageToRemove,
    fileInputRef,
    setHostedImageToRemove,
    getStorageBaseUrl,
    getStoragePathFromUrl,
    isHostedImage,
    handleFileUpload,
    removeHostedImage,
    finalizeAssets,
    discardAssets,
    resetImageInputState,
  } = useRichTextImages({
    campaignId,
    content,
    maxImages: 5,
    onImageInserted: handleImageInserted,
    onCloseImageInput: handleCloseImageInput,
  });

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
      CustomImage.configure({
        HTMLAttributes: {
          class: 'max-w-full h-auto rounded-md my-2',
        },
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();

      // Determine if content is effectively empty:
      // - Strip all HTML tags and whitespace to check for text
      // - If there's no text BUT there is at least one <img> tag, we treat it as non-empty
      const textContent = html.replace(/<[^>]*>/g, "").trim();
      const hasImage = /<img\b[^>]*src=["']?[^"'>]+["']?[^>]*>/i.test(html);

      if (textContent === "" && !hasImage) {
        // No text and no images → treat as empty
        onChange("");
      } else {
        // Has text or at least one image → keep the HTML
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
      if (imageInputRef.current && !imageInputRef.current.contains(event.target as Node)) {
        setShowImageInput(false);
        setIsEditingImage(false);
        setImageUrl('');
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

  // Calculate character count from HTML content
  const getCharCount = (htmlContent: string) => {
    const textContent = htmlContent.replace(/<[^>]*>/g, '');
    return textContent.length;
  };

  const charCount = getCharCount(content);
  const isOverLimit = charLimit && charCount > charLimit;

  const addLink = () => {
    if (!editor) return;
    if (linkUrl) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
      setLinkUrl('');
      setShowLinkInput(false);
    }
  };

  const removeLink = () => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
  };

  const setColor = (color: string) => {
    if (!editor) return;
    editor.chain().focus().setColor(color).run();
    setShowColorPicker(false);
  };

  // Helper to get current paragraph alignment
  const getCurrentParagraphAlignment = (): string | null => {
    if (!editor) return null;
    const { state } = editor;
    const { selection } = state;
    const { $from } = selection;

    // Walk up from cursor to find nearest paragraph
    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth);
      if (node.type.name === 'paragraph') {
        return node.attrs.textAlign || null;
      }
    }
    return null;
  };

  // Helper to check if current selection (including images) has specific alignment
  const isAlignmentActive = (alignment: 'left' | 'center' | 'right' | 'justify'): boolean => {
    if (!editor) return false;

    // Check normal text alignment first
    if (editor.isActive({ textAlign: alignment })) {
      return true;
    }

    // If image is selected, check the image's align attribute
    if (editor.isActive('image')) {
      const attrs = editor.getAttributes('image');
      return attrs.align === alignment;
    }

    return false;
  };

  // Helper to align content (text or images)
  const alignContent = (alignment: 'left' | 'center' | 'right' | 'justify') => {
    if (!editor) return;

    if (editor.isActive('image')) {
      // Update the image's align attribute directly
      (editor.chain() as any)
        .focus()
        .updateAttributes('image', { align: alignment })
        .run();
      forceUpdate({});
    } else {
      // Not an image, apply alignment normally
      editor.chain().focus().setTextAlign(alignment).run();
    }
  };

  // Helper to insert image with the current paragraph's alignment
  const insertImageWithAlignment = (src: string) => {
    if (!editor) return;

    const currentAlignment = getCurrentParagraphAlignment();

    // Insert image with alignment attribute
    (editor.chain() as any)
      .focus()
      .setImage({ src, align: currentAlignment })
      .run();
  };

  // Keep ref in sync for the image hook callback
  insertImageRef.current = insertImageWithAlignment;

  const addImage = () => {
    if (!editor) return;
    if (!imageUrl) return;

    if (isEditingImage) {
      // Update existing image
      (editor.chain() as any)
        .focus()
        .updateAttributes('image', { src: imageUrl })
        .run();
      setIsEditingImage(false);
    } else {
      // Insert new image with current paragraph alignment
      insertImageWithAlignment(imageUrl);
    }

    setImageUrl('');
    setShowImageInput(false);
  };

  const removeImage = () => {
    if (!editor) return;
    (editor.chain() as any)
      .focus()
      .deleteSelection()
      .run();
    setIsEditingImage(false);
    setShowImageInput(false);
    setImageUrl('');
  };

  // Helper to remove hosted image with editor callback
  const handleRemoveHostedImage = async (src: string) => {
    await removeHostedImage(src, removeImage);
  };

  useImperativeHandle(ref, () => ({
    finalizeAssets,
    discardAssets,
  }));

  if (!editor) {
    return null;
  }

  const MenuButton = ({ 
    onClick, 
    isActive = false, 
    children, 
    title,
    className,
  }: { 
    onClick: () => void; 
    isActive?: boolean; 
    children: React.ReactNode; 
    title: string;
    className?: string;
  }) => (
    <Button
      variant={isActive ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      title={title}
      className={`h-8 w-8 p-0 ${className ?? ""}`}
    >
      {children}
    </Button>
  );

  return (
    <div className={`border rounded-md ${className}`} ref={editorRef}>
      {/* Toolbar */}
      <div className={`border-b p-2 flex flex-wrap gap-[3px] items-center bg-card z-[70] shadow-sm ${
        isMobile 
          ? 'fixed left-0 right-0 border-b-2 border-border' 
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
          <LuItalic className="h-4 w-4" />
        </MenuButton>
        
        <MenuButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive('underline')}
          title="Underline"
        >
          <LuUnderline className="h-4 w-4" />
        </MenuButton>
        
        <MenuButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive('strike')}
          title="Strikethrough"
        >
          <LuStrikethrough className="h-4 w-4" />
        </MenuButton>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Headings */}
        <MenuButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          <LuHeading1 className="h-4 w-4" />
        </MenuButton>
        
        <MenuButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          <LuHeading2 className="h-4 w-4" />
        </MenuButton>
        
        <MenuButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive('heading', { level: 3 })}
          title="Heading 3"
        >
          <LuHeading3 className="h-4 w-4" />
        </MenuButton>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Lists */}
        <MenuButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          title="Bullet List"
        >
          <LuList className="h-4 w-4" />
        </MenuButton>
        
        <MenuButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          title="Numbered List"
        >
          <LuListOrdered className="h-4 w-4" />
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
          onClick={() => alignContent('left')}
          isActive={isAlignmentActive('left')}
          title="Align Left"
        >
          <LuAlignLeft className="h-4 w-4" />
        </MenuButton>
        
        <MenuButton
          onClick={() => alignContent('center')}
          isActive={isAlignmentActive('center')}
          title="Align Center"
        >
          <LuAlignCenter className="h-4 w-4" />
        </MenuButton>
        
        <MenuButton
          onClick={() => alignContent('right')}
          isActive={isAlignmentActive('right')}
          title="Align Right"
        >
          <LuAlignRight className="h-4 w-4" />
        </MenuButton>
        
        <MenuButton
          onClick={() => alignContent('justify')}
          isActive={isAlignmentActive('justify')}
          title="Justify"
        >
          <LuAlignJustify className="h-4 w-4" />
        </MenuButton>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Color picker */}
        <div className="relative" ref={colorPickerRef}>
          <MenuButton
            onClick={() => setShowColorPicker(!showColorPicker)}
            title="Text Colour"
          >
            <LuPalette className="h-4 w-4" />
          </MenuButton>
          
          {showColorPicker && (
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 bg-card border rounded-md shadow-xl p-3 z-50 min-w-[120px]">
              <div className="grid grid-cols-3 gap-2 justify-items-center">
                {colors.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => setColor(color.value)}
                    className="w-8 h-8 rounded border-2 border-border hover:border-gray-400 hover:scale-110 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                    style={{ 
                      backgroundColor: color.value === 'inherit' ? 'transparent' : color.value,
                      borderColor: color.value === 'inherit' ? '#d1d5db' : color.value
                    }}
                    title={color.name}
                  >
                    {color.value === 'inherit' && (
                      <span className="text-xs text-muted-foreground">A</span>
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-xs text-muted-foreground text-center">
                Click to apply color
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Link & image controls */}
        <div className="flex items-center gap-1 ml-1">
          {/* Link controls */}
          {editor.isActive('link') ? (
            <MenuButton
              onClick={removeLink}
              className="border border-blue-500 text-blue-500 dark:border-blue-400 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/60"
              title="Remove Link"
            >
              <LuUnlink className="h-4 w-4" />
            </MenuButton>
          ) : (
            <MenuButton
              onClick={() => {
                setShowLinkInput((prev) => !prev);
                setShowImageInput(false);
              }}
              title="Add Link"
            >
              <LuLink className="h-4 w-4" />
            </MenuButton>
          )}

          {/* Image controls (optional) */}
          {enableImages === true && (
            editor.isActive('image') ? (
              <MenuButton
                onClick={() => {
                  const attrs = editor.getAttributes('image');
                  if (attrs.src) {
                    // If hosted on our storage, show removal menu instead of URL edit
                    if (isHostedImage(attrs.src)) {
                      setHostedImageToRemove(attrs.src);
                      setShowImageInput(true);
                      setIsEditingImage(false);
                      setImageUrl('');
                      setShowLinkInput(false);
                      return;
                    }
                    // Otherwise allow editing the hotlink
                    setImageUrl(attrs.src);
                    setIsEditingImage(true);
                    setShowImageInput(true);
                    setShowLinkInput(false);
                  }
                }}
                isActive={true}
                className="border border-blue-500 text-blue-500 dark:border-blue-400 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/60"
                title="Edit or Remove Image"
              >
                <LuImage className="h-4 w-4" />
              </MenuButton>
            ) : (
              <MenuButton
                onClick={() => {
                  setShowImageInput((prev) => !prev);
                  setShowLinkInput(false);
                  setIsEditingImage(false);
                  setImageUrl('');
                }}
                title="Insert Image from URL"
              >
                <LuImage className="h-4 w-4" />
              </MenuButton>
            )
          )}
        </div>

        {/* Character count */}
        {charLimit && (
          <div className="flex flex-col items-center ml-auto text-xs font-mono">
            <span className={`leading-none ${isOverLimit ? 'text-red-500' : 'text-muted-foreground'}`}>
              {charCount}/{charLimit}
            </span>
            <span className={isOverLimit ? 'text-red-500' : 'text-muted-foreground'}>
              Characters
            </span>
          </div>
        )}

        {/* Link input */}
        {showLinkInput && (
          <div
            className="absolute top-full left-1/2 transform -translate-x-1/2 bg-card border rounded-md shadow-xl p-3 z-50 min-w-[300px]"
            ref={linkInputRef}
          >
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

        {/* Image input / actions (optional) */}
        {enableImages === true && showImageInput && (
          <div
            className="absolute top-full left-1/2 transform -translate-x-1/2 bg-card border rounded-md shadow-xl p-3 z-50 min-w-[300px]"
            ref={imageInputRef}
          >
            <div className="flex flex-col gap-2">
              {hostedImageToRemove ? (
                <>
                  <div className="text-sm font-medium text-muted-foreground">
                    Remove uploaded image?
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This will delete the image from storage and remove it from the note.
                  </p>
                  <div className="flex gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setHostedImageToRemove(null);
                        setShowImageInput(false);
                        setIsEditingImage(false);
                        setImageUrl('');
                      }}
                      disabled={isUploadingImage}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (hostedImageToRemove) {
                          void handleRemoveHostedImage(hostedImageToRemove);
                        }
                      }}
                      disabled={isUploadingImage}
                    >
                      Remove
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {campaignId && !isEditingImage && (
                    <>
                      <label className="text-xs text-muted-foreground font-medium">
                        Upload Image ({uploadedImageCount}/5)
                      </label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/svg+xml,.heic,.heif,.avif,.svg"
                        onChange={handleFileUpload}
                        className="hidden"
                        disabled={isUploadingImage || uploadedImageCount >= 5}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingImage || uploadedImageCount >= 5}
                        className="w-full"
                      >
                        {isUploadingImage ? 'Uploading...' : uploadedImageCount >= 5 ? 'Limit Reached (5/5)' : 'Choose File to Upload'}
                      </Button>
                      <p className="text-xs text-muted-foreground text-center">
                        Max 10MB • Resized to 900x900 if larger
                      </p>
                      <div className="w-full h-px bg-border my-1" />
                      <label className="text-xs text-muted-foreground font-medium">
                        Or enter Image URL (hotlink)
                      </label>
                    </>
                  )}
                  {(!campaignId || isEditingImage) && (
                    <label className="text-xs text-muted-foreground">
                      {isEditingImage ? 'Edit Image URL' : 'Image URL (hotlink)'}
                    </label>
                  )}
                  <input
                    type="url"
                    placeholder="Image URL (hotlink)..."
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="flex-1 px-3 py-1 border rounded text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        addImage();
                      }
                      if (e.key === 'Escape') {
                        setShowImageInput(false);
                        setIsEditingImage(false);
                        setImageUrl('');
                      }
                    }}
                    autoFocus={!campaignId || isEditingImage}
                    disabled={isUploadingImage}
                  />
                  <div className="flex justify-between gap-2">
                    {isEditingImage && (
                      <Button 
                        size="sm" 
                        variant="destructive" 
                        onClick={removeImage}
                        disabled={isUploadingImage}
                      >
                        Remove
                      </Button>
                    )}
                    <div className="flex gap-2 ml-auto">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => {
                          setShowImageInput(false);
                          setIsEditingImage(false);
                          setImageUrl('');
                        }}
                        disabled={isUploadingImage}
                      >
                        Cancel
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={addImage}
                        disabled={isUploadingImage || !imageUrl}
                      >
                        {isEditingImage ? 'Update' : 'Insert'}
                      </Button>
                    </div>
                  </div>
                </>
              )}
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
}); 