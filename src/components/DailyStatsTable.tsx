import { useState, useMemo } from 'react';
import { StatItem } from '../types';
import {
  formatCurrency,
  calculateCpm,
  formatNumber
} from '../utils/formatters';

interface DailyStatsTableProps {
  stats: StatItem[];
}

type SortField = 'date_time' | 'impressions' | 'requests' | 'clicks' | 'cpm' | 'money';
type SortOrder = 'asc' | 'desc';

export default function DailyStatsTable({ stats }: DailyStatsTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('date_time');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 14;

  // Process rows
  const processedRows = useMemo(() => {
    return stats
      .filter(item => item.date_time)
      .map(item => {
        const money = typeof item.money === 'string' ? parseFloat(item.money) : Number(item.money || 0);
        const impressions = typeof item.impressions === 'string' ? parseFloat(item.impressions) : Number(item.impressions || 0);
        const requests = typeof item.requests === 'string' ? parseFloat(item.requests) : Number(item.requests || 0);
        const clicks = typeof item.clicks === 'string' ? parseFloat(item.clicks) : Number(item.clicks || 0);
        const cpm = calculateCpm(money, impressions);

        return {
          date_time: item.date_time || '',
          money,
          impressions,
          requests,
          clicks,
          cpm,
        };
      });
  }, [stats]);

  // Search & Filter
  const filteredRows = useMemo(() => {
    return processedRows.filter(r =>
      r.date_time.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [processedRows, searchTerm]);

  // Sorting
  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];
      if (sortField === 'date_time') {
        return sortOrder === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [filteredRows, sortField, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(sortedRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, currentPage, pageSize]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const getSortIndicator = (field: SortField) => {
    if (sortField !== field) return null;
    return <span className="ml-1 text-slate-900 dark:text-white">{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div id="daily-stats-table-container" className="bg-white dark:bg-black rounded-2xl overflow-hidden transition-colors">
      {/* Controls */}
      <div className="px-3.5 py-3 border-b border-slate-200 dark:border-neutral-800 flex flex-col gap-2.5 text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-slate-900 dark:text-neutral-100 uppercase tracking-wider text-[11px] select-none">Daily breakdown</span>
          <span className="text-slate-400 dark:text-neutral-500 font-mono text-[11px]">
            {sortedRows.length} days
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="daily-search-input"
            type="text"
            placeholder="Filter date..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-neutral-200 placeholder-slate-400 dark:placeholder-neutral-600 focus:outline-none focus:border-slate-400 dark:focus:border-neutral-600 w-full font-mono text-xs"
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-600 dark:text-neutral-400">
          <thead className="bg-slate-50 dark:bg-[#0a0a0a] text-slate-600 dark:text-neutral-400 font-medium text-[11px] border-b border-slate-200 dark:border-neutral-800">
            <tr>
              <th
                className="py-2.5 px-3.5 cursor-pointer select-none hover:text-slate-900 dark:hover:text-white"
                onClick={() => handleSort('date_time')}
              >
                Date {getSortIndicator('date_time')}
              </th>
              <th
                className="py-2.5 px-3.5 text-right cursor-pointer select-none hover:text-slate-900 dark:hover:text-white"
                onClick={() => handleSort('impressions')}
              >
                Impressions {getSortIndicator('impressions')}
              </th>
              <th
                className="py-2.5 px-3.5 text-right cursor-pointer select-none hover:text-slate-900 dark:hover:text-white"
                onClick={() => handleSort('requests')}
              >
                Requests {getSortIndicator('requests')}
              </th>
              <th
                className="py-2.5 px-3.5 text-right cursor-pointer select-none hover:text-slate-900 dark:hover:text-white"
                onClick={() => handleSort('clicks')}
              >
                Clicks {getSortIndicator('clicks')}
              </th>
              <th
                className="py-2.5 px-3.5 text-right cursor-pointer select-none hover:text-slate-900 dark:hover:text-white"
                onClick={() => handleSort('cpm')}
              >
                CPM {getSortIndicator('cpm')}
              </th>
              <th
                className="py-2.5 px-3.5 text-right cursor-pointer select-none hover:text-slate-900 dark:hover:text-white"
                onClick={() => handleSort('money')}
              >
                Revenue {getSortIndicator('money')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-neutral-900 font-mono text-[11px] tabular-nums">
            {paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-400 dark:text-neutral-500 font-sans">
                  No records.
                </td>
              </tr>
            ) : (
              paginatedRows.map((row) => (
                <tr key={row.date_time} className="hover:bg-slate-50 dark:hover:bg-neutral-900/40 transition-colors">
                  <td className="py-2 px-3.5 font-medium text-slate-900 dark:text-neutral-200">{row.date_time}</td>
                  <td className="py-2 px-3.5 text-right text-slate-700 dark:text-neutral-300">{formatNumber(row.impressions)}</td>
                  <td className="py-2 px-3.5 text-right text-slate-400 dark:text-neutral-500">{formatNumber(row.requests)}</td>
                  <td className="py-2 px-3.5 text-right text-slate-700 dark:text-neutral-300">{formatNumber(row.clicks)}</td>
                  <td className="py-2 px-3.5 text-right text-slate-700 dark:text-neutral-300">{formatCurrency(row.cpm)}</td>
                  <td className="py-2 px-3.5 text-right font-medium text-slate-900 dark:text-white">{formatCurrency(row.money)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="px-3.5 py-2 border-t border-slate-200 dark:border-neutral-850 flex items-center justify-between text-xs text-slate-500 dark:text-neutral-400">
          <span className="font-mono text-[11px]">
            {currentPage} / {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2 py-0.5 text-xs text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
            >
              Prev
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2 py-0.5 text-xs text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

