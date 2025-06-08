
'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/lib/supabaseClient';
import type { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import type { UserSettings, UsagePreference } from '@/lib/types';
import type { TablesInsert } from '@/lib/database.types';

const AGE_RANGES = ["Under 18", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
const CURRENCIES = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "Other"];
const DEFAULT_FOLLOW_UP_CADENCE_DAYS = [7, 14, 21];

const onboardingSchema = z.object({
  fullName: z.string().min(1, "Full name is required").max(100, "Name too long"),
  ageRange: z.string().min(1, "Age range is required"),
  country: z.string().min(1, "Country is required").max(100, "Country name too long"),
  annualIncome: z.coerce.number().positive("Income must be positive").optional().or(z.literal('')),
  incomeCurrency: z.string().optional(),
  currentRole: z.string().min(1, "Current role is required").max(100, "Role name too long"),
});

type OnboardingFormValues = z.infer<typeof onboardingSchema>;

interface OnboardingFormProps {
  user: User;
  userId: string;
  userEmail?: string | null;
  initialFullName?: string | null;
  existingSettings: UserSettings | null;
  onOnboardingComplete: () => void;
}

export function OnboardingForm({
  user,
  userId,
  userEmail,
  initialFullName,
  existingSettings,
  onOnboardingComplete
}: OnboardingFormProps) {
  const { toast } = useToast();
  const form = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      fullName: existingSettings?.full_name || initialFullName || '',
      ageRange: existingSettings?.age_range || '',
      country: existingSettings?.country || '',
      annualIncome: existingSettings?.annual_income || '',
      incomeCurrency: existingSettings?.income_currency || '',
      currentRole: existingSettings?.current_role || '',
    },
  });

  const attemptSaveSettings = async (values: OnboardingFormValues) => {
    if (!userId) {
      toast({ title: 'Authentication Error', description: 'User ID is missing.', variant: 'destructive' });
      return;
    }

    const settingsData: Omit<TablesInsert<'user_settings'>, 'user_id' | 'onboarding_complete'> & { onboarding_complete: boolean, user_id: string } = {
      user_id: userId,
      full_name: values.fullName,
      age_range: values.ageRange,
      country: values.country,
      annual_income: values.annualIncome ? Number(values.annualIncome) : null,
      income_currency: values.incomeCurrency || null,
      current_role: values.currentRole,
      onboarding_complete: true,
      usage_preference: existingSettings?.usage_preference || 'job_hunt',
      follow_up_cadence_days: existingSettings?.follow_up_cadence_days || DEFAULT_FOLLOW_UP_CADENCE_DAYS,
      default_email_templates: existingSettings?.default_email_templates || {
        followUp1: { subject: '', openingLine: '' },
        followUp2: { subject: '', openingLine: '' },
        followUp3: { subject: '', openingLine: '' },
        sharedSignature: '',
      },
    };

    try {
      // Attempt to INSERT first
      const { error: insertError } = await supabase
        .from('user_settings')
        .insert(settingsData);

      if (insertError) {
        if (insertError.code === '23505') { // Unique violation: row for user_id already exists
          // Try to UPDATE
          const { error: updateError } = await supabase
            .from('user_settings')
            .update(settingsData) // Supabase client's update will only update provided fields
            .eq('user_id', userId);

          if (updateError) {
            console.error("Error updating user_settings after insert failed:", updateError);
            toast({
              title: 'Onboarding Save Failed',
              description: `Could not update existing settings. ${updateError.message || 'Please try again.'}`,
              variant: 'destructive',
              duration: 7000,
            });
            return; // Stop if update fails
          }
          // Update successful
        } else if (insertError.code === '23503') { // Foreign key violation
          console.error("Foreign key violation on insert user_settings:", insertError);
          toast({
            title: 'Data Sync Error',
            description: 'Could not save settings due to a data synchronization issue with your new account. This can happen occasionally. Please try submitting again in a few moments. (Error code: 23503)',
            variant: 'destructive',
            duration: 10000,
          });
          return; // Stop if it's the FK violation
        } else {
          // Other INSERT error
          console.error("Error inserting user_settings:", insertError);
          throw insertError; // Let the generic catch block handle it
        }
      }

      // If INSERT was successful OR (INSERT failed with 23505 AND UPDATE was successful)
      toast({ title: 'Onboarding Complete!', description: 'Welcome to ProspectFlow!' });
      onOnboardingComplete();

    } catch (error: any) {
      // Generic catch for errors not specifically handled above
      console.error("Full error object in onboarding (generic catch):", error);
      let errorMessage = "An unexpected error occurred during onboarding.";
      let errorDetails = "";

      if (error && typeof error === 'object') {
        if ('message' in error && typeof error.message === 'string' && error.message) {
          errorMessage = `Error: ${error.message}`;
        }
        if ('details' in error && typeof error.details === 'string') errorDetails = error.details;
        if ('hint' in error && typeof error.hint === 'string') errorDetails += ` Hint: ${error.hint}`;
        if (!error.message && !error.details && !error.hint) {
             try { errorDetails = JSON.stringify(error); } catch (e) { errorDetails = "Could not stringify error object."}
        }
      }

      toast({
        title: 'Onboarding Save Failed',
        description: `${errorMessage}${errorDetails ? ` Details: ${errorDetails}` : ''}`,
        variant: 'destructive',
        duration: 10000,
      });
    }
  };


  return (
    <Dialog open={true} onOpenChange={() => {}}> {/* Controlled by AppLayout */}
      <DialogContent className="sm:max-w-lg" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="font-headline text-2xl">Welcome to ProspectFlow!</DialogTitle>
          <DialogDescription>
            Let's get you set up. Please tell us a bit about yourself.
            {userEmail && (<span className="block text-xs mt-1 text-muted-foreground">For account: {userEmail}</span>)}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(attemptSaveSettings)} className="space-y-4 max-h-[70vh] overflow-y-auto p-1">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl><Input placeholder="Your full name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="currentRole"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current Role/Profession</FormLabel>
                  <FormControl><Input placeholder="e.g., Software Engineer, Sales Manager" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="ageRange"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Age Range</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country of Residence</FormLabel>
                    <FormControl><Input placeholder="e.g., United States" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="annualIncome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Annual Income (Optional)</FormLabel>
                    <FormControl><Input type="number" placeholder="e.g., 50000" {...field} onChange={e => field.onChange(e.target.value === '' ? '' : parseFloat(e.target.value))} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="incomeCurrency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Income Currency (Optional)</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
            <DialogFooter className="pt-4">
              <Button type="submit" disabled={form.formState.isSubmitting} className="w-full">
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Get Started
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
