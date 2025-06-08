
'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { PlusCircle, Rss, Mail as MailIcon, Handshake, Users, Building2, CalendarCheck, Briefcase as BriefcaseIcon, BarChart2, MailOpen, Loader2, Home } from "lucide-react";
import Link from "next/link";
import type { JobOpening, Contact, Company, FollowUp } from '@/lib/types';
import { isToday, isThisWeek, format, subDays, eachDayOfInterval, isEqual, startOfDay, isValid } from 'date-fns';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { supabase } from '@/lib/supabaseClient';
import type { User, Session } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';

const initialEmailSentStatuses: JobOpening['status'][] = [
  'Emailed',
  '1st Follow Up', '2nd Follow Up', '3rd Follow Up',
  'No Response', 'Replied - Positive',
  'Replied - Negative', 'Interviewing', 'Offer', 'Rejected', 'Closed'
];

interface ChartDataPoint {
  date: string;
  displayDate: string;
  count: number;
}

const emailsSentChartConfig = {
  emails: {
    label: "Emails Sent",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

const openingsAddedChartConfig = {
  openings: {
    label: "Openings Added",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;


export default function DashboardPage() {
  const [stats, setStats] = useState({
    followUpsToday: 0,
    followUpsThisWeek: 0,
    activeOpenings: 0,
    totalContacts: 0,
    totalCompanies: 0,
  });
  const [loadingStats, setLoadingStats] = useState(true);
  const [emailsSentData, setEmailsSentData] = useState<ChartDataPoint[]>([]);
  const [openingsAddedData, setOpeningsAddedData] = useState<ChartDataPoint[]>([]);
  const [loadingCharts, setLoadingCharts] = useState(true);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [hasFetchedData, setHasFetchedData] = useState(false);
  const previousUserIdRef = useRef<string | null | undefined>(null);

  const { toast } = useToast();
  console.log(`[DashboardPage] Component RENDERED. isLoadingUser: ${isLoadingUser} loadingStats: ${loadingStats} loadingCharts: ${loadingCharts} hasFetchedData: ${hasFetchedData} currentUser ID: ${currentUser?.id}`);

  const handleAuthStateChanged = useCallback((event: string, session: Session | null) => {
    console.log(`[DashboardPage] handleAuthStateChanged EVENT: ${event} Session User ID: ${session?.user?.id}`);
    const newUser = session?.user ?? null;

    if (newUser?.id !== previousUserIdRef.current) {
      console.log(`[DashboardPage] User CHANGED or first load with user. Old ID: ${previousUserIdRef.current} New ID: ${newUser?.id}`);
      setHasFetchedData(false); // Reset fetch status for new user
    } else {
      console.log(`[DashboardPage] User ID SAME or no new user. Old ID: ${previousUserIdRef.current} New ID: ${newUser?.id}`);
    }
    setCurrentUser(newUser);
    previousUserIdRef.current = newUser?.id;
    console.log(`[DashboardPage] handleAuthStateChanged FINISHED. isLoadingUser set to false. CurrentUser ID: ${currentUser?.id}`);
    setIsLoadingUser(false);
  }, [currentUser?.id]); // Added currentUser?.id to dependencies of useCallback

  useEffect(() => {
    console.log(`[DashboardPage] Auth useEffect RUNNING. Setting isLoadingUser to true.`);
    setIsLoadingUser(true);
    // No explicit getSession needed, onAuthStateChange handles INITIAL_SESSION
    const { data: authListener } = supabase.auth.onAuthStateChange(handleAuthStateChanged);
    return () => {
      console.log("[DashboardPage] Auth useEffect CLEANUP. Unsubscribing.");
      authListener.subscription.unsubscribe();
    };
  }, [handleAuthStateChanged]);


  const fetchDashboardData = useCallback(async (userForFetch: User | null) => {
    console.log(`[DashboardPage] fetchDashboardData ENTERED. User param ID: ${userForFetch?.id}`);
    if (!userForFetch) {
      console.log('[DashboardPage] fetchDashboardData SKIPPED - no user provided.');
      setLoadingStats(false);
      setLoadingCharts(false);
      // setHasFetchedData(true); // Consider if an attempt without user means "fetched"
      return;
    }
    console.log(`[DashboardPage] fetchDashboardData - Proceeding with user: ${userForFetch.id} . Setting loading true.`);
    setLoadingStats(true);
    setLoadingCharts(true);

    try {
      console.log('[DB_FETCH] Entering try block...');
      let jobOpeningsResponse, followUpsResponse, contactsCountResponse, companiesCountResponse;

      console.log('[DB_FETCH] Starting fetch for job_openings...');
      jobOpeningsResponse = await supabase.from('job_openings').select('*').eq('user_id', userForFetch.id);
      console.log('[DB_FETCH] Completed fetch for job_openings.');
      if (jobOpeningsResponse.error) { console.error('[DB_FETCH] Error job_openings:', jobOpeningsResponse.error); throw jobOpeningsResponse.error; }

      console.log('[DB_FETCH] Starting fetch for follow_ups...');
      followUpsResponse = await supabase.from('follow_ups').select('*').eq('user_id', userForFetch.id);
      console.log('[DB_FETCH] Completed fetch for follow_ups.');
      if (followUpsResponse.error) { console.error('[DB_FETCH] Error follow_ups:', followUpsResponse.error); throw followUpsResponse.error; }

      console.log('[DB_FETCH] Starting fetch for contacts count...');
      contactsCountResponse = await supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('user_id', userForFetch.id);
      console.log('[DB_FETCH] Completed fetch for contacts count.');
      if (contactsCountResponse.error) { console.error('[DB_FETCH] Error contacts count:', contactsCountResponse.error); throw contactsCountResponse.error; }

      console.log('[DB_FETCH] Starting fetch for companies count...');
      companiesCountResponse = await supabase.from('companies').select('id', { count: 'exact', head: true }).eq('user_id', userForFetch.id);
      console.log('[DB_FETCH] Completed fetch for companies count.');
      if (companiesCountResponse.error) { console.error('[DB_FETCH] Error companies count:', companiesCountResponse.error); throw companiesCountResponse.error; }

      console.log('[DB_FETCH] All fetches completed successfully.');

      const rawJobOpenings = jobOpeningsResponse.data || [];
      const allFollowUps = followUpsResponse.data || [];
      const contactsCount = contactsCountResponse.count ?? 0;
      const companiesCount = companiesCountResponse.count ?? 0;

      const openingsWithFollowUps: JobOpening[] = rawJobOpenings.map(jo => ({
        ...jo,
        initial_email_date: new Date(jo.initial_email_date),
        followUps: (allFollowUps || [])
          .filter(fu => fu.job_opening_id === jo.id)
          .map(fuDb => ({
            ...fuDb,
            id: fuDb.id,
            job_opening_id: fuDb.job_opening_id,
            follow_up_date: new Date(fuDb.follow_up_date),
            original_due_date: fuDb.original_due_date ? new Date(fuDb.original_due_date) : null,
            email_content: fuDb.email_content, // This field might not exist based on your types
            status: fuDb.status as FollowUp['status'],
            created_at: fuDb.created_at
          }))
          .sort((a,b) => new Date(a.follow_up_date).getTime() - new Date(b.follow_up_date).getTime()),
         associated_contacts: jo.associated_contacts || [] // Assuming this comes from DB or is processed elsewhere
      }));

      let todayCount = 0;
      let thisWeekCount = 0;
      openingsWithFollowUps.forEach(opening => {
        (opening.followUps || []).forEach(fu => {
          if (fu.status === 'Pending') {
            const followUpDate = startOfDay(fu.follow_up_date);
            if (isValid(followUpDate)) {
                if (isToday(followUpDate)) {
                    todayCount++;
                }
                if (isThisWeek(followUpDate, { weekStartsOn: 1 }) && !isToday(followUpDate) && followUpDate >= startOfDay(new Date())) {
                    thisWeekCount++;
                }
            }
          }
        });
      });

      const activeOpeningsCount = openingsWithFollowUps.filter(
        op => op.status !== 'Closed' && op.status !== 'Rejected'
      ).length;

      const calculatedStats = {
        followUpsToday: todayCount,
        followUpsThisWeek: thisWeekCount,
        activeOpenings: activeOpeningsCount,
        totalContacts: contactsCount,
        totalCompanies: companiesCount,
      };
      setStats(calculatedStats);
      console.log("[DashboardPage] fetchDashboardData - Calculated Stats:", calculatedStats);


      const today = startOfDay(new Date());
      const last30DaysInterval = {
        start: subDays(today, 29),
        end: today,
      };
      const dateRange = eachDayOfInterval(last30DaysInterval);

      const emailsMap = new Map<string, number>();
      const openingsMap = new Map<string, number>();

      dateRange.forEach(date => {
        const dateKey = format(date, 'yyyy-MM-dd');
        emailsMap.set(dateKey, 0);
        openingsMap.set(dateKey, 0);
      });

      openingsWithFollowUps.forEach(opening => {
        if (isValid(opening.initial_email_date)) {
            const initialEmailDay = startOfDay(opening.initial_email_date);
            const initialEmailDayKey = format(initialEmailDay, 'yyyy-MM-dd');

            if (openingsMap.has(initialEmailDayKey)) {
                openingsMap.set(initialEmailDayKey, (openingsMap.get(initialEmailDayKey) || 0) + 1);
            }

            if (initialEmailSentStatuses.includes(opening.status as any) && emailsMap.has(initialEmailDayKey)) {
                emailsMap.set(initialEmailDayKey, (emailsMap.get(initialEmailDayKey) || 0) + 1);
            }
        }

        (opening.followUps || []).forEach(fu => {
          if (fu.status === 'Sent' && isValid(fu.follow_up_date)) {
            const followUpDay = startOfDay(fu.follow_up_date);
            const followUpDayKey = format(followUpDay, 'yyyy-MM-dd');
            if (emailsMap.has(followUpDayKey)) {
              emailsMap.set(followUpDayKey, (emailsMap.get(followUpDayKey) || 0) + 1);
            }
          }
        });
      });

      const processedEmailsData: ChartDataPoint[] = [];
      emailsMap.forEach((count, dateKey) => {
          processedEmailsData.push({ date: dateKey, displayDate: format(new Date(dateKey + 'T00:00:00'), 'MMM dd'), count });
      });
      processedEmailsData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const processedOpeningsData: ChartDataPoint[] = [];
      openingsMap.forEach((count, dateKey) => {
          processedOpeningsData.push({ date: dateKey, displayDate: format(new Date(dateKey + 'T00:00:00'), 'MMM dd'), count });
      });
      processedOpeningsData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      setEmailsSentData(processedEmailsData);
      setOpeningsAddedData(processedOpeningsData);
      console.log("[DashboardPage] fetchDashboardData - Processed Chart Data.");
      
    } catch (error: any) {
      console.error('[DB_FETCH] Error in try block of fetchDashboardData:', error);
      toast({
        title: 'Error Fetching Dashboard Data',
        description: error.message || 'Could not retrieve dashboard information.',
        variant: 'destructive',
      });
    } finally {
      console.log('[DB_FETCH] FINALLY block reached in fetchDashboardData.');
      setLoadingStats(false);
      setLoadingCharts(false);
      setHasFetchedData(true); // Indicate fetch attempt completed, regardless of success
    }
  }, [toast]); // Removed currentUser from here, as it's passed as param

  useEffect(() => {
    console.log(`[DashboardPage] Data Fetch useEffect RUNNING. currentUser ID: ${currentUser?.id} isLoadingUser: ${isLoadingUser} hasFetchedData: ${hasFetchedData}`);
    if (currentUser && !isLoadingUser && !hasFetchedData) {
      console.log(`[DashboardPage] Data Fetch useEffect - CONDITIONS MET, calling fetchDashboardData with currentUser: ${currentUser.id}`);
      fetchDashboardData(currentUser);
    } else {
      console.log(`[DashboardPage] Data Fetch useEffect - Conditions NOT MET for fetch or already fetched.`);
      if (!currentUser || isLoadingUser) {
        setLoadingStats(false); // Ensure loaders are off if no user or auth is still loading
        setLoadingCharts(false);
      }
    }
  }, [currentUser, isLoadingUser, hasFetchedData, fetchDashboardData]);


  const isStillLoadingContent = loadingStats || loadingCharts;

  if (isLoadingUser) {
    console.log("[DashboardPage] RENDER - isLoadingUser is TRUE. Showing AppLayout loader via its internal logic.");
    return (
      <AppLayout>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!currentUser) {
     console.log("[DashboardPage] RENDER - No currentUser. Showing sign-in prompt.");
    return (
      <AppLayout>
        <Card>
          <CardHeader>
            <CardTitle>Welcome to ProspectFlow</CardTitle>
            <CardDescription>Please sign in to view your dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/auth">
              <Button>Sign In</Button>
            </Link>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  console.log(`[DashboardPage] RENDER - Rendering dashboard content. isStillLoadingContent: ${isStillLoadingContent}`);
  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight font-headline">Dashboard</h2>
            <p className="text-muted-foreground">Welcome back! Here's an overview of your prospects.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/job-openings?new=true" passHref>
              <Button disabled={!currentUser || isLoadingUser}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add New Opening
              </Button>
            </Link>
          </div>
        </div>

        {isStillLoadingContent ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(5)].map((_, i) => (
              <Card key={i} className="shadow-lg">
                <CardHeader>
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-1/2 mb-1" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            ))}
             <Card className="shadow-lg lg:col-span-3">
                <CardHeader><Skeleton className="h-6 w-1/2" /></CardHeader>
                <CardContent><Skeleton className="h-[300px] w-full" /></CardContent>
            </Card>
             <Card className="shadow-lg lg:col-span-3">
                <CardHeader><Skeleton className="h-6 w-1/2" /></CardHeader>
                <CardContent><Skeleton className="h-[300px] w-full" /></CardContent>
            </Card>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="font-headline flex items-center">
                  <CalendarCheck className="mr-2 h-5 w-5 text-primary" />
                  Upcoming Follow-ups
                </CardTitle>
                <CardDescription>Tasks needing your attention.</CardDescription>
              </CardHeader>
              <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Due Today:</span>
                    <span className="text-lg font-semibold">{stats.followUpsToday}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sm">Due This Week (upcoming):</span>
                    <span className="text-lg font-semibold">{stats.followUpsThisWeek}</span>
                  </div>
                  {(stats.followUpsToday === 0 && stats.followUpsThisWeek === 0) && (
                    <p className="text-sm text-muted-foreground mt-2">
                      No pending follow-ups scheduled.
                    </p>
                  )}
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="font-headline flex items-center">
                  <BriefcaseIcon className="mr-2 h-5 w-5 text-primary" />
                  Active Opportunities
                </CardTitle>
                <CardDescription>Job openings you are currently pursuing.</CardDescription>
              </CardHeader>
              <CardContent>
                  <div className="flex items-center">
                    <span className="text-3xl font-bold">{stats.activeOpenings}</span>
                    <span className="ml-2 text-sm text-muted-foreground">active openings</span>
                  </div>
                  {(stats.activeOpenings === 0) && (
                     <p className="text-sm text-muted-foreground mt-2">
                      No active job openings tracked yet.
                     </p>
                  )}
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="font-headline flex items-center">
                  <Users className="mr-2 h-5 w-5 text-primary" />
                  Total Contacts
                </CardTitle>
                <CardDescription>Your professional network.</CardDescription>
              </CardHeader>
              <CardContent>
                   <>
                    <div className="flex items-center">
                      <span className="text-3xl font-bold">{stats.totalContacts}</span>
                      <span className="ml-2 text-sm text-muted-foreground">contacts</span>
                    </div>
                    {(stats.totalContacts === 0) && (
                       <p className="text-sm text-muted-foreground mt-2">
                         No contacts added yet.
                       </p>
                    )}
                  </>
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="font-headline flex items-center">
                  <Building2 className="mr-2 h-5 w-5 text-primary" />
                  Total Companies
                </CardTitle>
                <CardDescription>Companies in your directory.</CardDescription>
              </CardHeader>
              <CardContent>
                  <div className="flex items-center">
                    <span className="text-3xl font-bold">{stats.totalCompanies}</span>
                    <span className="ml-2 text-sm text-muted-foreground">companies</span>
                  </div>
                  {(stats.totalCompanies === 0) && (
                     <p className="text-sm text-muted-foreground mt-2">
                       No companies added yet.
                     </p>
                  )}
              </CardContent>
            </Card>

            <Card className="shadow-lg lg:col-span-1">
              <CardHeader>
                <CardTitle className="font-headline">Quick Links</CardTitle>
                <CardDescription>Navigate to key sections quickly.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3">
                <Link href="/blog" passHref>
                   <Button variant="outline" className="w-full justify-start">
                      <Rss className="mr-2 h-4 w-4" /> Visit Our Blog
                   </Button>
                </Link>
                <Link href="/contact" passHref>
                   <Button variant="outline" className="w-full justify-start">
                      <MailIcon className="mr-2 h-4 w-4" /> Contact Us
                   </Button>
                </Link>
                <Link href="/partner-with-us" passHref>
                   <Button variant="outline" className="w-full justify-start">
                      <Handshake className="mr-2 h-4 w-4" /> Partner With Us
                   </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="shadow-lg lg:col-span-3">
              <CardHeader>
                <CardTitle className="font-headline flex items-center">
                  <MailOpen className="mr-2 h-5 w-5 text-primary" />
                  Emails Sent Per Day (Last 30 Days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {emailsSentData.filter(d => d.count > 0).length === 0 ? (
                  <p className="text-sm text-muted-foreground h-[300px] flex items-center justify-center">No email data to display for the last 30 days.</p>
                ) : (
                  <ChartContainer config={emailsSentChartConfig} className="h-[300px] w-full">
                    <BarChart accessibilityLayer data={emailsSentData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="displayDate"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tickFormatter={(value, index) => {
                          if (emailsSentData.length > 10 && index % 3 !== 0 && index !== 0 && index !== emailsSentData.length -1) return '';
                          return value;
                        }}
                      />
                      <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                      <ChartTooltip
                          cursor={false}
                          content={<ChartTooltipContent indicator="dot" />}
                      />
                      <Bar dataKey="count" fill="var(--color-emails)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-lg lg:col-span-3">
              <CardHeader>
                <CardTitle className="font-headline flex items-center">
                  <BarChart2 className="mr-2 h-5 w-5 text-primary" />
                  Job Openings Added Per Day (Last 30 Days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {openingsAddedData.filter(d => d.count > 0).length === 0 ? (
                   <p className="text-sm text-muted-foreground h-[300px] flex items-center justify-center">No new openings data to display for the last 30 days.</p>
                ): (
                  <ChartContainer config={openingsAddedChartConfig} className="h-[300px] w-full">
                    <BarChart accessibilityLayer data={openingsAddedData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                       <XAxis
                        dataKey="displayDate"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tickFormatter={(value, index) => {
                          if (openingsAddedData.length > 10 && index % 3 !== 0 && index !== 0 && index !== openingsAddedData.length -1) return '';
                          return value;
                        }}
                      />
                      <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                      <ChartTooltip
                          cursor={false}
                          content={<ChartTooltipContent indicator="dot" />}
                      />
                      <Bar dataKey="count" fill="var(--color-openings)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
    
