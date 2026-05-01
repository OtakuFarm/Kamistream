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

function Router() {
  return (
    <Suspense fallback={
      <Layout>
        <LoadingSkeleton />
      </Layout>
    }>
      <Switch>
        <Route path="/" component={() => <Layout><Home /></Layout>} />
        <Route path="/browse" component={() => <Layout><Browse /></Layout>} />
        <Route path="/anime/:id" component={() => <Layout><AnimeDetail /></Layout>} />
        
        {/* Minimal Layout for watch & auth */}
        <Route path="/watch/:id/:ep" component={() => <MinimalLayout><Watch /></MinimalLayout>} />
        <Route path="/login" component={() => <MinimalLayout><Login /></MinimalLayout>} />
        <Route path="/signup" component={() => <MinimalLayout><Signup /></MinimalLayout>} />
        
        {/* Standard Layout for others */}
        <Route path="/watchlist" component={() => <Layout><Watchlist /></Layout>} />
        <Route path="/challenges" component={() => <Layout><Challenges /></Layout>} />
        <Route path="/leaderboard" component={() => <Layout><Leaderboard /></Layout>} />
        <Route path="/community" component={() => <Layout><Community /></Layout>} />
        <Route path="/profile" component={() => <Layout><Profile /></Layout>} />
        <Route path="/creator/:username" component={() => <Layout><Creator /></Layout>} />
        
        {/* Admin has its own full-page layout embedded in the component */}
        <Route path="/admin" component={Admin} />
        
        <Route component={() => <Layout><NotFound /></Layout>} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
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
  );
}

export default App;
