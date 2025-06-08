
'use client';

import React, { useState, useEffect, type ReactNode, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import type { User, Session } from '@supabase/supabase-js';
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

const PUBLIC_PATHS = ['/landing', '/auth'];
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


  const fetchUserDataAndSettings = useCallback(async (userId: string) => {
    setIsLoadingSettings(true);
    setOnboardingCheckComplete(false);
    try {
      const [settingsResult, favoritesResult] = await Promise.all([
        supabase.from('user_settings').select('*').eq('user_id', userId).single(),
        supabase.from('job_openings').select('id, role_title, company_name_cache, favorited_at, is_favorite').eq('user_id', userId).eq('is_favorite', true).order('favorited_at', { ascending: true, nulls: 'last' })
      ]);

      const { data: settingsData, error: settingsError } = settingsResult;
      if (settingsError && settingsError.code !== 'PGRST116') {
         console.error("Error fetching user settings:", settingsError.message, "Code:", settingsError.code);
         throw settingsError;
      }
      const fetchedSettings = settingsData as UserSettings | null;
      setUserSettings(fetchedSettings);

      if (!fetchedSettings || fetchedSettings.onboarding_complete === false || fetchedSettings.onboarding_complete === null) {
        setShowOnboardingForm(true);
      } else {
        setShowOnboardingForm(false);
      }

      const { data: favoritesData, error: favoritesError } = favoritesResult;
      if (favoritesError) {
         console.error("Error fetching favorite job openings:", favoritesError.message);
         // Non-fatal, continue with empty favorites
         setFavoriteJobOpenings([]);
      } else {
         setFavoriteJobOpenings(favoritesData as JobOpening[] || []);
      }

    } catch (error: any) {
      toast({ title: 'Error fetching user data', description: error.message, variant: 'destructive' });
      setUserSettings(null);
      setShowOnboardingForm(true);
      setFavoriteJobOpenings([]);
    } finally {
      setIsLoadingSettings(false);
      setOnboardingCheckComplete(true);
    }
  }, [toast]);


  useEffect(() => {
    const storedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = storedTheme || (systemPrefersDark ? 'dark' : 'light');
    setTheme(initialTheme);
    document.documentElement.classList.toggle('dark', initialTheme === 'dark');

    let initialAuthCheckDone = false;

    const processUserSession = async (sessionUser: User | null, isInitialLoad: boolean) => {
      if (isInitialLoad) {
        setIsLoadingAuth(true);
      }

      const currentPreviousUserId = previousUserIdRef.current;
      const newUserId = sessionUser?.id;

      setUser(sessionUser); // Update user state immediately

      if (newUserId !== currentPreviousUserId) {
        // User identity changed OR it's the first load for this user context
        previousUserIdRef.current = newUserId; // Update ref

        // Reset states that depend on the user identity
        setFavoriteJobOpenings([]);
        setUserSettings(null);
        setShowOnboardingForm(false);
        setOnboardingCheckComplete(false);

        if (sessionUser) {
          await fetchUserDataAndSettings(sessionUser.id);
        } else {
          // User logged out or no session initially
          setIsLoadingSettings(false);
          setOnboardingCheckComplete(true); // No onboarding for logged out user
        }
      } else if (sessionUser && !onboardingCheckComplete && !isLoadingSettings) {
        // Same user, but perhaps onboarding check was interrupted or settings not fully loaded
        // This case might occur if a previous fetchUserDataAndSettings was prematurely exited
        // or if an auth state change happened mid-load for the same user.
        await fetchUserDataAndSettings(sessionUser.id);
      }
      // If user is the same and onboardingCheckComplete is true, we assume data is current and do nothing.


      if (isInitialLoad) {
        setIsLoadingAuth(false);
        initialAuthCheckDone = true;
      }

      // Perform redirection logic only after all loading states for the initial check are resolved
      if (initialAuthCheckDone && !isLoadingAuth && !isLoadingSettings) {
        if (!sessionUser && !PUBLIC_PATHS.includes(pathname)) {
          router.push('/landing');
        } else if (sessionUser && PUBLIC_PATHS.includes(pathname) && userSettings && userSettings.onboarding_complete) {
          router.push('/');
        }
      }
    };

    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      processUserSession(session?.user ?? null, true);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, currentSession) => {
        // Subsequent changes, not initial load
        await processUserSession(currentSession?.user ?? null, false);
         if (_event === 'SIGNED_OUT' && !PUBLIC_PATHS.includes(pathname)) {
          router.push('/landing');
        }
      }
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, [pathname, router, fetchUserDataAndSettings]); // isLoadingAuth, isLoadingSettings, userSettings removed from deps of outer useEffect


  const handleSignOut = async () => {
    setIsLoadingAuth(true); // Indicate auth state is changing
    const { error } = await supabase.auth.signOut();
    // User state and other resets will be handled by onAuthStateChange -> processUserSession
    if (error) {
      toast({ title: 'Sign Out Failed', description: error.message, variant: 'destructive' });
      setIsLoadingAuth(false); // Reset if sign out fails before onAuthStateChange does
    } else {
      toast({ title: 'Signed Out Successfully' });
      // Redirect is handled by onAuthStateChange
    }
  };

  const handleOnboardingComplete = async () => {
    setShowOnboardingForm(false);
    if (user) {
      // Re-fetch settings to confirm onboarding_complete is true and get any other latest settings
      await fetchUserDataAndSettings(user.id);
    }
  };

  const toggleTheme = () => {
    setTheme(prevTheme => {
        const newTheme = prevTheme === 'light' ? 'dark' : 'light';
        document.documentElement.classList.toggle('dark', newTheme === 'dark');
        localStorage.setItem('theme', newTheme);
        return newTheme;
    });
  };

  const isAppLoading = isLoadingAuth || (user != null && (isLoadingSettings || !onboardingCheckComplete));

  if (isAppLoading && !PUBLIC_PATHS.includes(pathname)) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (PUBLIC_PATHS.includes(pathname)) {
     if (user && !isAppLoading && userSettings && userSettings.onboarding_complete) {
        router.push('/');
        return (
             <div className="flex h-screen w-screen items-center justify-center bg-background">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
     }
     return <>{children}</>;
  }

  if (!user && !isLoadingAuth && !PUBLIC_PATHS.includes(pathname)) {
    router.push('/landing');
     return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  const userDisplayNameToShow = userSettings?.full_name || user?.user_metadata?.full_name || user?.email || 'User';
  const userInitials = getInitials(userDisplayNameToShow, user?.email);

  if (user && onboardingCheckComplete && showOnboardingForm && !isLoadingSettings) {
    return (
         <OnboardingForm
              user={user}
              existingSettings={userSettings}
              onOnboardingComplete={handleOnboardingComplete}
            />
    );
  }

  if (!user && !isLoadingAuth) { // Should have been caught by redirect
      router.push('/landing');
      return (
          <div className="flex h-screen w-screen items-center justify-center bg-background">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </div>
      );
  }
  
  // Fallback if still loading after all checks, or user is null unexpectedly.
  if (!user || isAppLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }


  const menuItemClass = "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50";
  const showDashboardLink = !HIDE_DASHBOARD_LINK_PATHS.includes(pathname);

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
                    <div className={cn(menuItemClass, "font-normal px-2 py-1.5")}>
                        <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none truncate">{isLoadingSettings ? "Loading name..." : userDisplayNameToShow}</p>
                        {user.email && <p className="text-xs leading-none text-muted-foreground truncate">{user.email}</p>}
                        </div>
                    </div>
                    <div className="my-1 h-px bg-muted" />
                    <Link href="/landing" passHref legacyBehavior>
                        <a className={cn(menuItemClass, "cursor-pointer hover:bg-accent hover:text-accent-foreground")}>
                        <Home className="mr-2 h-4 w-4" />
                        <span>Homepage</span>
                        </a>
                    </Link>
                    {showDashboardLink && (
                         <Link href="/" passHref legacyBehavior>
                            <a className={cn(menuItemClass, "cursor-pointer hover:bg-accent hover:text-accent-foreground")}>
                            <Home className="mr-2 h-4 w-4" />
                            <span>Dashboard</span>
                            </a>
                        </Link>
                    )}
                    <Link href="/settings/account" passHref legacyBehavior>
                        <a className={cn(menuItemClass, "cursor-pointer hover:bg-accent hover:text-accent-foreground")}>
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Account Settings</span>
                        </a>
                    </Link>
                    <Link href="/settings/billing" passHref legacyBehavior>
                        <a className={cn(menuItemClass, "cursor-pointer hover:bg-accent hover:text-accent-foreground")}>
                        <CreditCard className="mr-2 h-4 w-4" />
                        <span>Billing &amp; Plan</span>
                        </a>
                    </Link>
                    <div className="my-1 h-px bg-muted" />
                    <button
                        onClick={handleSignOut}
                        className={cn(menuItemClass, "text-destructive hover:bg-destructive/20 hover:text-destructive focus:bg-destructive/20 focus:text-destructive cursor-pointer w-full")}
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
