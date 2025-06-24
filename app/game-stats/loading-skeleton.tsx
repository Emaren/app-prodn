"use client";

export const cleanGameType = (rawType: string): string => {
  const match = rawType.match(/'(VER.*?)'/);
  return match && match[1] ? match[1] : rawType;
};

export const formatDuration = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0 && minutes > 0 && secs > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0 && secs > 0) return `${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m`;
  return `${secs}s`;
};

export const sanitizeDuration = (seconds: number): number => {
  if (seconds > 4 * 3600 || seconds < 10) return 0;
  return seconds;
};

export const LoadingSkeleton = () => (
  <div className="space-y-6">
    {Array.from({ length: 3 }).map((_, idx) => (
      <div key={idx} className="p-6 rounded-xl bg-gray-700 animate-pulse space-y-4">
        <div className="h-6 bg-gray-600 rounded w-1/2"></div>
        <div className="h-4 bg-gray-600 rounded w-1/3"></div>
        <div className="h-4 bg-gray-600 rounded w-1/4"></div>
        <div className="h-4 bg-gray-600 rounded w-2/5"></div>
        <div className="h-4 bg-gray-600 rounded w-3/5"></div>
        <div className="h-4 bg-gray-600 rounded w-1/2"></div>
      </div>
    ))}
  </div>
);
