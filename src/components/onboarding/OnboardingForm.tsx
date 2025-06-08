
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
  existingSettings: UserSettings | null;
  onOnboardingComplete: () => void;
}

export function OnboardingForm({ user, existingSettings, onOnboardingComplete }: OnboardingFormProps) {
  const { toast } = useToast();
  const form = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      fullName: existingSettings?.full_name || user.user_metadata?.full_name || '',
      ageRange: existingSettings?.age_range || '',
      country: existingSettings?.country || '',
      annualIncome: existingSettings?.annual_income || '',
      incomeCurrency: existingSettings?.income_currency || '',
      currentRole: existingSettings?.current_role || '',
    },
  });

  const onSubmit = async (values: OnboardingFormValues) => {
    try {
      const settingsToUpsert: TablesInsert<'user_settings'> = {
        user_id: user.id,
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

      const { error } = await supabase.from('user_settings').upsert(settingsToUpsert, {
        onConflict: 'user_id',
      });

      if (error) throw error;

      if (user.user_metadata?.full_name !== values.fullName) {
        const { error: userUpdateError } = await supabase.auth.updateUser({
          data: { full_name: values.fullName }
        });
        if (userUpdateError) {
          console.warn("Failed to update user_metadata.full_name:", userUpdateError.message);
        }
      }

      toast({ title: 'Onboarding Complete!', description: 'Welcome to ProspectFlow!' });
      onOnboardingComplete(); // Only call on successful save
    } catch (error: any) {
      toast({ title: 'Error Saving Onboarding Data', description: error.message, variant: 'destructive' });
      // Do NOT call onOnboardingComplete() here if save fails, so the form remains.
    }
  };

  return (
    <Dialog open={true} onOpenChange={() => {}}> {/* Controlled by AppLayout */}
      <DialogContent className="sm:max-w-lg" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="font-headline text-2xl">Welcome to ProspectFlow!</DialogTitle>
          <DialogDescription>
            Let's get you set up. Please tell us a bit about yourself.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] overflow-y-auto p-1">
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
