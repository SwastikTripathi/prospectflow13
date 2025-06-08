
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/lib/supabaseClient';
import type { User } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';
import type { UserSettings, UsagePreference, DefaultFollowUpTemplates, FollowUpTemplateContent } from '@/lib/types';
import { Loader2, UserCircle, Settings as SettingsIcon, SlidersHorizontal, MailQuestion, Edit3, ShieldAlert, Trash2, Info, KeyRound } from 'lucide-react';
import type { Json } from '@/lib/database.types';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';

const USAGE_PREFERENCES: { value: UsagePreference; label: string }[] = [
  { value: 'job_hunt', label: 'Job Hunting / Career Opportunities' },
  { value: 'sales', label: 'Sales & Lead Generation' },
  { value: 'networking', label: 'Professional Networking' },
  { value: 'other', label: 'Other / General Prospecting' },
];

const AGE_RANGES = ["Under 18", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
const CURRENCIES = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "Other"];
const defaultIndividualFollowUpTemplate: Omit<FollowUpTemplateContent, 'signature'> = { subject: '', openingLine: '' };
const defaultAllTemplates: DefaultFollowUpTemplates = {
  followUp1: { ...defaultIndividualFollowUpTemplate },
  followUp2: { ...defaultIndividualFollowUpTemplate },
  followUp3: { ...defaultIndividualFollowUpTemplate },
  sharedSignature: '',
};
const defaultCadence: [number, number, number] = [7, 14, 21];
const DELETE_CONFIRMATION_PHRASE = "DELETE MY ACCOUNT";

const accountSettingsSchema = z.object({
  displayName: z.string().max(100, "Display name cannot exceed 100 characters.").optional(),
  usagePreference: z.enum(['job_hunt', 'sales', 'networking', 'other']),
  cadenceFu1: z.coerce.number().min(1, "Days must be at least 1").max(90, "Days cannot exceed 90"),
  cadenceFu2: z.coerce.number().min(1, "Days must be at least 1").max(90, "Days cannot exceed 90"),
  cadenceFu3: z.coerce.number().min(1, "Days must be at least 1").max(90, "Days cannot exceed 90"),
  defaultEmailTemplates: z.object({
    followUp1: z.object({
      subject: z.string().max(200, "Subject too long").optional(),
      openingLine: z.string().max(500, "Opening line too long").optional(),
    }),
    followUp2: z.object({
      subject: z.string().max(200).optional(),
      openingLine: z.string().max(500).optional(),
    }),
    followUp3: z.object({
      subject: z.string().max(200).optional(),
      openingLine: z.string().max(500).optional(),
    }),
    sharedSignature: z.string().max(500, "Signature too long").optional(),
  }),
  // Onboarding fields
  ageRange: z.string().min(1, "Age range is required"),
  country: z.string().min(1, "Country is required").max(100, "Country name too long"),
  annualIncome: z.coerce.number().positive("Income must be positive").optional().or(z.literal('')),
  incomeCurrency: z.string().optional(),
  currentRole: z.string().min(1, "Current role is required").max(100, "Role name too long"),
}).refine(data => data.cadenceFu2 > data.cadenceFu1 && data.cadenceFu3 > data.cadenceFu2, {
  message: "Follow-up days must be sequential (e.g., FU2 > FU1, FU3 > FU2).",
  path: ["cadenceFu2"],
});

type AccountSettingsFormValues = z.infer<typeof accountSettingsSchema>;

const passwordChangeSchema = z.object({
  newPassword: z.string().min(6, "Password must be at least 6 characters."),
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

type PasswordChangeFormValues = z.infer<typeof passwordChangeSchema>;

const defaultFormValues: AccountSettingsFormValues = {
  displayName: '',
  usagePreference: 'job_hunt',
  cadenceFu1: defaultCadence[0],
  cadenceFu2: defaultCadence[1],
  cadenceFu3: defaultCadence[2],
  defaultEmailTemplates: defaultAllTemplates,
  ageRange: '',
  country: '',
  annualIncome: '',
  incomeCurrency: '',
  currentRole: '',
};

export default function AccountSettingsPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isFetchingSettings, setIsFetchingSettings] = useState(false);
  const [hasFetchedData, setHasFetchedData] = useState(false);
  const previousUserIdRef = useRef<string | null | undefined>(null);

  const [isPasswordUpdating, setIsPasswordUpdating] = useState(false);
  const [isDeleteStep1Open, setIsDeleteStep1Open] = useState(false);
  const [isDeleteStep2Open, setIsDeleteStep2Open] = useState(false);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const settingsForm = useForm<AccountSettingsFormValues>({
    resolver: zodResolver(accountSettingsSchema),
    defaultValues: defaultFormValues,
  });

  const passwordForm = useForm<PasswordChangeFormValues>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
  });

  const fetchAccountData = useCallback(async (user: User) => {
    setIsFetchingSettings(true);
    console.log(`[AccountSettingsPage fetchAccountData] ENTERED. User param ID: ${user.id}. isFetchingSettings set to true.`);
    try {
      console.log(`[AccountSettingsPage fetchAccountData] Fetching settings from Supabase for user ${user.id}`);
      const { data: settingsData, error: settingsError } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();
      console.log(`[AccountSettingsPage fetchAccountData] Supabase settings fetch complete. Error:`, settingsError, "Data:", !!settingsData);


      if (settingsError && settingsError.code !== 'PGRST116') { // PGRST116 means no rows found, which is fine
        console.error("[AccountSettingsPage fetchAccountData] Error fetching user_settings:", settingsError);
        throw settingsError;
      }

      const fetchedSettings = settingsData as UserSettings | null;
      setUserSettings(fetchedSettings); // Update state

      // Prepare values for form reset, ensuring all fields have fallbacks to defaultFormValues
      const resetData: AccountSettingsFormValues = {
        ...defaultFormValues, // Start with all defaults
        displayName: fetchedSettings?.full_name ?? user.user_metadata?.full_name ?? defaultFormValues.displayName,
        usagePreference: fetchedSettings?.usage_preference ?? defaultFormValues.usagePreference,
        cadenceFu1: (fetchedSettings?.follow_up_cadence_days as [number,number,number] | null)?.[0] ?? defaultFormValues.cadenceFu1,
        cadenceFu2: (fetchedSettings?.follow_up_cadence_days as [number,number,number] | null)?.[1] ?? defaultFormValues.cadenceFu2,
        cadenceFu3: (fetchedSettings?.follow_up_cadence_days as [number,number,number] | null)?.[2] ?? defaultFormValues.cadenceFu3,
        defaultEmailTemplates: {
          followUp1: {
            subject: (fetchedSettings?.default_email_templates as DefaultFollowUpTemplates | null)?.followUp1?.subject ?? defaultFormValues.defaultEmailTemplates.followUp1.subject,
            openingLine: (fetchedSettings?.default_email_templates as DefaultFollowUpTemplates | null)?.followUp1?.openingLine ?? defaultFormValues.defaultEmailTemplates.followUp1.openingLine,
          },
          followUp2: {
            subject: (fetchedSettings?.default_email_templates as DefaultFollowUpTemplates | null)?.followUp2?.subject ?? defaultFormValues.defaultEmailTemplates.followUp2.subject,
            openingLine: (fetchedSettings?.default_email_templates as DefaultFollowUpTemplates | null)?.followUp2?.openingLine ?? defaultFormValues.defaultEmailTemplates.followUp2.openingLine,
          },
          followUp3: {
            subject: (fetchedSettings?.default_email_templates as DefaultFollowUpTemplates | null)?.followUp3?.subject ?? defaultFormValues.defaultEmailTemplates.followUp3.subject,
            openingLine: (fetchedSettings?.default_email_templates as DefaultFollowUpTemplates | null)?.followUp3?.openingLine ?? defaultFormValues.defaultEmailTemplates.followUp3.openingLine,
          },
          sharedSignature: (fetchedSettings?.default_email_templates as DefaultFollowUpTemplates | null)?.sharedSignature ?? defaultFormValues.defaultEmailTemplates.sharedSignature,
        },
        ageRange: fetchedSettings?.age_range ?? defaultFormValues.ageRange,
        country: fetchedSettings?.country ?? defaultFormValues.country,
        annualIncome: fetchedSettings?.annual_income ?? defaultFormValues.annualIncome,
        incomeCurrency: fetchedSettings?.income_currency ?? defaultFormValues.incomeCurrency,
        currentRole: fetchedSettings?.current_role ?? defaultFormValues.currentRole,
      };
      
      // Ensure annualIncome is a number or empty string for the form control, not null
      if (resetData.annualIncome === null) {
          resetData.annualIncome = '';
      }
      if (resetData.incomeCurrency === null) {
          resetData.incomeCurrency = '';
      }


      console.log("[AccountSettingsPage fetchAccountData] Resetting form with values:", resetData);
      settingsForm.reset(resetData);

    } catch (error: any) {
      console.error("[AccountSettingsPage fetchAccountData] CATCH block error:", error);
      toast({ title: 'Error Fetching Settings', description: error.message || "Could not load your settings.", variant: 'destructive' });
      // Fallback to default form values if fetch fails catastrophically
      settingsForm.reset(defaultFormValues);
    } finally {
      console.log("[AccountSettingsPage fetchAccountData] FINALLY block. Setting isFetchingSettings: false, hasFetchedData: true");
      setIsFetchingSettings(false);
      setHasFetchedData(true);
    }
  }, [toast, settingsForm]);


  useEffect(() => {
    console.log(`[AccountSettingsPage] Auth useEffect RUNNING. Initial isLoadingAuth: ${isLoadingAuth}`);
    setIsLoadingAuth(true);
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(`[AccountSettingsPage] onAuthStateChange EVENT: ${event} Session User ID: ${session?.user?.id}`);
      const user = session?.user ?? null;
      if (user?.id !== previousUserIdRef.current) {
        console.log(`[AccountSettingsPage] Auth useEffect - User updated. Previous: ${previousUserIdRef.current}, New: ${user?.id}. Resetting hasFetchedData.`);
        setHasFetchedData(false);
        setUserSettings(null); // Reset settings if user changes
        settingsForm.reset(defaultFormValues); // Reset form to defaults if user changes or logs out
      }
      setCurrentUser(user);
      previousUserIdRef.current = user?.id;
      setIsLoadingAuth(false);
      console.log(`[AccountSettingsPage] Auth useEffect FINISHED. isLoadingAuth set to false. currentUser ID: ${user?.id}`);
    });

    // Initial check
    supabase.auth.getUser().then(({ data: { user } }) => {
      console.log(`[AccountSettingsPage] Initial getUser() processed. Session User ID: ${user?.id}`);
       if (user?.id !== previousUserIdRef.current) {
        setHasFetchedData(false);
        setUserSettings(null);
        settingsForm.reset(defaultFormValues);
      }
      setCurrentUser(user);
      previousUserIdRef.current = user?.id;
      setIsLoadingAuth(false); // Ensure this is set after initial check too
    });
    return () => authListener.subscription.unsubscribe();
  }, [settingsForm]); // Added settingsForm to deps as it's used in the effect

  useEffect(() => {
    console.log(`[AccountSettingsPage] Data Fetch useEffect RUNNING. currentUser ID: ${currentUser?.id}, isLoadingAuth: ${isLoadingAuth}, hasFetchedData: ${hasFetchedData}`);
    if (currentUser && !isLoadingAuth && !hasFetchedData) {
      console.log(`[AccountSettingsPage] Data Fetch useEffect - CONDITIONS MET, calling fetchAccountData with currentUser: ${currentUser.id}`);
      fetchAccountData(currentUser);
    } else {
      console.log(`[AccountSettingsPage] Data Fetch useEffect - Conditions NOT MET (isLoadingAuth is ${isLoadingAuth}, currentUser is ${currentUser ? 'defined' : 'null'}, hasFetchedData is ${hasFetchedData}).`);
    }
  }, [currentUser, isLoadingAuth, hasFetchedData, fetchAccountData]);


  const onSettingsSubmit = async (values: AccountSettingsFormValues) => {
    if (!currentUser) {
      toast({ title: 'Not Authenticated', description: 'Please log in.', variant: 'destructive' });
      return;
    }
    setIsFetchingSettings(true); 
    try {
      const settingsDataToUpsert = {
        user_id: currentUser.id,
        full_name: values.displayName || null,
        usage_preference: values.usagePreference,
        follow_up_cadence_days: [values.cadenceFu1, values.cadenceFu2, values.cadenceFu3] as unknown as Json,
        default_email_templates: values.defaultEmailTemplates as unknown as Json,
        age_range: values.ageRange,
        country: values.country,
        annual_income: values.annualIncome ? Number(values.annualIncome) : null,
        income_currency: values.incomeCurrency || null,
        current_role: values.currentRole,
        onboarding_complete: userSettings?.onboarding_complete ?? true,
      };
      const { error: settingsUpsertError } = await supabase
        .from('user_settings')
        .upsert(settingsDataToUpsert, { onConflict: 'user_id' });
      if (settingsUpsertError) throw settingsUpsertError;

      if (currentUser.user_metadata?.full_name !== values.displayName) {
          const { error: userUpdateError } = await supabase.auth.updateUser({
              data: { full_name: values.displayName || '' }
          });
          if (userUpdateError) {
            console.warn("Could not update Supabase Auth user_metadata.full_name:", userUpdateError.message);
          }
      }

      toast({ title: 'Settings Updated', description: 'Your account settings have been saved.' });
      setUserSettings(prev => ({...(prev || {} as UserSettings), ...settingsDataToUpsert, user_id: currentUser.id}));
      
    } catch (error: any) {
      toast({ title: 'Error Saving Settings', description: error.message, variant: 'destructive' });
    } finally {
      setIsFetchingSettings(false);
    }
  };

  const onPasswordSubmit = async (values: PasswordChangeFormValues) => {
    if (!currentUser) {
      toast({ title: 'Not Authenticated', description: 'Please log in.', variant: 'destructive' });
      return;
    }
    setIsPasswordUpdating(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: values.newPassword });
      if (error) throw error;
      toast({ title: 'Password Updated', description: 'Your password has been changed successfully.' });
      passwordForm.reset();
    } catch (error: any) {
      toast({ title: 'Error Updating Password', description: error.message, variant: 'destructive' });
    } finally {
      setIsPasswordUpdating(false);
    }
  };

  const handleProceedToDeleteStep2 = () => {
    setIsDeleteStep1Open(false);
    setIsDeleteStep2Open(true);
    setDeleteConfirmationInput('');
  };

  const handleConfirmAccountDeletion = async () => {
    if (!currentUser || deleteConfirmationInput !== DELETE_CONFIRMATION_PHRASE) {
      toast({ title: 'Confirmation Failed', description: 'Please type the confirmation phrase correctly.', variant: 'destructive' });
      return;
    }
    setIsDeletingAccount(true);
    try {
      const tablesToDeleteFrom = [
        'follow_ups',
        'job_opening_contacts',
        'job_openings',
        'contacts',
        'companies',
        'user_settings',
        'user_subscriptions',
        'posts',
      ];

      for (const tableName of tablesToDeleteFrom) {
        const { error } = await supabase
          .from(tableName)
          .delete()
          .eq('user_id', currentUser.id);
        if (error) {
          throw new Error(`Failed to delete data from ${tableName}. ${error.message}`);
        }
      }

      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {}

      toast({
        title: 'Account Data Deleted',
        description: 'All your application data has been successfully deleted. You have been signed out. Your authentication record still exists but is no longer associated with any application data.',
        duration: 10000,
      });
      router.push('/landing');

    } catch (error: any) {
      toast({ title: 'Account Deletion Failed', description: error.message || 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setIsDeletingAccount(false);
      setIsDeleteStep2Open(false);
      setDeleteConfirmationInput('');
    }
  };

  if (isLoadingAuth) {
    return <AppLayout><div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div></AppLayout>;
  }
  if (!currentUser) {
     return <AppLayout><Card><CardHeader><CardTitle>Access Denied</CardTitle></CardHeader><CardContent><p>Please log in to access account settings.</p><Button asChild className="mt-4"><Link href="/auth">Sign In</Link></Button></CardContent></Card></AppLayout>;
  }

  const showSettingsLoader = isFetchingSettings && !hasFetchedData;


  return (
    <AppLayout>
      <div className="space-y-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight font-headline flex items-center">
            <SettingsIcon className="mr-3 h-7 w-7 text-primary" />
            Account Settings
          </h2>
          <p className="text-muted-foreground">Manage your profile, preferences, and application settings.</p>
        </div>

        <Form {...settingsForm}>
          <form onSubmit={settingsForm.handleSubmit(onSettingsSubmit)} className="space-y-8">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="font-headline flex items-center"><UserCircle className="mr-2 h-5 w-5 text-primary"/> Profile</CardTitle>
                <CardDescription>Update your display name and general profile information.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                 {showSettingsLoader ? (
                  <>
                    <SkeletonItem label="Display Name" />
                    <SkeletonItem label="Current Role/Profession" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <SkeletonItem label="Age Range" type="select" />
                      <SkeletonItem label="Country of Residence" />
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <SkeletonItem label="Annual Income (Optional)" />
                      <SkeletonItem label="Income Currency (Optional)" type="select" />
                    </div>
                  </>
                ) : (
                <>
                <FormField
                  control={settingsForm.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Your Name" {...field} disabled={isFetchingSettings || settingsForm.formState.isSubmitting} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={settingsForm.control}
                  name="currentRole"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Role/Profession</FormLabel>
                      <FormControl><Input placeholder="e.g., Software Engineer" {...field} disabled={isFetchingSettings || settingsForm.formState.isSubmitting} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                        control={settingsForm.control}
                        name="ageRange"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Age Range</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={isFetchingSettings || settingsForm.formState.isSubmitting}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select your age range" /></SelectTrigger></FormControl>
                            <SelectContent>
                                {AGE_RANGES.map(range => <SelectItem key={range} value={range}>{range}</SelectItem>)}
                            </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={settingsForm.control}
                        name="country"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Country of Residence</FormLabel>
                            <FormControl><Input placeholder="e.g., United States" {...field} disabled={isFetchingSettings || settingsForm.formState.isSubmitting} /></FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                        control={settingsForm.control}
                        name="annualIncome"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Annual Income (Optional)</FormLabel>
                            <FormControl><Input type="number" placeholder="e.g., 50000" {...field} onChange={e => field.onChange(e.target.value === '' ? '' : parseFloat(e.target.value))} disabled={isFetchingSettings || settingsForm.formState.isSubmitting} /></FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={settingsForm.control}
                        name="incomeCurrency"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Income Currency (Optional)</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ''} disabled={isFetchingSettings || settingsForm.formState.isSubmitting}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select currency" /></SelectTrigger></FormControl>
                            <SelectContent>
                                {CURRENCIES.map(currency => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}
                            </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                </div>
                </>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="font-headline flex items-center"><SlidersHorizontal className="mr-2 h-5 w-5 text-primary"/> Usage Preference</CardTitle>
                <CardDescription>This feature is coming soon. Your selection here will help tailor your experience in the future.</CardDescription>
              </CardHeader>
              <CardContent>
                 {showSettingsLoader ? <SkeletonItem label="Primary Usage" type="select" /> : (
                <FormField
                  control={settingsForm.control}
                  name="usagePreference"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Primary Usage</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={true || isFetchingSettings} // Always disabled, or also when fetching
                      >
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select your primary goal" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {USAGE_PREFERENCES.map(pref => (
                            <SelectItem key={pref.value} value={pref.value}>{pref.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 )}
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="font-headline flex items-center"><SlidersHorizontal className="mr-2 h-5 w-5 text-primary"/> Follow-up Cadence</CardTitle>
                <CardDescription>Set the default number of days after the initial email for each follow-up. Must be sequential.</CardDescription>
              </CardHeader>
              <CardContent className="grid md:grid-cols-3 gap-4">
                {showSettingsLoader ? <> <SkeletonItem label="Follow-up 1 (days)" /> <SkeletonItem label="Follow-up 2 (days)" /> <SkeletonItem label="Follow-up 3 (days)" /> </> : (
                <>
                <FormField
                  control={settingsForm.control}
                  name="cadenceFu1"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Follow-up 1 (days after initial)</FormLabel>
                      <FormControl><Input type="number" min="1" max="90" {...field} disabled={isFetchingSettings || settingsForm.formState.isSubmitting} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={settingsForm.control}
                  name="cadenceFu2"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Follow-up 2 (days after initial)</FormLabel>
                      <FormControl><Input type="number" min="1" max="90" {...field} disabled={isFetchingSettings || settingsForm.formState.isSubmitting} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={settingsForm.control}
                  name="cadenceFu3"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Follow-up 3 (days after initial)</FormLabel>
                      <FormControl><Input type="number" min="1" max="90" {...field} disabled={isFetchingSettings || settingsForm.formState.isSubmitting} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                </>
                )}
              </CardContent>
               {settingsForm.formState.errors?.cadenceFu2?.type === 'manual' && (
                  <CardFooter><p className="text-sm font-medium text-destructive">{settingsForm.formState.errors.cadenceFu2.message}</p></CardFooter>
                )}
            </Card>

            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="font-headline flex items-center"><MailQuestion className="mr-2 h-5 w-5 text-primary"/> Default Email Templates</CardTitle>
                <CardDescription>Set default content for your follow-up emails. These will pre-fill when creating a new job opening.</CardDescription>
              </CardHeader>
              <CardContent>
                {showSettingsLoader ? <div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-20 w-full" /></div> : (
                <Accordion type="multiple" className="w-full mb-6">
                  {(['followUp1', 'followUp2', 'followUp3'] as const).map((fuKey, index) => (
                    <AccordionItem value={`item-${index + 1}`} key={fuKey}>
                      <AccordionTrigger className="font-semibold">Default Content for Follow-up {index + 1}</AccordionTrigger>
                      <AccordionContent className="space-y-4 pt-2">
                        <FormField
                          control={settingsForm.control}
                          name={`defaultEmailTemplates.${fuKey}.subject`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Subject Line</FormLabel>
                              <FormControl><Input placeholder={`Subject for Follow-up ${index + 1}`} {...field} value={field.value || ''} disabled={isFetchingSettings || settingsForm.formState.isSubmitting} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={settingsForm.control}
                          name={`defaultEmailTemplates.${fuKey}.openingLine`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Opening Line / Main Content</FormLabel>
                              <FormControl><Textarea placeholder={`Opening line/body for Follow-up ${index + 1}`} {...field} value={field.value || ''} rows={3} disabled={isFetchingSettings || settingsForm.formState.isSubmitting} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
                )}

                {showSettingsLoader ? <SkeletonItem label="Shared Email Signature" type="textarea" /> : (
                <FormField
                  control={settingsForm.control}
                  name="defaultEmailTemplates.sharedSignature"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold flex items-center"><Edit3 className="mr-2 h-4 w-4 text-muted-foreground" /> Shared Email Signature</FormLabel>
                       <CardDescription className="text-xs mb-2">This signature will be appended to all default follow-up email templates.</CardDescription>
                      <FormControl><Textarea placeholder="Your default signature (e.g., Best regards, Your Name)" {...field} value={field.value || ''} rows={3} disabled={isFetchingSettings || settingsForm.formState.isSubmitting}/></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                )}
              </CardContent>
            </Card>

            <div className="flex justify-end pt-4">
              <Button type="submit" size="lg" disabled={isFetchingSettings || settingsForm.formState.isSubmitting}>
                { (isFetchingSettings || settingsForm.formState.isSubmitting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save All Settings
              </Button>
            </div>
          </form>
        </Form>

        <Form {...passwordForm}>
          <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-8">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="font-headline flex items-center"><KeyRound className="mr-2 h-5 w-5 text-primary"/> Change Password</CardTitle>
                <CardDescription>Update your account password. Choose a strong, unique password.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                 {showSettingsLoader ? <> <SkeletonItem label="New Password" /> <SkeletonItem label="Confirm New Password" /> </> : (
                <>
                <FormField
                  control={passwordForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Enter new password" {...field} disabled={isPasswordUpdating || isFetchingSettings} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm New Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Confirm new password" {...field} disabled={isPasswordUpdating || isFetchingSettings} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                </>
                 )}
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={isPasswordUpdating || isFetchingSettings}>
                  {isPasswordUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update Password
                </Button>
              </CardFooter>
            </Card>
          </form>
        </Form>

        <Card className="shadow-lg border-destructive">
          <CardHeader>
            <CardTitle className="font-headline flex items-center text-destructive"><ShieldAlert className="mr-2 h-5 w-5"/> Danger Zone</CardTitle>
            <CardDescription className="text-destructive/90">Account deletion is permanent and cannot be undone.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Deleting your account will permanently remove all your associated data, including:
              job openings, contacts, companies, follow-up schedules, email templates, user settings, and subscription information.
              Your authentication record will remain but will no longer be associated with any application data.
            </p>
            <Button variant="destructive" onClick={() => setIsDeleteStep1Open(true)} disabled={isDeletingAccount || isFetchingSettings}>
              {isDeletingAccount ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Delete My Account
            </Button>
          </CardContent>
        </Card>

        <AlertDialog open={isDeleteStep1Open} onOpenChange={setIsDeleteStep1Open}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action is irreversible. All your data including job openings, contacts,
                companies, follow-up schedules, email templates, user settings, and
                subscription information will be <strong>permanently deleted</strong>. Your authentication
                record will remain, but will be disassociated from all application data.
                <br /><br />
                Are you sure you want to proceed?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setIsDeleteStep1Open(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleProceedToDeleteStep2} className="bg-destructive hover:bg-destructive/90">
                I understand, proceed to delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={isDeleteStep2Open} onOpenChange={setIsDeleteStep2Open}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Final Confirmation Required</AlertDialogTitle>
              <AlertDialogDescription>
                To confirm permanent deletion of your account and all associated data, please type the following phrase exactly as shown below:
                <br />
                <strong className="text-destructive font-mono my-2 block">{DELETE_CONFIRMATION_PHRASE}</strong>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              type="text"
              value={deleteConfirmationInput}
              onChange={(e) => setDeleteConfirmationInput(e.target.value)}
              placeholder="Type the phrase here"
              className="border-destructive focus-visible:ring-destructive"
            />
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setIsDeleteStep2Open(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmAccountDeletion}
                disabled={deleteConfirmationInput !== DELETE_CONFIRMATION_PHRASE || isDeletingAccount}
                className="bg-destructive hover:bg-destructive/90"
              >
                {isDeletingAccount ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Confirm Permanent Deletion
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </AppLayout>
  );
}

// Helper for skeleton UI
const SkeletonItem: React.FC<{label: string, type?: 'input' | 'select' | 'textarea'}> = ({label, type = 'input'}) => (
  <FormItem>
    <FormLabel><Label>{label}</Label></FormLabel>
    <Skeleton className={type === 'textarea' ? "h-20 w-full" : "h-10 w-full"} />
  </FormItem>
);

    
    