'use client';

import { forwardRef, type TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`
          w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm
          placeholder:text-neutral-400 resize-none
          focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400
          disabled:cursor-not-allowed disabled:opacity-50
          dark:border-neutral-700 dark:bg-neutral-900 dark:placeholder:text-neutral-500
          dark:focus:border-neutral-500 dark:focus:ring-neutral-500
          ${className}
        `}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';
