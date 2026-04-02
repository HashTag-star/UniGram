
import React from 'react';
import { VerificationType } from '../types';

interface VerifiedBadgeProps {
  type?: VerificationType;
  size?: 'sm' | 'md' | 'lg';
}

const badgeConfig: Record<VerificationType, { color: string; label: string; emoji: string }> = {
  student: { color: 'bg-blue-500', label: 'Verified Student', emoji: '✓' },
  professor: { color: 'bg-yellow-500', label: 'Verified Faculty', emoji: '✓' },
  club: { color: 'bg-purple-500', label: 'Verified Organization', emoji: '✓' },
  influencer: { color: 'bg-blue-500', label: 'Notable Account', emoji: '✓' },
  staff: { color: 'bg-green-500', label: 'Verified Staff', emoji: '✓' },
};

const sizeConfig = {
  sm: 'w-3.5 h-3.5 text-[8px]',
  md: 'w-4.5 h-4.5 text-[10px]',
  lg: 'w-6 h-6 text-xs',
};

export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({ type = 'student', size = 'sm' }) => {
  const config = badgeConfig[type];
  const sz = sizeConfig[size];

  return (
    <div
      className={`inline-flex items-center justify-center rounded-full ${config.color} ${sz} flex-shrink-0`}
      title={config.label}
    >
      <span className="text-white font-bold leading-none">{config.emoji}</span>
    </div>
  );
};
