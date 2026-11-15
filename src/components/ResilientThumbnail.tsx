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
 * Official Azadari Kopaganj circular channel avatar rendered across the channel header,
 * video cards, watch page owner row, and community posts.
 */
export const ChannelAvatar: React.FC<ChannelAvatarProps> = ({
  size = 'md',
  onClick,
  className = '',
}) => {
  const [logoSrc, setLogoSrc] = useState<string>('./azadari-logo.png');

  const dimensions =
    size === 'sm'
      ? 'w-8 h-8 p-0.5'
      : size === 'lg'
        ? 'w-12 h-12 p-1'
        : size === 'xl'
          ? 'w-20 h-20 sm:w-28 sm:h-28 p-2 sm:p-2.5'
          : 'w-9 h-9 p-1';

  return (
    <div
      onClick={onClick}
      className={`${dimensions} rounded-full overflow-hidden shrink-0 select-none bg-white ring-1 ring-neutral-300 dark:ring-white/20 shadow-xs flex items-center justify-center ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      <img
        src={logoSrc}
        alt="Azadari Kopaganj Official Logo"
        onError={() => {
          if (logoSrc !== './assets/aistudio/logo_c231bb70.png') {
            setLogoSrc('./assets/aistudio/logo_c231bb70.png');
          }
        }}
        className="w-full h-full object-contain"
      />
    </div>
  );
};
