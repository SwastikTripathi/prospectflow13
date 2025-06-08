
'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const askNameSchema = z.object({
  fullName: z.string().min(1, "Full name is required").max(100, "Name is too long"),
});

type AskNameFormValues = z.infer<typeof askNameSchema>;

interface AskForNameDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSubmitName: (name: string) => Promise<void>; 
  currentEmail?: string; 
}

export function AskForNameDialog({ isOpen, onOpenChange, onSubmitName, currentEmail }: AskForNameDialogProps) {
  const form = useForm<AskNameFormValues>({
    resolver: zodResolver(askNameSchema),
    defaultValues: {
      fullName: '',
    },
  });

  const handleSubmit = async (values: AskNameFormValues) => {
    await onSubmitName(values.fullName);
    // Dialog closing is typically handled by the parent component after successful submission
    // to ensure the parent's state (like pendingInvoiceData) is cleared correctly.
    // However, we can reset the form here if it's still open.
    if (form.formState.isSubmitSuccessful && isOpen) {
        form.reset(); 
    }
  };

  const handleDialogClose = () => {
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-md shadow-xl">
        <DialogHeader>
          <DialogTitle className="font-headline">Enter Your Name for the Invoice</DialogTitle>
          <DialogDescription>
            Please provide your full name. This will be used on the invoice and saved to your profile.
            {currentEmail && (<div className="text-xs mt-1 text-muted-foreground">For account: {currentEmail}</div>)}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-2">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Jane Doe" {...field} autoComplete="name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting} className="w-full">
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Name & Generate Invoice
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
