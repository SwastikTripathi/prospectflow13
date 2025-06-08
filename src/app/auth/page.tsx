
'use client';

import { useEffect, useState, useRef } // Added useRef
from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { PublicNavbar } from '@/components/layout/PublicNavbar';

const signInSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(1, { message: 'Password is required.' }),
});

const signUpSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
  confirmPassword: z.string().min(1, { message: 'Please confirm your password.' })
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match.",
  path: ["confirmPassword"],
});

type SignInFormValues = z.infer<typeof signInSchema>;
type SignUpFormValues = z.infer<typeof signUpSchema>;

// Simple Google Icon SVG
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" className="mr-2">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
    <path d="M1 1h22v22H1z" fill="none" />
  </svg>
);

export default function AuthPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showConfirmationMessage, setShowConfirmationMessage] = useState(false);
  const [defaultTab, setDefaultTab] = useState<'signin' | 'signup'>('signin');
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);
  const [showSignUpConfirmPassword, setShowSignUpConfirmPassword] = useState(false);

  const isCheckingAuthRef = useRef(isCheckingAuth); // Ref to track current state for logging
  useEffect(() => {
    isCheckingAuthRef.current = isCheckingAuth;
  }, [isCheckingAuth]);

  const signInForm = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const signUpForm = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
  });

  useEffect(() => {
    console.log('[AuthPage useEffect] Hook started. Pathname:', pathname, 'Window hash:', window.location.hash, 'Search:', window.location.search);
    setIsCheckingAuth(true); // Start with loader active
    console.log('[AuthPage useEffect] isCheckingAuth set to true.');

    const currentSearchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const hasAuthCodeInQuery = currentSearchParams.has('code');
    const hasAccessTokenInHash = typeof window !== 'undefined' && window.location.hash.includes('access_token');

    console.log('[AuthPage useEffect] URL Check: hasAuthCodeInQuery:', hasAuthCodeInQuery, 'hasAccessTokenInHash:', hasAccessTokenInHash);

    const checkSession = async () => {
      console.log('[AuthPage checkSession] Starting session check.');
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('[AuthPage checkSession] Error getting session:', error);
          toast({ title: 'Auth Check Error', description: `Error getting session: ${error.message}`, variant: 'destructive' });
          setIsCheckingAuth(false);
          console.log('[AuthPage checkSession] isCheckingAuth set to false due to error.');
          return;
        }

        console.log('[AuthPage checkSession] Session data:', session);
        if (session) {
          console.log('[AuthPage checkSession] Session found, redirecting to /');
          router.replace('/');
          // No explicit setIsCheckingAuth(false) here, as redirection will unmount or onAuthStateChange handles it.
        } else {
          console.log('[AuthPage checkSession] No active session.');
          setIsCheckingAuth(false);
          console.log('[AuthPage checkSession] isCheckingAuth set to false (no session).');
        }
      } catch (error: any) {
        console.error("[AuthPage checkSession] Exception during session check:", error);
        toast({ title: 'Auth Check Error', description: 'Could not check session due to an exception.', variant: 'destructive' });
        setIsCheckingAuth(false);
        console.log('[AuthPage checkSession] isCheckingAuth set to false due to exception.');
      }
    };

    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AuthPage onAuthStateChange] Event:', event, 'Session:', session, 'Code in URL:', hasAuthCodeInQuery);
      if (event === 'SIGNED_IN' && session) {
        console.log('[AuthPage onAuthStateChange] SIGNED_IN event, redirecting to /');
        router.replace('/');
        setIsCheckingAuth(false);
        console.log('[AuthPage onAuthStateChange] isCheckingAuth set to false (SIGNED_IN).');
      } else if (event === 'INITIAL_SESSION') {
        console.log('[AuthPage onAuthStateChange] INITIAL_SESSION event.');
        if (session) {
          console.log('[AuthPage onAuthStateChange] INITIAL_SESSION: Session found, redirecting to /');
          router.replace('/');
          setIsCheckingAuth(false); // Session found, safe to turn off loader
        } else {
          // No session on initial load.
          if (hasAuthCodeInQuery) {
            // Code is present, Supabase client is expected to process it and fire SIGNED_IN.
            // So, KEEP isCheckingAuth = true to show loader.
            console.log('[AuthPage onAuthStateChange] INITIAL_SESSION: No session, but code in URL. Loader remains active.');
            // DO NOT set setIsCheckingAuth(false) here.
          } else {
            // No session, NO code. Safe to show form.
            setIsCheckingAuth(false);
            console.log('[AuthPage onAuthStateChange] INITIAL_SESSION: No session, no code. Loader disabled.');
          }
        }
        console.log('[AuthPage onAuthStateChange] INITIAL_SESSION processing complete. isCheckingAuth after processing:', isCheckingAuthRef.current);
      } else if (event === 'SIGNED_OUT') {
        console.log('[AuthPage onAuthStateChange] SIGNED_OUT event.');
        setIsCheckingAuth(false);
        console.log('[AuthPage onAuthStateChange] isCheckingAuth set to false (SIGNED_OUT).');
      } else if (event === 'PASSWORD_RECOVERY') {
        console.log('[AuthPage onAuthStateChange] PASSWORD_RECOVERY event.');
      } else if (event === 'USER_UPDATED') {
        console.log('[AuthPage onAuthStateChange] USER_UPDATED event.');
      } else if (event === 'TOKEN_REFRESHED') {
         console.log('[AuthPage onAuthStateChange] TOKEN_REFRESHED event.');
      }
    });

    if (hasAuthCodeInQuery || hasAccessTokenInHash) {
      // Code/token in URL, rely on onAuthStateChange.
      // isCheckingAuth remains true until onAuthStateChange resolves the session or determines no session.
      console.log('[AuthPage useEffect] Auth code or hash token detected. Relying on onAuthStateChange. Loader remains active initially.');
    } else {
      // No code/token in URL, check for an existing session.
      console.log('[AuthPage useEffect] No auth code or hash token in URL. Calling checkSession.');
      checkSession();
    }

    return () => {
      console.log('[AuthPage useEffect] Cleanup: Unsubscribing auth listener.');
      authSubscription?.unsubscribe();
    };
  }, [router, toast, pathname]);


  const handleSignIn = async (values: SignInFormValues) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (error) {
        setAuthError(error.message);
        toast({ title: 'Sign In Failed', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Signed In Successfully!'});
        // Redirect is handled by onAuthStateChange
      }
    } catch (error: any) {
      setAuthError(error.message || 'An unexpected error occurred.');
      toast({ title: 'Sign In Error', description: error.message || 'An unexpected error occurred.', variant: 'destructive' });
    }
    setIsLoading(false);
  };

  const handleSignUp = async (values: SignUpFormValues) => {
    setIsLoading(true);
    setAuthError(null);
    setShowConfirmationMessage(false);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
      });

      if (error) {
        setAuthError(error.message);
        toast({ title: 'Sign Up Failed', description: error.message, variant: 'destructive' });
      } else if (data.session) {
        toast({ title: 'Account Created & Signed In!' });
        // Redirect is handled by onAuthStateChange
      } else if (data.user && !data.session) {
        setShowConfirmationMessage(true);
        toast({ title: 'Account Created!', description: 'Please check your email to confirm your account.' });
        signUpForm.reset();
        signInForm.setValue('email', values.email);
        setDefaultTab('signin');
      } else {
         setAuthError('An unexpected outcome occurred during sign up.');
         toast({ title: 'Sign Up Issue', description: 'An unexpected outcome occurred.', variant: 'destructive' });
      }
    } catch (error: any) {
      setAuthError(error.message || 'An unexpected error occurred.');
      toast({ title: 'Sign Up Error', description: error.message || 'An unexpected error occurred.', variant: 'destructive' });
    }
    setIsLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setAuthError(null);

    const siteURL = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
    if (!siteURL) {
      toast({ title: 'Configuration Error', description: 'Could not determine site URL. Google Sign-In aborted.', variant: 'destructive' });
      setIsGoogleLoading(false);
      return;
    }
    const redirectURL = `${siteURL}${pathname}`;
    console.log('[AuthPage handleGoogleSignIn] Redirect URL for Google OAuth:', redirectURL);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectURL,
      },
    });
    if (error) {
      setAuthError(error.message);
      toast({ title: 'Google Sign-In Failed', description: error.message, variant: 'destructive' });
      setIsGoogleLoading(false);
    }
  };

  console.log('[AuthPage render] Current isCheckingAuth state:', isCheckingAuth);
  if (isCheckingAuth) {
    console.log('[AuthPage render] isCheckingAuth is true, rendering loader.');
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <PublicNavbar />
        <main className="flex flex-1 items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </main>
      </div>
    );
  }
  console.log('[AuthPage render] isCheckingAuth is false, rendering auth form.');

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicNavbar />
      <main className="flex flex-1 items-center justify-center p-4">
        <Tabs value={defaultTab} onValueChange={(value) => setDefaultTab(value as 'signin'|'signup')} className="w-full max-w-md">
            <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign In</TabsTrigger>
            <TabsTrigger value="signup">Create Account</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
            <Card className="shadow-xl">
                <CardHeader>
                <CardTitle className="font-headline">Welcome Back!</CardTitle>
                <CardDescription>Sign in to access your ProspectFlow dashboard.</CardDescription>
                </CardHeader>
                <Form {...signInForm}>
                <form onSubmit={signInForm.handleSubmit(handleSignIn)}>
                    <CardContent className="space-y-4">
                    <FormField
                        control={signInForm.control}
                        name="email"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                            <Input type="email" placeholder="you@example.com" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={signInForm.control}
                        name="password"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                            <Input type="password" placeholder="••••••••" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    {showConfirmationMessage && (
                        <p className="text-sm text-green-600 bg-green-50 p-3 rounded-md border border-green-200">
                        Account created! Please check your email to confirm your account before signing in.
                        </p>
                    )}
                    {authError && <p className="text-sm text-destructive">{authError}</p>}
                    </CardContent>
                    <CardFooter className="flex-col items-stretch space-y-3">
                    <Button type="submit" className="w-full" disabled={isLoading || isGoogleLoading}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Sign In
                    </Button>
                    <div className="relative my-2">
                        <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">
                            Or continue with
                        </span>
                        </div>
                    </div>
                    <Button variant="outline" type="button" className="w-full" onClick={handleGoogleSignIn} disabled={isLoading || isGoogleLoading}>
                        {isGoogleLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GoogleIcon />}
                        Sign in with Google
                    </Button>
                    </CardFooter>
                </form>
                </Form>
            </Card>
            </TabsContent>
            <TabsContent value="signup">
            <Card className="shadow-xl">
                <CardHeader>
                <CardTitle className="font-headline">Create an Account</CardTitle>
                <CardDescription>Join ProspectFlow to streamline your outreach.</CardDescription>
                </CardHeader>
                <Form {...signUpForm}>
                <form onSubmit={signUpForm.handleSubmit(handleSignUp)}>
                    <CardContent className="space-y-4">
                    <FormField
                        control={signUpForm.control}
                        name="email"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                            <Input type="email" placeholder="you@example.com" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={signUpForm.control}
                        name="password"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Password</FormLabel>
                            <div className="relative">
                                <FormControl>
                                <Input
                                    type={showSignUpPassword ? 'text' : 'password'}
                                    placeholder="Must be at least 6 characters"
                                    {...field}
                                    className="pr-10"
                                />
                                </FormControl>
                                <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-primary"
                                onClick={() => setShowSignUpPassword(!showSignUpPassword)}
                                tabIndex={-1}
                                >
                                {showSignUpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                <span className="sr-only">{showSignUpPassword ? 'Hide password' : 'Show password'}</span>
                                </Button>
                            </div>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={signUpForm.control}
                        name="confirmPassword"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Confirm Password</FormLabel>
                            <div className="relative">
                                <FormControl>
                                <Input
                                    type={showSignUpConfirmPassword ? 'text' : 'password'}
                                    placeholder="Confirm your password"
                                    {...field}
                                    className="pr-10"
                                />
                                </FormControl>
                                <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-primary"
                                onClick={() => setShowSignUpConfirmPassword(!showSignUpConfirmPassword)}
                                tabIndex={-1}
                                >
                                {showSignUpConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                <span className="sr-only">{showSignUpConfirmPassword ? 'Hide password' : 'Show password'}</span>
                                </Button>
                            </div>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    {authError && <p className="text-sm text-destructive">{authError}</p>}
                    </CardContent>
                    <CardFooter className="flex-col items-stretch space-y-3">
                    <Button type="submit" className="w-full" disabled={isLoading || isGoogleLoading}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Create Account
                    </Button>
                    <div className="relative my-2">
                        <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">
                            Or sign up with
                        </span>
                        </div>
                    </div>
                    <Button variant="outline" type="button" className="w-full" onClick={handleGoogleSignIn} disabled={isLoading || isGoogleLoading}>
                        {isGoogleLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GoogleIcon />}
                        Sign up with Google
                    </Button>
                    </CardFooter>
                </form>
                </Form>
            </Card>
            </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
