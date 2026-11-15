import React, { useEffect, useState } from 'react';
import heroHeritageImg from '../assets/images/hero_azadari_heritage_1793695501942.jpg';
import majlisHallImg from '../assets/images/majlis_recitation_hall_1793695503139.jpg';

export const CHANNEL_BANNER_IMAGE = heroHeritageImg;

interface ResilientThumbnailProps {
  src: string;
  alt: string;
  youtubeId?: string;
  fallbackIndex?: number;
  className?: string;
}

export const ResilientThumbnail: React.FC<ResilientThumbnailProps> = ({
  src,
  alt,
  fallbackIndex = 0,
  className = '',
}) => {
  const fallbackImage = fallbackIndex % 2 === 1 ? majlisHallImg : heroHeritageImg;
  const [currentSrc, setCurrentSrc] = useState<string>(src || fallbackImage);
  const [usedFallbackImg, setUsedFallbackImg] = useState<boolean>(false);

  useEffect(() => {
    setCurrentSrc(src || fallbackImage);
    setUsedFallbackImg(false);
  }, [src, fallbackImage]);

  const handleError = () => {
    if (!usedFallbackImg) {
      setUsedFallbackImg(true);
      setCurrentSrc(fallbackImage);
    }
  };

  return (
    <div className={`relative overflow-hidden bg-[#181818] select-none ${className}`}>
      <img
        src={currentSrc}
        alt={alt}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={handleError}
        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
      />
    </div>
  );
};

interface ChannelAvatarProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

/**
 * Authentic YouTube circular channel avatar with an ornate Azadari Kopaganj crest
 * instead of repetitive plain text circles.
 */
export const ChannelAvatar: React.FC<ChannelAvatarProps> = ({
  size = 'md',
  onClick,
  className = '',
}) => {
  const dimensions =
    size === 'sm'
      ? 'w-8 h-8'
      : size === 'lg'
        ? 'w-12 h-12'
        : size === 'xl'
          ? 'w-20 h-20 sm:w-28 sm:h-28'
          : 'w-9 h-9';

  return (
    <div
      onClick={onClick}
      className={`${dimensions} rounded-full overflow-hidden shrink-0 select-none bg-[#181818] ring-1 ring-white/15 flex items-center justify-center ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <defs>
          <radialGradient id="akAvatarGrad" cx="50%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#991B1B" />
            <stop offset="60%" stopColor="#450A0A" />
            <stop offset="100%" stopColor="#0F0F0F" />
          </radialGradient>
          <linearGradient id="akGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FDE68A" />
            <stop offset="50%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#FEF3C7" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#akAvatarGrad)" />
        <circle
          cx="50"
          cy="50"
          r="43"
          fill="none"
          stroke="url(#akGoldGrad)"
          strokeWidth="2.2"
          strokeOpacity="0.85"
        />
        {/* Shrine Dome & Minarets Silhouette */}
        <path
          d="M26 70 L26 42 L29 36 L32 42 L32 70 Z M68 70 L68 42 L71 36 L74 42 L74 70 Z"
          fill="url(#akGoldGrad)"
          opacity="0.9"
        />
        <path
          d="M35 70 C35 50, 42 36, 50 28 C58 36, 65 50, 65 70 Z"
          fill="url(#akGoldGrad)"
        />
        <circle cx="50" cy="23" r="2.5" fill="#FDE68A" />
        <rect x="22" y="69" width="56" height="4" rx="2" fill="url(#akGoldGrad)" />
      </svg>
    </div>
  );
};
