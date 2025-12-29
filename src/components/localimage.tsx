import React, { useEffect, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';

interface LocalImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
}

const LocalImage: React.FC<LocalImageProps> = ({ src, alt, ...props }) => {
  // Simple gray placeholder SVG
  const PLACEHOLDER_LOADING = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZWVlIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiM5OTkiPkxvYWRpbmc8L3RleHQ+PC9zdmc+';
  const PLACEHOLDER_NO_IMAGE = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZWVlIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiM5OTkiPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
  const PLACEHOLDER_ERROR = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZWVlIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiM5OTkiPkVycm9yPC90ZXh0Pjwvc3ZnPg==';

  const [imageSrc, setImageSrc] = useState<string>(PLACEHOLDER_LOADING);

  useEffect(() => {
    if (!src) {
        setImageSrc(PLACEHOLDER_NO_IMAGE);
        return;
    }

    if (src.startsWith('http') || src.startsWith('https') || src.startsWith('data:')) {
        setImageSrc(src);
        return;
    }

    // Use Tauri's asset protocol
    const assetUrl = convertFileSrc(src);
    setImageSrc(assetUrl);

  }, [src]);

  return (
    <img 
      src={imageSrc} 
      alt={alt || 'Movie Poster'} 
      referrerPolicy="no-referrer" 
      onError={() => {
          if (imageSrc !== PLACEHOLDER_ERROR && imageSrc !== PLACEHOLDER_NO_IMAGE) {
              setImageSrc(PLACEHOLDER_ERROR);
          }
      }}
      {...props} 
    />
  );
};

export default LocalImage;
