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

const Home = lazy(() => import("@/pages/home"));
const Browse = lazy(() => import("@/pages/browse"));
const AnimeDetail = lazy(() => import("@/pages/anime-detail"));
const Watch = lazy(() => import("@/pages/watch"));
const Watchlist = lazy(() => import("@/pages/watchlist"));
const Challenges = lazy(() => import("@/pages/challenges"));
const Leaderboard = lazy(() => import("@/pages/leaderboard"));
const Community = lazy(() => import("@/pages/community"));
const Profile = lazy(() => import("@/pages/profile"));
const Creator = lazy(() => import("@/pages/creator"));
const Login = lazy(() => import("@/pages/auth/login"));
const Signup = lazy(() => import("@/pages/auth/signup"));
const Admin = lazy(() => import("@/pages/admin"));
const NotFound = lazy(() => import("@/pages/not-found"));
const Genre = lazy(() => import("@/pages/genre"));
const Search = lazy(() => import("@/pages/search"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 300_000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  return null;
}

// ── Stable route components (not inline arrows — those remount on every render) ──
const HomeRoute       = () => <Layout><Home /></Layout>;
const BrowseRoute     = () => <Layout><Browse /></Layout>;
const AnimeRoute      = () => <Layout><AnimeDetail /></Layout>;
const WatchlistRoute  = () => <Layout><Watchlist /></Layout>;
const ChallengesRoute = () => <Layout><Challenges /></Layout>;
const LeaderboardRoute= () => <Layout><Leaderboard /></Layout>;
const CommunityRoute  = () => <Layout><Community /></Layout>;
const ProfileRoute    = () => <Layout><Profile /></Layout>;
const CreatorRoute    = () => <Layout><Creator /></Layout>;
const GenreRoute      = () => <Layout><Genre /></Layout>;
const SearchRoute     = () => <Layout><Search /></Layout>;
const WatchRoute      = () => <MinimalLayout><Watch /></MinimalLayout>;
const LoginRoute      = () => <MinimalLayout><Login /></MinimalLayout>;
const SignupRoute      = () => <MinimalLayout><Signup /></MinimalLayout>;
const NotFoundRoute   = () => <Layout><NotFound /></Layout>;

function Router() {
  return (
    <Suspense fallback={
      <Layout>
        <LoadingSkeleton />
      </Layout>
    }>
      <Switch>
        <Route path="/"                  component={HomeRoute} />
        <Route path="/browse"            component={BrowseRoute} />
        <Route path="/anime/:id"         component={AnimeRoute} />
        <Route path="/watch/:id/:ep"     component={WatchRoute} />
        <Route path="/login"             component={LoginRoute} />
        <Route path="/signup"            component={SignupRoute} />
        <Route path="/watchlist"         component={WatchlistRoute} />
        <Route path="/challenges"        component={ChallengesRoute} />
        <Route path="/leaderboard"       component={LeaderboardRoute} />
        <Route path="/community"         component={CommunityRoute} />
        <Route path="/profile"           component={ProfileRoute} />
        <Route path="/creator/:username" component={CreatorRoute} />
        <Route path="/genre/:id"         component={GenreRoute} />
        <Route path="/search"            component={SearchRoute} />
        <Route path="/admin"             component={Admin} />
        <Route                           component={NotFoundRoute} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
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
