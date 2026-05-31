import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";

import { Layout, MinimalLayout } from "@/components/Layout";
import { ProgressBar } from "@/components/ProgressBar";
import { AdblockBanner } from "@/components/AdblockBanner";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// ── Lazy page imports ─────────────────────────────────────────────────
const Home         = lazy(() => import("@/pages/home"));
const Browse       = lazy(() => import("@/pages/browse"));
const AnimeDetail  = lazy(() => import("@/pages/anime-detail"));
const Watch        = lazy(() => import("@/pages/watch"));
const Watchlist    = lazy(() => import("@/pages/watchlist"));
const Challenges   = lazy(() => import("@/pages/challenges"));
const Leaderboard  = lazy(() => import("@/pages/leaderboard"));
const Community    = lazy(() => import("@/pages/community"));
const Profile      = lazy(() => import("@/pages/profile"));
const Creator      = lazy(() => import("@/pages/creator"));
const Login        = lazy(() => import("@/pages/auth/login"));
const Signup       = lazy(() => import("@/pages/auth/signup"));
const Admin        = lazy(() => import("@/pages/admin"));
const NotFound     = lazy(() => import("@/pages/not-found"));
const Genre        = lazy(() => import("@/pages/genre"));
const Search       = lazy(() => import("@/pages/search"));
const Schedule     = lazy(() => import("@/pages/schedule"));
const AZList       = lazy(() => import("@/pages/az-list"));
const Stats        = lazy(() => import("@/pages/stats"));
const Achievements = lazy(() => import("@/pages/achievements"));
const Mood         = lazy(() => import("@/pages/mood"));
const HiddenGems   = lazy(() => import("@/pages/hidden-gems"));
const Quiz         = lazy(() => import("@/pages/quiz"));
const Category     = lazy(() => import("@/pages/category"));
const DMCA         = lazy(() => import("@/pages/dmca"));
const Terms        = lazy(() => import("@/pages/terms"));
const Contact      = lazy(() => import("@/pages/contact"));

// ── Query client ──────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 300_000,
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});

// ── Scroll to top on route change ─────────────────────────────────────
function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); }, [location]);
  return null;
}

// ── Shared Suspense fallback ──────────────────────────────────────────
function PageFallback() {
  return (
    <Layout>
      <LoadingSkeleton />
    </Layout>
  );
}

// ── Stable named route components ─────────────────────────────────────
function HomeRoute()         { return <Layout><Home /></Layout>; }
function BrowseRoute()       { return <Layout><Browse /></Layout>; }
function AnimeRoute()        { return <Layout><AnimeDetail /></Layout>; }
function WatchlistRoute()    { return <Layout><Watchlist /></Layout>; }
function ChallengesRoute()   { return <Layout><Challenges /></Layout>; }
function LeaderboardRoute()  { return <Layout><Leaderboard /></Layout>; }
function CommunityRoute()    { return <Layout><Community /></Layout>; }
function ProfileRoute()      { return <Layout><Profile /></Layout>; }
function CreatorRoute()      { return <Layout><Creator /></Layout>; }
function GenreRoute()        { return <Layout><Genre /></Layout>; }
function SearchRoute()       { return <Layout><Search /></Layout>; }
function ScheduleRoute()     { return <Layout><Schedule /></Layout>; }
function AZListRoute()       { return <Layout><AZList /></Layout>; }
function StatsRoute()        { return <Layout><Stats /></Layout>; }
function AchievementsRoute() { return <Layout><Achievements /></Layout>; }
function MoodRoute()         { return <Layout><Mood /></Layout>; }
function HiddenGemsRoute()   { return <Layout><HiddenGems /></Layout>; }
function QuizRoute()         { return <Layout><Quiz /></Layout>; }
function CategoryRoute()     { return <Layout><Category /></Layout>; }
function DMCARoute()         { return <Layout><DMCA /></Layout>; }
function TermsRoute()        { return <Layout><Terms /></Layout>; }
function ContactRoute()      { return <Layout><Contact /></Layout>; }
function NotFoundRoute()     { return <Layout><NotFound /></Layout>; }
function WatchRoute()        { return <MinimalLayout><Watch /></MinimalLayout>; }
function LoginRoute()        { return <MinimalLayout><Login /></MinimalLayout>; }
function SignupRoute()        { return <MinimalLayout><Signup /></MinimalLayout>; }

// ── Router ─────────────────────────────────────────────────────────────
function Router() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Switch>
        <Route path="/"                   component={HomeRoute} />
        <Route path="/browse"             component={BrowseRoute} />
        <Route path="/anime/:id"          component={AnimeRoute} />
        <Route path="/watch/:id/:ep"      component={WatchRoute} />
        <Route path="/login"              component={LoginRoute} />
        <Route path="/signup"             component={SignupRoute} />
        <Route path="/watchlist"          component={WatchlistRoute} />
        <Route path="/challenges"         component={ChallengesRoute} />
        <Route path="/leaderboard"        component={LeaderboardRoute} />
        <Route path="/community"          component={CommunityRoute} />
        <Route path="/profile"            component={ProfileRoute} />
        <Route path="/creator/:username"  component={CreatorRoute} />
        <Route path="/genre/:id"          component={GenreRoute} />
        <Route path="/search"             component={SearchRoute} />
        <Route path="/schedule"           component={ScheduleRoute} />
        <Route path="/az-list"            component={AZListRoute} />
        <Route path="/stats"              component={StatsRoute} />
        <Route path="/achievements"       component={AchievementsRoute} />
        <Route path="/mood"               component={MoodRoute} />
        <Route path="/hidden-gems"        component={HiddenGemsRoute} />
        <Route path="/quiz"               component={QuizRoute} />
        <Route path="/category/:slug"     component={CategoryRoute} />
        <Route path="/dmca"               component={DMCARoute} />
        <Route path="/terms"              component={TermsRoute} />
        <Route path="/contact"            component={ContactRoute} />
        <Route path="/admin"              component={Admin} />
        <Route                            component={NotFoundRoute} />
      </Switch>
    </Suspense>
  );
}

// ── App root ──────────────────────────────────────────────────────────
function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
              <ScrollToTop />
              <ProgressBar />
              <AdblockBanner />
              <Router />
            </WouterRouter>
            <Toaster theme="dark" position="bottom-right" />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
