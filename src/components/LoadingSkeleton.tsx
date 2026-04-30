import React from 'react';

export function LoadingSkeleton() {
  return (
    <div className="p-4 sm:p-6 w-full animate-pulse space-y-8">
      <div className="h-48 sm:h-64 md:h-80 bg-[var(--card)] rounded-xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--pink)]/10 to-[var(--purple)]/10"></div>
      </div>
      
      <div className="space-y-4">
        <div className="h-6 w-48 bg-[var(--card)] rounded-md"></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="aspect-[3/4] bg-[var(--card)] rounded-xl"></div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 animate-pulse">
      {[...Array(12)].map((_, i) => (
         <div key={i} className="space-y-3">
           <div className="aspect-[3/4] bg-[var(--card)] rounded-xl"></div>
           <div className="h-4 bg-[var(--card)] rounded-md w-3/4"></div>
           <div className="h-3 bg-[var(--card)] rounded-md w-1/2"></div>
         </div>
      ))}
    </div>
  );
}
