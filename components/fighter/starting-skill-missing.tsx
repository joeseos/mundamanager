import { LuTriangleAlert } from 'react-icons/lu';

export function StartingSkillMissing({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 text-sm text-amber-700 ${className}`}>
      <LuTriangleAlert className="h-4 w-4 shrink-0" />
      Starting skill missing.
    </div>
  );
}
