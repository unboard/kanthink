'use client';

import { useState, useRef, useEffect } from 'react';
import type { TagDefinition } from '@/lib/types';
import { Button } from '@/components/ui';

const TAG_COLORS = ['gray', 'red', 'orange', 'yellow', 'lime', 'green', 'cyan', 'blue', 'purple', 'pink'] as const;

// Solid color backgrounds with dark text
const tagColorStyles: Record<string, string> = {
  red: 'bg-red-400 text-neutral-900',
  orange: 'bg-orange-400 text-neutral-900',
  yellow: 'bg-yellow-300 text-neutral-900',
  lime: 'bg-lime-400 text-neutral-900',
  green: 'bg-green-400 text-neutral-900',
  cyan: 'bg-cyan-400 text-neutral-900',
  blue: 'bg-blue-400 text-neutral-900',
  purple: 'bg-purple-400 text-neutral-900',
  pink: 'bg-pink-400 text-neutral-900',
  gray: 'bg-neutral-400 text-neutral-900',
};

const colorSwatchStyles: Record<string, string> = {
  red: 'bg-red-400',
  orange: 'bg-orange-400',
  yellow: 'bg-yellow-300',
  lime: 'bg-lime-400',
  green: 'bg-green-400',
  cyan: 'bg-cyan-400',
  blue: 'bg-blue-400',
  purple: 'bg-purple-400',
  pink: 'bg-pink-400',
  gray: 'bg-neutral-400',
};

// Check if a color is a hex code
const isHexColor = (color: string) => /^#[0-9A-Fa-f]{6}$/.test(color);

// Get styles for a tag - handles both preset colors and hex codes
export const getTagStyles = (color: string): { className?: string; style?: React.CSSProperties } => {
  if (isHexColor(color)) {
    return {
      style: { backgroundColor: color, color: '#171717' },
    };
  }
  return {
    className: tagColorStyles[color] ?? tagColorStyles.gray,
  };
};

interface TagPickerProps {
  tagDefinitions: TagDefinition[];
  selectedTags: string[];
  onAddTag: (tagName: string) => void;
  onRemoveTag: (tagName: string) => void;
  onCreateTag: (name: string, color: string) => void;
  onUpdateTag?: (tagId: string, updates: { name?: string; color?: string }) => void;
  onDeleteTag?: (tagId: string) => void;
  onClose: () => void;
}

export function TagPicker({
  tagDefinitions,
  selectedTags,
  onAddTag,
  onRemoveTag,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
  onClose,
}: TagPickerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newTagColor, setNewTagColor] = useState('blue');
  const [editingTag, setEditingTag] = useState<TagDefinition | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [customHex, setCustomHex] = useState('');
  const [newTagCustomHex, setNewTagCustomHex] = useState('');
  const [hoveredTagId, setHoveredTagId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (editingTag) {
      setEditName(editingTag.name);
      if (isHexColor(editingTag.color)) {
        setEditColor('custom');
        setCustomHex(editingTag.color);
      } else {
        setEditColor(editingTag.color);
        setCustomHex('');
      }
      setTimeout(() => editInputRef.current?.focus(), 0);
    }
  }, [editingTag]);

  const selectedTagSet = new Set(selectedTags);

  // Filter tags by search
  const filteredTags = tagDefinitions.filter((tag) =>
    tag.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Check if we can create a new tag
  const trimmedSearch = searchTerm.trim();
  const existingTag = tagDefinitions.find(
    (t) => t.name.toLowerCase() === trimmedSearch.toLowerCase()
  );
  const canCreate = trimmedSearch && !existingTag;

  const handleToggleTag = (tag: TagDefinition) => {
    if (selectedTagSet.has(tag.name)) {
      onRemoveTag(tag.name);
    } else {
      onAddTag(tag.name);
    }
  };

  const handleCreate = () => {
    if (!trimmedSearch) return;
    // Use custom hex if selected, otherwise use preset color
    const finalColor = newTagColor === 'custom' && isHexColor(newTagCustomHex) ? newTagCustomHex : newTagColor;
    onCreateTag(trimmedSearch, finalColor);
    onAddTag(trimmedSearch);
    setSearchTerm('');
    setIsCreating(false);
    setNewTagCustomHex('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (editingTag) {
        setEditingTag(null);
      } else {
        onClose();
      }
    } else if (e.key === 'Enter' && canCreate) {
      if (isCreating) {
        handleCreate();
      } else {
        setIsCreating(true);
      }
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditingTag(null);
    } else if (e.key === 'Enter') {
      handleSaveEdit();
    }
  };

  const handleOpenEdit = (tag: TagDefinition, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTag(tag);
  };

  const handleSaveEdit = () => {
    if (!editingTag || !onUpdateTag) return;
    const trimmedName = editName.trim();
    if (!trimmedName) return;

    // Check if name conflicts with another tag
    const nameConflict = tagDefinitions.some(
      (t) => t.id !== editingTag.id && t.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (nameConflict) return;

    // Use custom hex if selected, otherwise use preset color
    const finalColor = editColor === 'custom' && isHexColor(customHex) ? customHex : editColor;
    onUpdateTag(editingTag.id, { name: trimmedName, color: finalColor });
    setEditingTag(null);
  };

  const handleDeleteTag = () => {
    if (!editingTag || !onDeleteTag) return;
    // Also remove from card if selected
    if (selectedTagSet.has(editingTag.name)) {
      onRemoveTag(editingTag.name);
    }
    onDeleteTag(editingTag.id);
    setEditingTag(null);
  };

  return (
    <div className="relative p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg space-y-3">
      {/* Search input */}
      <input
        ref={inputRef}
        type="text"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search or create tag..."
        className="w-full px-3 py-2 text-sm bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-500"
      />

      {/* Existing tags list */}
      {filteredTags.length > 0 && !editingTag && (
        <div className="space-y-1">
          {filteredTags.map((tag) => {
            const isSelected = selectedTagSet.has(tag.name);
            const isHovered = hoveredTagId === tag.id;
            return (
              <div
                key={tag.id}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm font-medium transition-all ${
                  getTagStyles(tag.color).className ?? ''
                } ${isSelected ? '' : 'opacity-80 hover:opacity-100'}`}
                style={getTagStyles(tag.color).style}
                onMouseEnter={() => setHoveredTagId(tag.id)}
                onMouseLeave={() => setHoveredTagId(null)}
              >
                <button
                  onClick={() => handleToggleTag(tag)}
                  className="flex-1 flex items-center gap-2 text-left"
                >
                  {isSelected && (
                    <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span className="truncate">{tag.name}</span>
                </button>
                {onUpdateTag && (
                  <button
                    onClick={(e) => handleOpenEdit(tag, e)}
                    className={`p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-opacity ${
                      isHovered ? 'opacity-100' : 'opacity-0'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit tag panel */}
      {editingTag && (
        <div className="p-3 bg-white dark:bg-neutral-900 rounded-md border border-neutral-200 dark:border-neutral-700 space-y-3">
          <input
            ref={editInputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={handleEditKeyDown}
            className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-500"
            placeholder="Tag name"
          />

          {/* Delete option */}
          {onDeleteTag && (
            <button
              onClick={handleDeleteTag}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          )}

          {/* Colors section */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
              Colors
            </p>
            <div className="flex flex-wrap gap-1.5">
              {TAG_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setEditColor(color)}
                  className={`w-7 h-7 rounded-md ${colorSwatchStyles[color]} ${
                    editColor === color ? 'ring-2 ring-violet-500 ring-offset-2 dark:ring-offset-neutral-900' : ''
                  }`}
                  title={color}
                />
              ))}
            </div>
            {/* Custom color picker */}
            <div className="flex items-center gap-2 pt-2">
              <label
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer ${
                  editColor === 'custom' ? 'ring-2 ring-violet-500' : ''
                }`}
              >
                <input
                  type="color"
                  value={isHexColor(customHex) ? customHex : '#8BBFFF'}
                  onChange={(e) => {
                    setCustomHex(e.target.value.toUpperCase());
                    setEditColor('custom');
                  }}
                  className="w-5 h-5 rounded cursor-pointer border-0 p-0"
                />
                Custom
              </label>
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-700">
            <Button size="sm" onClick={handleSaveEdit}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingTag(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Create new tag */}
      {canCreate && !isCreating && !editingTag && (
        <button
          onClick={() => setIsCreating(true)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 rounded-md hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Create tag "{trimmedSearch}"
        </button>
      )}

      {/* Color picker for new tag */}
      {isCreating && !editingTag && (
        <div className="p-3 bg-white dark:bg-neutral-900 rounded-md border border-neutral-200 dark:border-neutral-700 space-y-3">
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Create tag "{trimmedSearch}"
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TAG_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setNewTagColor(color)}
                className={`w-7 h-7 rounded-md ${colorSwatchStyles[color]} ${
                  newTagColor === color ? 'ring-2 ring-violet-500 ring-offset-2 dark:ring-offset-neutral-900' : ''
                }`}
                title={color}
              />
            ))}
          </div>
          {/* Custom color picker for new tag */}
          <div className="flex items-center gap-2">
            <label
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer ${
                newTagColor === 'custom' ? 'ring-2 ring-violet-500' : ''
              }`}
            >
              <input
                type="color"
                value={isHexColor(newTagCustomHex) ? newTagCustomHex : '#8BBFFF'}
                onChange={(e) => {
                  setNewTagCustomHex(e.target.value.toUpperCase());
                  setNewTagColor('custom');
                }}
                className="w-5 h-5 rounded cursor-pointer border-0 p-0"
              />
              Custom
            </label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate}>
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setIsCreating(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {filteredTags.length === 0 && !canCreate && !editingTag && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-2">
          {searchTerm ? 'No matching tags' : 'No tags defined yet. Type to create one.'}
        </p>
      )}

      {!editingTag && (
        <div className="flex justify-end pt-2 border-t border-neutral-200 dark:border-neutral-700">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      )}
    </div>
  );
}
