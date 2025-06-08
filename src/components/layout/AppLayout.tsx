
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

const PUBLIC_PATHS = ['/landing', '/auth', '/pricing', '/about', '/contact', '/careers', '/partner-with-us', '/privacy-policy', '/terms-and-conditions']; // Added more public paths
const BLOG_PATHS_REGEX = /^\/blog(\/.*)?$/; // Regex for /blog and /blog/*
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
         // If there's a 406 or similar error, don't show onboarding.
         if (settingsError.code === 'PGRST113' || settingsError.code === '406') { // PGRST113 is 'Not acceptable', a potential name for 406
            toast({ title: 'Profile Load Error', description: 'Could not load your profile settings. Please try again later.', variant: 'destructive'});
            setShowOnboardingForm(false);
         } else {
            throw settingsError; // Re-throw other errors
         }
      } else {
        const fetchedSettings = settingsData as UserSettings | null;
        setUserSettings(fetchedSettings);
        if (!fetchedSettings || fetchedSettings.onboarding_complete === false || fetchedSettings.onboarding_complete === null) {
            setShowOnboardingForm(true);
        } else {
            setShowOnboardingForm(false);
        }
      }


      const { data: favoritesData, error: favoritesError } = favoritesResult;
      if (favoritesError) {
         console.error("Error fetching favorite job openings:", favoritesError.message);
         setFavoriteJobOpenings([]);
      } else {
         setFavoriteJobOpenings(favoritesData as JobOpening[] || []);
      }

    } catch (error: any) {
      toast({ title: 'Error fetching user data', description: error.message, variant: 'destructive' });
      setUserSettings(null);
      setShowOnboardingForm(false); // Don't show onboarding on general error
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

    const processUserSession = async (sessionUser: User | null) => {
      const currentPreviousUserId = previousUserIdRef.current;
      const newUserId = sessionUser?.id;

      setUser(sessionUser);

      if (newUserId !== currentPreviousUserId) {
        previousUserIdRef.current = newUserId;
        setFavoriteJobOpenings([]);
        setUserSettings(null);
        setShowOnboardingForm(false);
        setOnboardingCheckComplete(false);
        setIsLoadingSettings(true); // Ensure settings loading is true for new user

        if (sessionUser) {
          await fetchUserDataAndSettings(sessionUser.id);
        } else {
          setIsLoadingSettings(false);
          setOnboardingCheckComplete(true);
        }
      } else if (!sessionUser) {
        // Handle case where user logs out but was already null (e.g. no-op or ensure cleanup)
        setIsLoadingSettings(false);
        setOnboardingCheckComplete(true);
      }
      setIsLoadingAuth(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      processUserSession(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, currentSession) => {
        await processUserSession(currentSession?.user ?? null);
      }
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, [fetchUserDataAndSettings]);


  // Moved redirection logic into useEffect
  useEffect(() => {
    if (!isLoadingAuth && !isPublicPath) {
      if (!user) {
        router.push('/landing');
      } else if (user && !isLoadingSettings && onboardingCheckComplete && showOnboardingForm) {
        // User is logged in, settings checked, onboarding needed.
        // This implies the current page should be the onboarding form,
        // which is handled by returning <OnboardingForm /> directly.
        // If the user is on another private page and needs onboarding,
        // AppLayout structure should ensure OnboardingForm is rendered instead of page children.
      }
    } else if (!isLoadingAuth && user && userSettings?.onboarding_complete && isPublicPath && !BLOG_PATHS_REGEX.test(pathname)) {
      // User is logged in, onboarded, and on a public page (excluding blog pages)
      router.push('/');
    }
  }, [user, isLoadingAuth, isLoadingSettings, onboardingCheckComplete, showOnboardingForm, isPublicPath, pathname, router, userSettings]);


  const handleSignOut = async () => {
    setIsLoadingAuth(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({ title: 'Sign Out Failed', description: error.message, variant: 'destructive' });
      setIsLoadingAuth(false);
    } else {
      toast({ title: 'Signed Out Successfully' });
      // Redirection and state reset will be handled by onAuthStateChange
    }
  };

  const handleOnboardingComplete = async () => {
    setShowOnboardingForm(false);
    if (user) {
      await fetchUserDataAndSettings(user.id); // Re-fetch to confirm onboarding and get latest settings
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

  if (isPublicPath) {
     return <>{children}</>; // For public paths, just render children, redirection handled by useEffect
  }

  if (isAppLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // After initial loading, if still no user and not a public path, this should be caught by useEffect redirect.
  // This check is a safeguard.
  if (!user) {
     return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // If user exists, settings check is complete, and onboarding is needed:
  if (onboardingCheckComplete && showOnboardingForm) {
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

  // If user exists, onboarded, and not loading anything else:
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
                            <Home className="mr-2 h-4 w-4" /> {/* Consider different icon for dashboard if needed */}
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

