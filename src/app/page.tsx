
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

  useEffect(() => {
    setIsLoadingUser(true);

    const handleAuthStateChanged = (event: string, session: Session | null) => {
      setIsLoadingUser(true);
      const newUser = session?.user ?? null;

      if (newUser?.id !== previousUserIdRef.current) {
        setHasFetchedData(false);
        if (!newUser) {
          setStats({ followUpsToday: 0, followUpsThisWeek: 0, activeOpenings: 0, totalContacts: 0, totalCompanies: 0 });
          setEmailsSentData([]);
          setOpeningsAddedData([]);
          setLoadingStats(false);
          setLoadingCharts(false);
        }
      }

      setCurrentUser(newUser);
      previousUserIdRef.current = newUser?.id;
      setIsLoadingUser(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      handleAuthStateChanged('INITIAL_SESSION_PROCESSED', session);
    }).catch(error => {
      setIsLoadingUser(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      handleAuthStateChanged(event, session);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const fetchDashboardData = useCallback(async () => {
    if (!currentUser) {
      setLoadingStats(false);
      setLoadingCharts(false);
      return false;
    }

    setLoadingStats(true);
    setLoadingCharts(true);

    try {
      const [
        jobOpeningsResponse,
        followUpsResponse,
        contactsCountResponse,
        companiesCountResponse
      ] = await Promise.all([
        supabase.from('job_openings').select('*').eq('user_id', currentUser.id),
        supabase.from('follow_ups').select('*').eq('user_id', currentUser.id),
        supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('user_id', currentUser.id),
        supabase.from('companies').select('id', { count: 'exact', head: true }).eq('user_id', currentUser.id)
      ]);

      if (jobOpeningsResponse.error) throw jobOpeningsResponse.error;
      if (followUpsResponse.error) throw followUpsResponse.error;
      if (contactsCountResponse.error) throw contactsCountResponse.error;
      if (companiesCountResponse.error) throw companiesCountResponse.error;

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
            email_content: fuDb.email_content,
            status: fuDb.status as FollowUp['status'],
            created_at: fuDb.created_at
          }))
          .sort((a,b) => new Date(a.follow_up_date).getTime() - new Date(b.follow_up_date).getTime()),
         associated_contacts: jo.associated_contacts || []
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
      setLoadingStats(false);

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
      setLoadingCharts(false);
      return true;
    } catch (error: any) {
      toast({
        title: 'Error Fetching Dashboard Data',
        description: error.message,
        variant: 'destructive',
      });
      setLoadingStats(false);
      setLoadingCharts(false);
      return false;
    }
  }, [currentUser, toast]);

  useEffect(() => {
    if (currentUser && !hasFetchedData && !isLoadingUser) {
      fetchDashboardData().then((success) => {
        if (success) {
          setHasFetchedData(true);
        }
      });
    } else if (!currentUser && !isLoadingUser) {
       setLoadingStats(false);
       setLoadingCharts(false);
       setHasFetchedData(false);
    }
  }, [currentUser, hasFetchedData, isLoadingUser, fetchDashboardData]);


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
              {isLoadingUser || loadingStats ? (
                 <div className="flex items-center justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Due Today:</span>
                    <span className="text-lg font-semibold">{stats.followUpsToday}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sm">Due This Week (upcoming):</span>
                    <span className="text-lg font-semibold">{stats.followUpsThisWeek}</span>
                  </div>
                  {(!currentUser || (stats.followUpsToday === 0 && stats.followUpsThisWeek === 0)) && (
                    <p className="text-sm text-muted-foreground mt-2">
                      {currentUser ? "No pending follow-ups scheduled." : "Sign in to see your follow-ups."}
                    </p>
                  )}
                </>
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
              {isLoadingUser || loadingStats ? (
                 <div className="flex items-center justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : (
                <>
                  <div className="flex items-center">
                    <span className="text-3xl font-bold">{stats.activeOpenings}</span>
                    <span className="ml-2 text-sm text-muted-foreground">active openings</span>
                  </div>
                  {(!currentUser || stats.activeOpenings === 0) && (
                     <p className="text-sm text-muted-foreground mt-2">
                      {currentUser ? "No active job openings tracked yet." : "Sign in to see your openings."}
                     </p>
                  )}
                </>
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
              {isLoadingUser || loadingStats ? (
                 <div className="flex items-center justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : (
                 <>
                  <div className="flex items-center">
                    <span className="text-3xl font-bold">{stats.totalContacts}</span>
                    <span className="ml-2 text-sm text-muted-foreground">contacts</span>
                  </div>
                  {(!currentUser || stats.totalContacts === 0) && (
                     <p className="text-sm text-muted-foreground mt-2">
                       {currentUser ? "No contacts added yet." : "Sign in to see your contacts."}
                     </p>
                  )}
                </>
              )}
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
              {isLoadingUser || loadingStats ? (
                 <div className="flex items-center justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : (
                <>
                  <div className="flex items-center">
                    <span className="text-3xl font-bold">{stats.totalCompanies}</span>
                    <span className="ml-2 text-sm text-muted-foreground">companies</span>
                  </div>
                  {(!currentUser || stats.totalCompanies === 0) && (
                     <p className="text-sm text-muted-foreground mt-2">
                       {currentUser ? "No companies added yet." : "Sign in to see your companies."}
                     </p>
                  )}
                </>
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
              {isLoadingUser || loadingCharts ? (
                <div className="h-[300px] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : !currentUser ? (
                <p className="text-sm text-muted-foreground h-[300px] flex items-center justify-center">Sign in to view email activity.</p>
              ) : emailsSentData.filter(d => d.count > 0).length === 0 ? (
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
              {isLoadingUser || loadingCharts ? (
                 <div className="h-[300px] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : !currentUser ? (
                <p className="text-sm text-muted-foreground h-[300px] flex items-center justify-center">Sign in to view job opening activity.</p>
              ) : openingsAddedData.filter(d => d.count > 0).length === 0 ? (
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
      </div>
    </AppLayout>
  );
}
    
