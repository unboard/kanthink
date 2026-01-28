interface MushroomIconProps {
  className?: string;
  size?: number;
}

export function MushroomIcon({ className = '', size = 16 }: MushroomIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Mushroom cap */}
      <path
        d="M12 3C7 3 3 7 3 11C3 12.5 4 13 5 13H19C20 13 21 12.5 21 11C21 7 17 3 12 3Z"
        fill="currentColor"
        opacity="0.9"
      />
      {/* Cap spots - psychedelic dots */}
      <circle cx="8" cy="8" r="1.5" fill="currentColor" opacity="0.4" />
      <circle cx="14" cy="7" r="1" fill="currentColor" opacity="0.4" />
      <circle cx="11" cy="10" r="1" fill="currentColor" opacity="0.4" />
      <circle cx="16" cy="10" r="0.8" fill="currentColor" opacity="0.4" />
      {/* Stem */}
      <path
        d="M9 13V19C9 20 10 21 12 21C14 21 15 20 15 19V13H9Z"
        fill="currentColor"
        opacity="0.7"
      />
    </svg>
  );
}
