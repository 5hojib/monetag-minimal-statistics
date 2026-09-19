import { useState, useEffect, useMemo, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { useTouchSwipe } from './hooks/useTouchSwipe';
import { AnimatePresence, motion } from 'motion/react';
import Header from './components/Header';
import PullToRefresh from './components/PullToRefresh';
import BottomNav, { TabId } from './components/BottomNav';
import EarningsHighlight from './components/EarningsHighlight';
import ChartsSection from './components/ChartsSection';
import DailyStatsTable from './components/DailyStatsTable';
import SettingsPage from './components/SettingsPage';
import OnboardingScreen from './components/OnboardingScreen';
import { useSettingsContext } from './context/SettingsContext';

import { StatItem } from './types';
import {
  getISODateString,
  calculateCpm,
  addDaysISO,
  getMissingDates,
  groupConsecutiveRanges,
} from './utils/formatters';
import { getAllStatistics } from './api/client';
import { getDayIndex, mergeDayIndex } from './utils/apiCache';
import { syncBalanceWidget } from './wiring/balanceWidget';

// How far back the app keeps an up-to-date rolling index without the user
// explicitly running "Load all data". Anything older than this is preserved
// in cache but only refreshed when the corresponding days are missing.
const SYNC_WINDOW_DAYS = 30;

// Pull-to-refresh always re-fetches this many most-recent days (the tail),
// because today/yesterday figures change as Monetag settles each day. Days
// further back are only fetched when they are missing from the cache.
const TAIL_DAYS = 3;

// Monetag holds the last 4 days of a publisher's earnings. These DAYS are
// rolling calendar days (running date), so we always sum exactly 4 distinct
// dates ending at the newest known day — never 4 arbitrary rows (which could
// span 5 calendar days and over-count the held balance).
const HOLD_DAYS = 4;

export default function App() {
  const { settings } = useSettingsContext();
  const apiKey = settings.apiKey.trim();
  const hasKey = apiKey.length > 0;

  // Bottom navigation
  const [tab, setTab] = useState<TabId>('home');

  // Left/right swipe moves between tabs (home → daily → graph → settings)
  const TAB_ORDER: TabId[] = ['home', 'daily', 'graph', 'settings'];
  const handleSwipe = useCallback((dir: 'left' | 'right') => {
    setTab(tab => {
      const idx = TAB_ORDER.indexOf(tab);
      const next = dir === 'left' ? idx + 1 : idx - 1;
      return next >= 0 && next < TAB_ORDER.length ? TAB_ORDER[next] : tab;
    });
  }, []);
  useTouchSwipe(handleSwipe);

  // Single source of truth: the cached day-index for this API key.
  // Every filter/range is sliced from this index — no API round trip.
  const [dayIndex, setDayIndex] = useState<StatItem[]>([]);

  // Metadata
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Loading & error
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showingCached, setShowingCached] = useState(false);

  // Pull-to-refresh / "load all" re-rolls the odometers even when the
  // displayed values did not change. Bumping this key replays every roll.
  const [replayKey, setReplayKey] = useState(0);

  // Settings-driven account info
  const totalWithdrawals = settings.totalWithdrawals;
  const maskedKey = hasKey
    ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`
    : null;

  // "Load all data" progress (mirrored into the Settings page)
  const [loadAllLoading, setLoadAllLoading] = useState(false);
  const [loadAllMessage, setLoadAllMessage] = useState<string | null>(null);

  // First render: hydrate state from localStorage so the dashboard paints
  // instantly from cache, then top up only the missing recent days.
  useEffect(() => {
    if (!hasKey) return;
    setDayIndex(getDayIndex(apiKey));
  }, [hasKey, apiKey]);

  // Incremental sync — the network path for pull-to-refresh and the initial
  // top-up. Always pulls the most recent TAIL_DAYS (so Today/Yesterday stay
  // current as Monetag settles), then backfills any other days missing from
  // the cache within the rolling SYNC_WINDOW_DAYS window. Older cached days
  // are left untouched here; the Settings "Load all data" button backfills
  // them instead.
  const syncStatistics = useCallback(async () => {
    if (!hasKey) return;

    const today = getISODateString(new Date());
    const syncFrom = addDaysISO(today, -(SYNC_WINDOW_DAYS - 1));
    const known = getDayIndex(apiKey).map(r => r.date_time).filter(Boolean) as string[];

    // The tail is always re-fetched to pick up settling today/yesterday data.
    const tailFrom = addDaysISO(today, -(TAIL_DAYS - 1));
    const tailDates: string[] = [];
    for (let d = tailFrom; d <= today; d = addDaysISO(d, 1)) tailDates.push(d);

    const missing = getMissingDates(syncFrom, today, known);
    const toFetch = [...new Set([...tailDates, ...missing])].sort();

    let latestFetchError: string | null = null;

    if (toFetch.length > 0) {
      // Only the needed days are fetched, grouped into contiguous ranges so
      // consecutive gaps cost a single API call each.
      const ranges = groupConsecutiveRanges(toFetch);
      for (const range of ranges) {
        const res = await getAllStatistics({
          date_from: range.from,
          date_to: range.to,
          page: 1,
          page_size: 500,
          group_by: ['date_time'],
        });
        if (res.ok && res.data) {
          const merged = mergeDayIndex(apiKey, res.data.result ?? []);
          setDayIndex(merged);
        } else {
          latestFetchError = res.error ?? 'Failed to fetch statistics from Monetag';
        }
      }
    }

    if (latestFetchError) {
      setError(latestFetchError);
      setShowingCached(getDayIndex(apiKey).length > 0);
    } else {
      setError(null);
      setShowingCached(false);
      setLastUpdated(new Date());
    }
    setIsLoading(false);
    setReplayKey(k => k + 1);
  }, [hasKey, apiKey]);

  // Initial top-up on mount, and every time the API key changes.
  useEffect(() => {
    if (!hasKey) return;
    syncStatistics();
  }, [hasKey, apiKey, syncStatistics]);

  // Compute Today & Yesterday metrics from the cache (independent of any
  // visible range on the charts or daily table).
  const todayStr = useMemo(() => getISODateString(new Date()), []);
  const yesterdayStr = useMemo(() => addDaysISO(todayStr, -1), [todayStr]);

  const todayStat = dayIndex.find(s => s.date_time === todayStr);
  const yesterdayStat = dayIndex.find(s => s.date_time === yesterdayStr);

  const todayMoney = todayStat ? (parseFloat(String(todayStat.money)) || 0) : 0;
  const todayImpressions = todayStat ? (parseInt(String(todayStat.impressions), 10) || 0) : 0;
  const todayCpm = calculateCpm(todayMoney, todayImpressions);

  const yesterdayMoney = yesterdayStat ? (parseFloat(String(yesterdayStat.money)) || 0) : 0;
  const yesterdayImpressions = yesterdayStat ? (parseInt(String(yesterdayStat.impressions), 10) || 0) : 0;
  const yesterdayCpm = calculateCpm(yesterdayMoney, yesterdayImpressions);

  // Lifetime earnings = total earnings across the cached day index (complete
  // after the user runs "Load all data" in Settings).
  const effectiveLifetimeEarnings = useMemo(() => {
    return dayIndex.reduce((acc, s) => acc + (parseFloat(String(s.money)) || 0), 0);
  }, [dayIndex]);

  // Current Balance = Total Lifetime Earnings - Total Withdrawals
  const currentBalance = effectiveLifetimeEarnings - totalWithdrawals;

  // Held balance = the last HOLD_DAYS *calendar days* of earnings ending at
  // the newest known day. Exactly the running-date window Monetag withholds —
  // never the last-N rows (which could straddle 5 calendar days).
  const heldBalance = useMemo(() => {
    if (dayIndex.length === 0) return 0;
    const newestStr = dayIndex[dayIndex.length - 1].date_time;
    if (!newestStr) return 0;

    const byDate = new Map<string, number>();
    for (const s of dayIndex) {
      if (s.date_time !== undefined) {
        byDate.set(s.date_time, parseFloat(String(s.money)) || 0);
      }
    }

    let held = 0;
    for (let i = 0; i < HOLD_DAYS; i++) {
      held += byDate.get(addDaysISO(newestStr, -i)) ?? 0;
    }
    return held;
  }, [dayIndex]);

  const approvedBalance = Math.max(0, currentBalance - heldBalance);

  // Keep the Android home-screen balance widget in sync with the latest
  // figures whenever the cached data or withdrawals change.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    syncBalanceWidget({
      today: todayMoney,
      yesterday: yesterdayMoney,
      balance: currentBalance,
    });
  }, [todayMoney, yesterdayMoney, currentBalance]);

  // "Load all data" — backfill the entire history into the cache.
  const handleLoadAllData = useCallback(async () => {
    if (!hasKey) return;
    setLoadAllLoading(true);
    setLoadAllMessage(null);
    try {
      const today = getISODateString(new Date());
      const res = await getAllStatistics({
        date_from: '2024-01-01',
        date_to: today,
        page: 1,
        page_size: 500,
        group_by: ['date_time'],
      });
      if (res.ok && res.data) {
        const merged = mergeDayIndex(apiKey, res.data.result ?? []);
        setDayIndex(merged);
        setLastUpdated(new Date());
        setError(null);
        setShowingCached(false);
        setReplayKey(k => k + 1);
        setLoadAllMessage(`Cached ${merged.length} days of history.`);
      } else {
        setLoadAllMessage(`Failed: ${res.error ?? 'unknown error'}`);
      }
    } catch (err: any) {
      setLoadAllMessage(`Failed: ${err?.message ?? 'unknown error'}`);
    } finally {
      setLoadAllLoading(false);
    }
  }, [hasKey, apiKey]);

  const loadingPanel = (
    <div className="bg-white dark:bg-black rounded-2xl p-8 text-center text-xs text-slate-400 dark:text-neutral-500 font-mono">
      Loading analytics...
    </div>
  );

  const isEmpty = dayIndex.length === 0 && !isLoading;
  const emptyPanel = (
    <div className="bg-white dark:bg-black rounded-2xl p-6 text-center text-xs text-slate-400 dark:text-neutral-500 font-mono">
      No data cached yet — pull to refresh to fetch your last 30 days.
    </div>
  );

  // Fresh installs have no API key yet — ask for it (and withdrawals) before
  // showing the dashboard, instead of relying on a bundled key.
  if (!hasKey) {
    return <OnboardingScreen />;
  }

  return (
    <PullToRefresh onRefresh={syncStatistics}>
      <div className="min-h-screen bg-slate-50 dark:bg-black text-slate-800 dark:text-neutral-100 flex flex-col font-sans antialiased transition-colors selection:bg-slate-200 selection:text-slate-900 dark:selection:bg-neutral-800 dark:selection:text-neutral-100">
        {/* Top Application Bar */}
        <Header
          lastUpdated={lastUpdated}
          hasKey={hasKey}
          maskedKey={maskedKey}
        />

        {/* Main Container */}
        <main
          className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-3 space-y-3"
          style={{ paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}
        >
          {/* Error Notification Banner */}
          {error && tab !== 'settings' && (
            <div className="p-3 rounded-xl bg-slate-100 dark:bg-neutral-900 flex items-center justify-between gap-3 text-slate-800 dark:text-neutral-200 text-xs">
              <div>
                <span className="font-semibold">Error: </span>
                <span className="font-mono text-[11px]">{error}</span>
              </div>
              <button
                onClick={syncStatistics}
                className="px-2 py-1 bg-white dark:bg-black border border-slate-300 dark:border-neutral-600 rounded text-slate-900 dark:text-neutral-100 font-medium text-xs hover:bg-slate-50 dark:hover:bg-neutral-800 cursor-pointer shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {/* Offline Cached Data Indicator */}
          {showingCached && !error && tab !== 'settings' && (
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-neutral-900 flex items-center justify-between gap-3 text-slate-500 dark:text-neutral-400 text-[11px] font-mono">
              <span>
                Offline — showing cached data.
                {lastUpdated && ` Last synced ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`}
              </span>
            </div>
          )}

          {/* Tab content with smooth transitions */}
          <AnimatePresence mode="wait" initial={false}>
            {tab === 'home' && (
              <motion.div
                key="home"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="space-y-3"
              >
                <EarningsHighlight
                  currentBalance={currentBalance}
                  effectiveLifetimeEarnings={effectiveLifetimeEarnings}
                  totalWithdrawals={totalWithdrawals}
                  heldBalance={heldBalance}
                  approvedBalance={approvedBalance}
                  todayMoney={todayMoney}
                  todayImpressions={todayImpressions}
                  todayCpm={todayCpm}
                  todayDate={todayStr}
                  yesterdayMoney={yesterdayMoney}
                  yesterdayImpressions={yesterdayImpressions}
                  yesterdayCpm={yesterdayCpm}
                  yesterdayDate={yesterdayStr}
                  replay={replayKey}
                />
              </motion.div>
            )}

            {tab === 'graph' && (
              <motion.div
                key="graph"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="space-y-3"
              >
                {isLoading && dayIndex.length === 0 && !error ? loadingPanel : isEmpty ? emptyPanel : <ChartsSection stats={dayIndex} />}
              </motion.div>
            )}

            {tab === 'daily' && (
              <motion.div
                key="daily"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="space-y-3"
              >
                <DailyStatsTable stats={dayIndex} />
              </motion.div>
            )}

            {tab === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <SettingsPage
                  onLoadAllData={handleLoadAllData}
                  loadAllLoading={loadAllLoading}
                  loadAllMessage={loadAllMessage}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Bottom Navigation */}
        <BottomNav activeTab={tab} onTabChange={setTab} />
      </div>
    </PullToRefresh>
  );
}