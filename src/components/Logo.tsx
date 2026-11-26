export function Logo({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="32" height="32" rx="10" fill="#242D36" stroke="#343F49" strokeWidth="1.5" />
      <circle cx="18" cy="17" r="7.5" fill="#151A20" stroke="#8BE0BC" strokeWidth="2" />
      <path d="M18 13V17L20.8 18.8" stroke="#F1F5F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.5 27.5H25.5" stroke="#8ABEFF" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
