import React from 'react';

interface LoadingProps {
  variant?: 'spinner' | 'skeleton' | 'dots';
  text?: string;
}

const Loading: React.FC<LoadingProps> = ({
  variant = 'spinner',
  text = 'Carregando...',
}) => {
  if (variant === 'spinner') {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-4">
        <div className="animate-spin text-4xl">⏳</div>
        {text && <p className="text-gray-500">{text}</p>}
      </div>
    );
  }

  if (variant === 'skeleton') {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'dots') {
    return (
      <div className="flex items-center justify-center gap-1 py-8">
        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
      </div>
    );
  }

  return null;
};

export default Loading;
