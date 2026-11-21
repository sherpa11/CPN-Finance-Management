import React from 'react';

export default function PageSkeleton() {
  return (
    <div className="space-y-5 animate-pulse w-full">
      {/* Header bar skeleton */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-5 bg-slate-200 rounded w-48" />
          <div className="h-3 bg-slate-100 rounded w-72" />
        </div>
        <div className="h-9 bg-slate-200 rounded-lg w-32" />
      </div>

      {/* KPI Cards skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
            <div className="h-3 bg-slate-200 rounded w-20" />
            <div className="h-6 bg-slate-200 rounded w-28" />
          </div>
        ))}
      </div>

      {/* Main Table / Content Area skeleton */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="h-4 bg-slate-200 rounded w-36" />
          <div className="h-8 bg-slate-100 rounded-lg w-48" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="flex items-center justify-between py-2 border-b border-slate-50">
              <div className="h-3 bg-slate-100 rounded w-28" />
              <div className="h-3 bg-slate-100 rounded w-40 hidden sm:block" />
              <div className="h-3 bg-slate-100 rounded w-24" />
              <div className="h-5 bg-slate-200 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
