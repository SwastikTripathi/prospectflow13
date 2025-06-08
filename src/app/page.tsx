"use client";

import { useState, useEffect, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Wand2 } from 'lucide-react';
import { expandText } from '@/ai/flows/expand-text';
import type { ExpandTextInput } from '@/ai/flows/expand-text';
import { useToast } from "@/hooks/use-toast";

const LOCAL_STORAGE_KEY = 'justJotText';

export default function HomePage() {
  const [text, setText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const { toast } = useToast();

  useEffect(() => {
    setIsMounted(true);
    try {
      const savedText = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedText) {
        setText(savedText);
      }
    } catch (error) {
      console.error("Failed to load text from local storage:", error);
      toast({
        title: "Error",
        description: "Could not load saved text.",
        variant: "destructive",
      });
    }
  }, [toast]);

  useEffect(() => {
    if (!isMounted) return;

    const handler = setTimeout(() => {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, text);
      } catch (error) {
        console.error("Failed to save text to local storage:", error);
        toast({
          title: "Error",
          description: "Could not save text automatically.",
          variant: "destructive",
        });
      }
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [text, isMounted, toast]);

  const handleExpandText = async () => {
    if (!text.trim()) {
      toast({
        title: "Input Required",
        description: "Please enter some text to expand.",
        variant: "destructive",
      });
      return;
    }
    setIsLoading(true);
    try {
      const expandedContent = await expandText(text as ExpandTextInput);
      setText(expandedContent);
      toast({
        title: "Text Expanded",
        description: "Your text has been elaborated by AI.",
      });
    } catch (error) {
      console.error("Error expanding text:", error);
      toast({
        title: "Expansion Failed",
        description: "Could not expand text. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isMounted) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 selection:bg-accent selection:text-accent-foreground">
      <Card className="w-full max-w-2xl shadow-xl rounded-xl">
        <CardHeader className="text-center pt-8 pb-4">
          <CardTitle className="text-4xl font-headline text-primary">Just Jot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 p-6 sm:p-8">
          <Textarea
            placeholder="Start jotting..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[250px] sm:min-h-[300px] text-base sm:text-lg rounded-lg border-border focus:ring-2 focus:ring-ring focus:border-ring transition-shadow duration-200 ease-in-out shadow-sm hover:shadow-md focus:shadow-lg"
            rows={12}
            aria-label="Text input area"
          />
          <Button
            onClick={handleExpandText}
            disabled={isLoading || !text.trim()}
            className="w-full bg-accent hover:bg-accent/90 text-accent-foreground py-3 text-md sm:text-lg rounded-lg transition-transform duration-150 ease-in-out hover:scale-[1.02] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-live="polite"
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-5 w-5" />
            )}
            Expand Text
          </Button>
        </CardContent>
      </Card>
      <footer className="text-center py-8 text-muted-foreground text-sm">
        <p>&copy; {new Date().getFullYear()} Just Jot. Jot simply, expand wisely.</p>
      </footer>
    </div>
  );
}
