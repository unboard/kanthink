'use client';

import { useState, useRef, useEffect } from 'react';
import type { TagDefinition } from '@/lib/types';
import { getTagStyles } from './TagPicker';

interface TagSnippetData {
  tagName: string;
  createDefinition?: boolean;
  suggestedColor?: string;
}

interface TagSnippetProps {
  data: TagSnippetData;
  actionType: 'add_tag' | 'remove_tag';
  isEditing: boolean;
  isRejected: boolean;
  tagDefinitions: TagDefinition[];
  cardTags: string[];
  onDataChange: (data: TagSnippetData) => void;
}

const DEFAULT_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'neutral'];

export function TagSnippet({
  data,
  actionType,
  isEditing,
  isRejected,
  tagDefinitions,
  cardTags,
  onDataChange,
}: TagSnippetProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Find existing tag definition
  const existingTag = tagDefinitions.find(
    (t) => t.name.toLowerCase() === data.tagName.toLowerCase()
  );
  const tagColor = existingTag?.color ?? data.suggestedColor ?? 'blue';
  const isNewTag = !existingTag && actionType === 'add_tag';

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  // Get available tags for dropdown (for remove_tag, show only card tags; for add_tag, show all)
  const availableTagsForDropdown = actionType === 'remove_tag'
    ? tagDefinitions.filter((t) => cardTags.includes(t.name))
    : tagDefinitions;

  const handleSelectTag = (tagName: string) => {
    const tag = tagDefinitions.find((t) => t.name === tagName);
    onDataChange({
      tagName,
      createDefinition: false,
      suggestedColor: tag?.color,
    });
    setShowDropdown(false);
  };

  const handleColorSelect = (color: string) => {
    onDataChange({
      ...data,
      suggestedColor: color,
    });
  };

  if (isEditing) {
    return (
      <div className="space-y-2" ref={dropdownRef}>
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={data.tagName}
            onChange={(e) => {
              const newName = e.target.value;
              const tag = tagDefinitions.find(
                (t) => t.name.toLowerCase() === newName.toLowerCase()
              );
              onDataChange({
                tagName: newName,
                createDefinition: !tag && actionType === 'add_tag',
                suggestedColor: tag?.color ?? data.suggestedColor,
              });
            }}
            onFocus={() => setShowDropdown(true)}
            className="w-full px-2 py-1 text-sm bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-600 rounded focus:outline-none focus:ring-1 focus:ring-violet-500"
            placeholder="Tag name"
          />

          {/* Dropdown for existing tags */}
          {showDropdown && availableTagsForDropdown.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 py-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md shadow-lg z-10 max-h-32 overflow-y-auto">
              {availableTagsForDropdown
                .filter((t) =>
                  t.name.toLowerCase().includes(data.tagName.toLowerCase())
                )
                .map((tag) => {
                  const styles = getTagStyles(tag.color);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleSelectTag(tag.name)}
                      className="w-full px-2 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
                    >
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded ${styles.className ?? ''}`}
                        style={styles.style}
                      >
                        {tag.name}
                      </span>
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        {/* Color picker for new tags */}
        {isNewTag && (
          <div className="flex flex-wrap gap-1">
            <span className="text-xs text-neutral-500 dark:text-neutral-400 mr-1">Color:</span>
            {DEFAULT_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => handleColorSelect(color)}
                className={`w-5 h-5 rounded ${
                  data.suggestedColor === color
                    ? 'ring-2 ring-violet-500 ring-offset-1 dark:ring-offset-neutral-900'
                    : ''
                }`}
                style={{
                  backgroundColor:
                    color === 'neutral' ? '#a3a3a3' :
                    color === 'red' ? '#f87171' :
                    color === 'orange' ? '#fb923c' :
                    color === 'yellow' ? '#fde047' :
                    color === 'green' ? '#4ade80' :
                    color === 'blue' ? '#60a5fa' :
                    color === 'purple' ? '#c084fc' :
                    color === 'pink' ? '#f472b6' : '#a3a3a3',
                }}
                title={color}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Render the tag pill
  const styles = getTagStyles(tagColor);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-neutral-500 dark:text-neutral-400">
        {actionType === 'add_tag' ? 'Add' : 'Remove'}:
      </span>
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded ${
          isRejected ? 'opacity-50 line-through' : ''
        } ${styles.className ?? ''}`}
        style={styles.style}
      >
        {data.tagName}
        {isNewTag && !isRejected && (
          <span className="text-[10px] opacity-70">(new)</span>
        )}
      </span>
    </div>
  );
}
