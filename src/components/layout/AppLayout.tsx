
'use client';

import React, { useState, useEffect, type ReactNode, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js'; // Added AuthChangeEvent
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { SidebarNav } from './SidebarNav';
import { Logo } from '../icons/Logo';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';
import { LogOut, Loader2, Settings, CreditCard, Home } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Around } from "@theme-toggles/react"
import "@theme-toggles/react/css/Around.css"
import { cn } from '@/lib/utils';
import { SidebarUsageProgress } from './SidebarUsageProgress';
import type { JobOpening, UserSettings } from '@/lib/types';
import { OnboardingForm } from '@/components/onboarding/OnboardingForm';

const PUBLIC_PATHS = ['/landing', '/auth', '/pricing', '/about', '/contact', '/careers', '/partner-with-us', '/privacy-policy', '/terms-and-conditions'];
const BLOG_PATHS_REGEX = /^\/blog(\/.*)?$/;
const HIDE_DASHBOARD_LINK_PATHS = ['/', '/job-openings', '/contacts', '/companies', '/settings/billing', '/settings/account'];


function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const names = name.split(' ').filter(Boolean);
    if (names.length >= 2) {
      return `${names[0][0]}${names[1][0]}`.toUpperCase();
    } else if (names.length === 1 && names[0].length > 0) {
      return names[0].substring(0, 2).toUpperCase();
    }
  }
  if (email) {
    const emailPrefix = email.split('@')[0];
    if (emailPrefix.length >= 2) {
      return emailPrefix.substring(0, 2).toUpperCase();
    } else if (emailPrefix.length === 1) {
      return emailPrefix.toUpperCase();
    }
  }
  return 'U';
}


export function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [theme, setTheme] = React.useState<'light' | 'dark'>('light');
  const [favoriteJobOpenings, setFavoriteJobOpenings] = useState<JobOpening[]>([]);
  const [showOnboardingForm, setShowOnboardingForm] = useState(false);
  const [onboardingCheckComplete, setOnboardingCheckComplete] = useState(false);
  const previousUserIdRef = useRef<string | undefined>();

  const isPublicPath = PUBLIC_PATHS.includes(pathname) || BLOG_PATHS_REGEX.test(pathname);
  console.log(`[AppLayout] Render. Path: ${pathname}, IsPublic: ${isPublicPath}`);
  console.log(`[AppLayout] Current states: isLoadingAuth: ${isLoadingAuth}, isLoadingSettings: ${isLoadingSettings}, user: ${user?.id}, userSettings: ${!!userSettings}, showOnboardingForm: ${showOnboardingForm}, onboardingCheckComplete: ${onboardingCheckComplete}`);


  const fetchUserDataAndSettings = useCallback(async (userId: string) => {
    console.log(`[AppLayout fetchUserDataAndSettings] Called for user: ${userId}. Setting isLoadingSettings: true, setOnboardingCheckComplete: false`);
    setIsLoadingSettings(true);
    setOnboardingCheckComplete(false);
    try {
      console.log(`[AppLayout fetchUserDataAndSettings] Fetching settings and favorites for user: ${userId}`);
      const [settingsResult, favoritesResult] = await Promise.all([
        supabase.from('user_settings').select('*').eq('user_id', userId).single(),
        supabase.from('job_openings').select('id, role_title, company_name_cache, favorited_at, is_favorite').eq('user_id', userId).eq('is_favorite', true).order('favorited_at', { ascending: true, nulls: 'last' })
      ]);
      console.log(`[AppLayout fetchUserDataAndSettings] API calls completed for user: ${userId}`);

      const { data: settingsData, error: settingsError } = settingsResult;
      console.log(`[AppLayout fetchUserDataAndSettings] Settings result: data: ${!!settingsData}, error:`, settingsError);


      if (settingsError && settingsError.code !== 'PGRST116') {
        console.error("[AppLayout fetchUserDataAndSettings] Error fetching user settings (non-PGRST116):", settingsError);
        toast({ title: 'Profile Load Error', description: `Could not load profile. (Code: ${settingsError.code})`, variant: 'destructive', duration: 7000 });
        setShowOnboardingForm(false);
      } else if (!settingsData && (!settingsError || settingsError.code !== 'PGRST116')) {
        console.error("[AppLayout fetchUserDataAndSettings] Unexpected: No settings data and no (or non-PGRST116) error. Potential issue with SELECT query or RLS.", settingsError);
        toast({ title: 'Profile Access Issue', description: 'Could not verify your profile settings. Please try again or contact support.', variant: 'destructive', duration: 7000 });
        setShowOnboardingForm(false);
      } else {
        const fetchedSettings = settingsData as UserSettings | null;
        setUserSettings(fetchedSettings);
        console.log(`[AppLayout fetchUserDataAndSettings] User settings set:`, fetchedSettings);
        if (!fetchedSettings || fetchedSettings.onboarding_complete === false || fetchedSettings.onboarding_complete === null) {
          console.log(`[AppLayout fetchUserDataAndSettings] Onboarding not complete or settings missing. setShowOnboardingForm: true`);
          setShowOnboardingForm(true);
        } else {
          console.log(`[AppLayout fetchUserDataAndSettings] Onboarding complete. setShowOnboardingForm: false`);
          setShowOnboardingForm(false);
        }
      }

      const { data: favoritesData, error: favoritesError } = favoritesResult;
      console.log(`[AppLayout fetchUserDataAndSettings] Favorites result: data: ${!!favoritesData}, error:`, favoritesError);
      if (favoritesError) {
         console.error("[AppLayout fetchUserDataAndSettings] Error fetching favorite job openings:", favoritesError.message);
         setFavoriteJobOpenings([]);
      } else {
         setFavoriteJobOpenings(favoritesData as JobOpening[] || []);
      }

    } catch (error: any) {
      console.error("[AppLayout fetchUserDataAndSettings] CATCH BLOCK ERROR:", error);
      if (error.name === 'AuthApiError' && error.message.includes('Invalid Refresh Token')) {
        console.log("[AppLayout fetchUserDataAndSettings] Invalid Refresh Token detected. Signing out.");
        toast({
          title: 'Session Invalid',
          description: 'Your session is invalid. Please sign in again.',
          variant: 'destructive',
        });
        await supabase.auth.signOut();
      } else {
        toast({ title: 'Error fetching user data', description: error.message, variant: 'destructive' });
      }
      setUserSettings(null);
      setShowOnboardingForm(false);
      setFavoriteJobOpenings([]);
    } finally {
      console.log(`[AppLayout fetchUserDataAndSettings] FINALLY block. Setting isLoadingSettings: false, setOnboardingCheckComplete: true`);
      setIsLoadingSettings(false);
      setOnboardingCheckComplete(true);
    }
  }, [toast]);


  const processUserSession = useCallback(async (sessionUser: User | null) => {
    const currentPreviousUserId = previousUserIdRef.current;
    const newUserId = sessionUser?.id;
    console.log(`[AppLayout processUserSession] Called. newUserId: ${newUserId}, currentPreviousUserId: ${currentPreviousUserId}`);

    setUser(sessionUser); // Update user state first

    if (newUserId !== currentPreviousUserId) {
      console.log(`[AppLayout processUserSession] User ID changed or first load. Old: ${currentPreviousUserId}, New: ${newUserId}. Resetting related states.`);
      previousUserIdRef.current = newUserId;
      setFavoriteJobOpenings([]);
      setUserSettings(null);
      setShowOnboardingForm(false);
      setOnboardingCheckComplete(false);
      setIsLoadingSettings(true); // Set loading true before potential fetch

      if (sessionUser) {
        console.log(`[AppLayout processUserSession] New user session. Calling fetchUserDataAndSettings for ${newUserId}`);
        await fetchUserDataAndSettings(sessionUser.id);
      } else {
        console.log(`[AppLayout processUserSession] No user session (user is null). Setting loading states to false.`);
        setIsLoadingSettings(false);
        setOnboardingCheckComplete(true);
      }
    } else if (!sessionUser) {
        console.log(`[AppLayout processUserSession] No user session (user is null and was already null or unchanged). Setting loading states to false.`);
        setIsLoadingSettings(false);
        setOnboardingCheckComplete(true);
    } else {
      console.log(`[AppLayout processUserSession] User ID did not change (${newUserId}). No state reset needed. isLoadingSettings: ${isLoadingSettings}, onboardingCheckComplete: ${onboardingCheckComplete}`);
      // If user is the same and settings haven't been loaded (e.g., due to a fast reload interrupting previous fetch),
      // and we are not already loading settings, then fetch them.
      if (sessionUser && !userSettings && !isLoadingSettings && !onboardingCheckComplete) {
        console.log(`[AppLayout processUserSession] User same, but settings not loaded and not currently loading. Re-initiating fetch for ${newUserId}.`);
        await fetchUserDataAndSettings(sessionUser.id);
      }
    }
    console.log(`[AppLayout processUserSession] Setting isLoadingAuth: false`);
    setIsLoadingAuth(false);

  }, [fetchUserDataAndSettings, userSettings, isLoadingSettings, onboardingCheckComplete]); // Added userSettings, isLoadingSettings, onboardingCheckComplete

  useEffect(() => {
    console.log("[AppLayout Main Auth useEffect] Running.");
    const storedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = storedTheme || (systemPrefersDark ? 'dark' : 'light');
    setTheme(initialTheme);
    document.documentElement.classList.toggle('dark', initialTheme === 'dark');
    console.log(`[AppLayout Main Auth useEffect] Initial theme set to: ${initialTheme}`);
    setIsLoadingAuth(true); // Set loading true at the start of effect

    const handleSessionResult = async (session: Session | null, error?: any) => {
      console.log(`[AppLayout Main Auth useEffect - handleSessionResult] Session: ${!!session}, Error:`, error);
      if (error) {
        console.error("[AppLayout handleSessionResult] Error processing session:", error);
        if (error.name === 'AuthApiError' && error.message.includes("Invalid Refresh Token")) {
          toast({
            title: 'Session Invalid',
            description: 'Your session is invalid. Please sign in again.',
            variant: 'destructive',
          });
          await supabase.auth.signOut();
          return;
        }
      }
      await processUserSession(session?.user ?? null);
    };

    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        console.log("[AppLayout Main Auth useEffect] getSession() promise resolved.");
        handleSessionResult(session, error);
      })
      .catch((catchError) => {
        console.error("[AppLayout Main Auth useEffect] getSession() promise REJECTED:", catchError);
        handleSessionResult(null, catchError);
      });


    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        console.log(`[AppLayout onAuthStateChange] Event: ${event}, Session User ID: ${session?.user?.id}`);
        if (event === 'TOKEN_REFRESHED' && !session) {
          console.warn("[AppLayout onAuthStateChange] TOKEN_REFRESHED but no session. Potential invalid session.");
          toast({
            title: 'Session Expired',
            description: 'Your session has expired. Please sign in again.',
            variant: 'destructive',
          });
        } else if (event === 'SIGNED_OUT') {
           console.log("[AppLayout onAuthStateChange] SIGNED_OUT event.");
           const activeToasts = toast.toasts || [];
           if (!activeToasts.some(t => t.title === 'Session Expired' || t.title === 'Session Invalid')) {
             toast({ title: 'Signed Out', description: 'You have been signed out.' });
           }
        }
        await processUserSession(session?.user ?? null);
      }
    );
    console.log("[AppLayout Main Auth useEffect] Subscribed to onAuthStateChange.");

    return () => {
      console.log("[AppLayout Main Auth useEffect] Unsubscribing from onAuthStateChange.");
      subscription?.unsubscribe();
    };
  }, [processUserSession, toast]);

  useEffect(() => {
    console.log(`[AppLayout Redirect useEffect] Running. isLoadingAuth: ${isLoadingAuth}, isPublicPath: ${isPublicPath}, user: ${!!user}, userSettings.onboarding_complete: ${userSettings?.onboarding_complete}, pathname: ${pathname}`);
    if (!isLoadingAuth && !isPublicPath) {
      if (!user) {
        console.log("[AppLayout Redirect useEffect] Not authenticated and not public path. Redirecting to /landing.");
        router.push('/landing');
      }
    } else if (!isLoadingAuth && user && userSettings?.onboarding_complete && isPublicPath && !BLOG_PATHS_REGEX.test(pathname)) {
      console.log("[AppLayout Redirect useEffect] Authenticated, onboarding complete, on public non-blog path. Redirecting to /.");
      router.push('/');
    }
  }, [user, isLoadingAuth, isPublicPath, pathname, router, userSettings]);


  const handleSignOut = async () => {
    console.log("[AppLayout handleSignOut] Initiated.");
    setIsLoadingAuth(true);
    await supabase.auth.signOut();
    console.log("[AppLayout handleSignOut] Supabase signOut complete.");
  };

  const handleOnboardingComplete = async () => {
    console.log("[AppLayout handleOnboardingComplete] Initiated.");
    setShowOnboardingForm(false);
    if (user) {
      console.log("[AppLayout handleOnboardingComplete] User exists, re-fetching user data and settings.");
      await fetchUserDataAndSettings(user.id);
    }
  };

  const toggleTheme = () => {
    setTheme(prevTheme => {
        const newTheme = prevTheme === 'light' ? 'dark' : 'light';
        document.documentElement.classList.toggle('dark', newTheme === 'dark');
        localStorage.setItem('theme', newTheme);
        console.log(`[AppLayout toggleTheme] Theme changed to: ${newTheme}`);
        return newTheme;
    });
  };

  const isAppLoading = isLoadingAuth || (user != null && (isLoadingSettings || !onboardingCheckComplete));
  console.log(`[AppLayout] Calculated isAppLoading: ${isAppLoading} (isLoadingAuth: ${isLoadingAuth}, user: ${!!user}, isLoadingSettings: ${isLoadingSettings}, !onboardingCheckComplete: ${!onboardingCheckComplete})`);


  if (isPublicPath) {
     console.log("[AppLayout] Rendering public path children directly.");
     return <>{children}</>;
  }

  if (isAppLoading) {
    console.log("[AppLayout] Rendering main app loader because isAppLoading is true.");
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }


  if (onboardingCheckComplete && showOnboardingForm && user) {
    console.log("[AppLayout] Rendering OnboardingForm.");
    return (
         <OnboardingForm
              user={user}
              userId={user.id}
              userEmail={user.email}
              initialFullName={user.user_metadata?.full_name || user.email || ''}
              existingSettings={userSettings}
              onOnboardingComplete={handleOnboardingComplete}
            />
    );
  }
  console.log("[AppLayout] Rendering main SidebarProvider layout.");

  const userDisplayNameToShow = userSettings?.full_name || user?.user_metadata?.full_name || user?.email || 'User';
  const userInitials = getInitials(userDisplayNameToShow, user?.email);
  const showDashboardLinkInMenu = !HIDE_DASHBOARD_LINK_PATHS.includes(pathname);

  return (
    <SidebarProvider defaultOpen>
      <Sidebar variant="sidebar" collapsible="icon" className="border-r">
        <SidebarHeader className="p-4 items-center flex justify-between">
          <Link href="/" passHref>
            <Logo className="group-data-[collapsible=icon]:hidden" />
          </Link>
          <SidebarTrigger className="group-data-[collapsible=icon]:hidden md:hidden hover:bg-transparent focus-visible:bg-transparent hover:text-primary" />
        </SidebarHeader>
        <SidebarContent>
          <SidebarNav favoriteJobOpenings={favoriteJobOpenings} />
        </SidebarContent>
        <SidebarFooter
          className={cn(
            "flex flex-col justify-start",
            "p-2 group-data-[collapsible=icon]:pt-1 group-data-[collapsible=icon]:pb-2 group-data-[collapsible=icon]:pl-2 group-data-[collapsible=icon]:pr-2"
        )}>
          <SidebarUsageProgress user={user} />
          <div className={cn("mt-4 flex items-center", "group-data-[collapsible=icon]:justify-center justify-start")}>
            <Around
              toggled={theme === 'dark'}
              onClick={toggleTheme}
              title="Toggle theme"
              aria-label="Toggle theme"
              className={cn(
                  "theme-toggle",
                  "text-xl text-sidebar-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar-background hover:text-sidebar-foreground",
                  "w-auto",
                  "group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:p-0"
              )}
              style={{ '--theme-toggle__around--duration': '500ms' } as React.CSSProperties}
            />
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="bg-background">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b bg-background/80 backdrop-blur-sm px-4 md:px-6 shadow-sm">
            <div className="flex items-center gap-4">
                <SidebarTrigger className="md:hidden hover:bg-transparent focus-visible:bg-transparent hover:text-primary" />
            </div>
            {user && (
            <HoverCard openDelay={0} closeDelay={200}>
                <HoverCardTrigger asChild>
                    <Button
                        variant="ghost"
                        className="relative h-9 w-9 rounded-full focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 border-none hover:bg-transparent focus-visible:bg-transparent"
                    >
                        <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-primary text-primary-foreground font-medium">
                            {isLoadingAuth || isLoadingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : userInitials}
                        </AvatarFallback>
                        </Avatar>
                    </Button>
                </HoverCardTrigger>
                <HoverCardContent align="end" className="w-56 p-1">
                    <div className={cn("font-normal px-2 py-1.5")}>
                        <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none truncate">{isLoadingSettings ? "Loading name..." : userDisplayNameToShow}</p>
                        {user.email && <p className="text-xs leading-none text-muted-foreground truncate">{user.email}</p>}
                        </div>
                    </div>
                    <div className="my-1 h-px bg-muted" />
                    <Link href="/landing" passHref legacyBehavior>
                        <a className={cn("relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50", "cursor-pointer hover:bg-accent hover:text-accent-foreground")}>
                        <Home className="mr-2 h-4 w-4" />
                        <span>Homepage</span>
                        </a>
                    </Link>
                    {showDashboardLinkInMenu && (
                         <Link href="/" passHref legacyBehavior>
                            <a className={cn("relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50", "cursor-pointer hover:bg-accent hover:text-accent-foreground")}>
                            <Home className="mr-2 h-4 w-4" /> {}
                            <span>Dashboard</span>
                            </a>
                        </Link>
                    )}
                    <Link href="/settings/account" passHref legacyBehavior>
                        <a className={cn("relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50", "cursor-pointer hover:bg-accent hover:text-accent-foreground")}>
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Account Settings</span>
                        </a>
                    </Link>
                    <Link href="/settings/billing" passHref legacyBehavior>
                        <a className={cn("relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50", "cursor-pointer hover:bg-accent hover:text-accent-foreground")}>
                        <CreditCard className="mr-2 h-4 w-4" />
                        <span>Billing &amp; Plan</span>
                        </a>
                    </Link>
                    <div className="my-1 h-px bg-muted" />
                    <button
                        onClick={handleSignOut}
                        className={cn("relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50", "text-destructive hover:bg-destructive/20 hover:text-destructive focus:bg-destructive/20 focus:text-destructive cursor-pointer w-full")}
                    >
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Sign Out</span>
                    </button>
                </HoverCardContent>
              </HoverCard>
            )}
        </header>
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

    