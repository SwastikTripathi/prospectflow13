
'use client';

import { useEffect, useState, useRef }
from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff, KeyRound } from 'lucide-react';
import { PublicNavbar } from '@/components/layout/PublicNavbar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';

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

const forgotPasswordSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address.' }),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
  confirmNewPassword: z.string().min(1, { message: 'Please confirm your new password.' })
}).refine(data => data.newPassword === data.confirmNewPassword, {
  message: "Passwords don't match.",
  path: ["confirmNewPassword"],
});


type SignInFormValues = z.infer<typeof signInSchema>;
type SignUpFormValues = z.infer<typeof signUpSchema>;
type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

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

function getAuthRedirectUrl(): string | undefined {
    const siteURL = process.env.NEXT_PUBLIC_SITE_URL;

    if (!siteURL) {
        console.warn(
            '[AuthPage getAuthRedirectUrl] NEXT_PUBLIC_SITE_URL is not set. Email links might not point to /auth. Supabase will use its dashboard default Site URL.'
        );
        return undefined;
    }

    try {
        const baseUrl = new URL(siteURL);
        let path = baseUrl.pathname;
        if (path.endsWith('/auth') || path.endsWith('/auth/')) {
            baseUrl.pathname = path.replace(/\/+$/, '').replace(/\/auth\/?$/, '/auth');
        } else if (path === '/' || path === '') {
            baseUrl.pathname = '/auth';
        } else {
            baseUrl.pathname = path.replace(/\/$/, '') + '/auth';
        }
        return baseUrl.toString();
    } catch (e) {
        console.error(
            `[AuthPage getAuthRedirectUrl] Invalid NEXT_PUBLIC_SITE_URL ('${siteURL}'). Email links will use Supabase defaults. Error:`, e
        );
        return undefined;
    }
}


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
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);
  const [showSignUpConfirmPassword, setShowSignUpConfirmPassword] = useState(false);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [isSendingResetLink, setIsSendingResetLink] = useState(false);
  const [isPasswordRecoveryMode, setIsPasswordRecoveryMode] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);


  const isCheckingAuthRef = useRef(isCheckingAuth);
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

  const forgotPasswordForm = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const resetPasswordFormHook = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: '', confirmNewPassword: '' },
  });

  useEffect(() => {
    const hashParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.hash.substring(1) : '');
    const isRecoveryFromHash = hashParams.get('type') === 'recovery';

    if (isRecoveryFromHash) {
      setIsPasswordRecoveryMode(true);
      toast({ title: "Set New Password", description: "Please enter and confirm your new password below."});
      setIsCheckingAuth(false); // Key: if hash recovery, immediately stop checking and prevent redirect
    } else {
      // Only set to true if not immediately determined as recovery from hash.
      // And if we are not already in recovery mode from a previous render (e.g. AMR based)
      if (!isPasswordRecoveryMode) {
          setIsCheckingAuth(true);
      }
    }

    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const isAmrRecovery = session?.amr?.some(entry => entry.method === 'recovery');

      // If this event OR the initial hash indicates recovery mode:
      if (event === 'PASSWORD_RECOVERY' || isAmrRecovery ) {
        setIsPasswordRecoveryMode(true);
        // Toast only if not already done by initial hash check (isRecoveryFromHash)
        if (!isRecoveryFromHash && (event === 'PASSWORD_RECOVERY' || isAmrRecovery)) {
            toast({ title: "Set New Password", description: "Please enter and confirm your new password below."});
        }
        setIsCheckingAuth(false);
        return; // Critical: stop further processing if it's a recovery flow
      }

      // If it's a recovery flow already identified (by hash or previous event that set isPasswordRecoveryMode state to true):
      if (isPasswordRecoveryMode) { // Check the current state
        if (event === 'SIGNED_OUT') { setIsPasswordRecoveryMode(false); } // Reset if signed out during recovery
        setIsCheckingAuth(false); // Make sure loading stops, but don't redirect
        return;
      }

      // Standard non-recovery events (isPasswordRecoveryMode state is false here):
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        router.replace('/'); // Safe to redirect, not in recovery mode
      }
      // For SIGNED_OUT or INITIAL_SESSION without session, or any other event,
      // just ensure isCheckingAuth becomes false.
      setIsCheckingAuth(false);
    });

    // Initial session check, only if not recovery by hash and still checking (ref check)
    if (!isRecoveryFromHash && isCheckingAuthRef.current) {
      const checkSession = async () => {
        if (!isCheckingAuthRef.current) return; // Check ref again, might have been set by onAuthStateChange
        try {
          const { data: { session: currentSession }, error } = await supabase.auth.getSession();
          if (error) { setIsCheckingAuth(false); return; }

          const isAmrRecoveryInSession = currentSession?.amr?.some(entry => entry.method === 'recovery');

          if (currentSession && isAmrRecoveryInSession) {
            setIsPasswordRecoveryMode(true);
            // Toast if not already done by hash
            if(!isRecoveryFromHash) toast({ title: "Set New Password", description: "Please enter and confirm your new password below." });
            setIsCheckingAuth(false);
          } else if (currentSession && !isPasswordRecoveryMode) { // Check state here before redirect
            router.replace('/');
            setIsCheckingAuth(false);
          } else { // No session, or already in recovery mode (state is true)
            setIsCheckingAuth(false);
          }
        } catch (err) { setIsCheckingAuth(false); }
      };
      checkSession();
    } else if (isRecoveryFromHash && isCheckingAuthRef.current) {
      // This is a fallback, should have been set to false by hash check already.
      setIsCheckingAuth(false);
    }

    return () => {
      authSubscription?.unsubscribe();
    };
  }, [router, toast, pathname, isPasswordRecoveryMode]); // isPasswordRecoveryMode is a crucial dependency


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

    const signUpRedirectURL = getAuthRedirectUrl();
    console.log(`[AuthPage handleSignUp] Constructed redirectTo for email confirmation: ${signUpRedirectURL}`);


    if (!signUpRedirectURL && process.env.NEXT_PUBLIC_SITE_URL) {
        toast({ title: 'Configuration Error', description: 'Site URL is improperly configured. Cannot proceed with sign up.', variant: 'destructive' });
        setIsLoading(false);
        return;
    }
    
    try {
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          emailRedirectTo: signUpRedirectURL,
        },
      });

      if (error) {
        setAuthError(error.message);
        toast({ title: 'Sign Up Failed', description: error.message, variant: 'destructive' });
      } else if (data.session) {
        // User is signed in (e.g. auto-confirm is on, or social sign up)
        toast({ title: 'Account Created & Signed In!' });
        // Redirect is handled by onAuthStateChange
      } else if (data.user && !data.session) {
        // Email confirmation required
        setShowConfirmationMessage(true);
        toast({ title: 'Account Created!', description: 'Please check your email to confirm your account.' });
        signUpForm.reset();
        signInForm.setValue('email', values.email); // Pre-fill email on sign-in tab
        setDefaultTab('signin'); // Switch to sign-in tab
      } else {
         // Should not happen with current Supabase versions
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
    
    const googleRedirectURL = getAuthRedirectUrl(); 
    
    if (!googleRedirectURL && process.env.NEXT_PUBLIC_SITE_URL) {
        toast({ title: 'Configuration Error', description: 'Site URL for Google Sign-In is improperly configured.', variant: 'destructive' });
        setIsGoogleLoading(false);
        return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: googleRedirectURL,
      },
    });
    if (error) {
      setAuthError(error.message);
      toast({ title: 'Google Sign-In Failed', description: error.message, variant: 'destructive' });
      setIsGoogleLoading(false);
    }
    // On success, Supabase redirects, then onAuthStateChange handles it.
  };

  const handleForgotPasswordRequest = async (values: ForgotPasswordFormValues) => {
    setIsSendingResetLink(true);
    setAuthError(null);
    
    const resetLinkRedirectTo = getAuthRedirectUrl();
    console.log(`[AuthPage handleForgotPasswordRequest] Constructed redirectTo for password reset: ${resetLinkRedirectTo}`);

    if (!resetLinkRedirectTo && process.env.NEXT_PUBLIC_SITE_URL) {
        toast({ title: 'Configuration Error', description: 'Site URL for password reset is improperly configured.', variant: 'destructive' });
        setIsSendingResetLink(false);
        return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
        redirectTo: resetLinkRedirectTo 
      });
      if (error) {
        setAuthError(error.message);
        toast({ title: 'Password Reset Failed', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Password Reset Email Sent', description: 'If an account exists for this email, a password reset link has been sent.' });
        setIsForgotPasswordOpen(false);
        forgotPasswordForm.reset();
      }
    } catch (error: any) {
      setAuthError(error.message || 'An unexpected error occurred.');
      toast({ title: 'Password Reset Error', description: error.message || 'An unexpected error occurred.', variant: 'destructive' });
    }
    setIsSendingResetLink(false);
  };

  const handleResetPassword = async (values: ResetPasswordFormValues) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: values.newPassword });
      if (error) {
        setAuthError(error.message);
        toast({ title: 'Password Reset Failed', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Password Reset Successful!', description: 'You can now sign in with your new password.' });
        setIsPasswordRecoveryMode(false); // Exit recovery mode
        setDefaultTab('signin'); // Switch to sign-in tab
        // Pre-fill email if possible (user might not be fully "gotten" here yet)
        const { data: { user } } = await supabase.auth.getUser();
        signInForm.setValue('email', user?.email || '');
        // Clear the hash to remove recovery params from URL
        router.replace('/auth', { scroll: false }); // Or router.replace(pathname, undefined, { shallow: true });
      }
    } catch (error: any) {
      setAuthError(error.message || 'An unexpected error occurred.');
      toast({ title: 'Password Reset Error', description: error.message || 'An unexpected error occurred.', variant: 'destructive' });
    }
    setIsLoading(false);
  };


  if (isCheckingAuth) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <PublicNavbar />
        <main className="flex flex-1 items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicNavbar />
      <main className="flex flex-1 items-center justify-center p-4">
        {isPasswordRecoveryMode ? (
           <Card className="w-full max-w-md shadow-xl">
            <CardHeader>
              <CardTitle className="font-headline flex items-center">
                <KeyRound className="mr-2 h-5 w-5 text-primary"/> Set New Password
              </CardTitle>
              <CardDescription>Enter and confirm your new password below.</CardDescription>
            </CardHeader>
            <Form {...resetPasswordFormHook}>
              <form onSubmit={resetPasswordFormHook.handleSubmit(handleResetPassword)}>
                <CardContent className="space-y-4">
                  <FormField
                    control={resetPasswordFormHook.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New Password</FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input
                              type={showNewPassword ? 'text' : 'password'}
                              placeholder="Enter new password"
                              {...field}
                              className="pr-10"
                            />
                          </FormControl>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-primary"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            tabIndex={-1}
                          >
                            {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={resetPasswordFormHook.control}
                    name="confirmNewPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm New Password</FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input
                              type={showConfirmNewPassword ? 'text' : 'password'}
                              placeholder="Confirm new password"
                              {...field}
                              className="pr-10"
                            />
                          </FormControl>
                           <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-primary"
                            onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                            tabIndex={-1}
                          >
                            {showConfirmNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {authError && <p className="text-sm text-destructive">{authError}</p>}
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Set New Password
                  </Button>
                </CardFooter>
              </form>
            </Form>
          </Card>
        ) : (
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
                                <div className="flex justify-between items-center">
                                    <FormLabel>Password</FormLabel>
                                    <Button
                                        type="button"
                                        variant="link"
                                        className="p-0 h-auto text-xs text-primary hover:underline"
                                        onClick={() => setIsForgotPasswordOpen(true)}
                                    >
                                        Forgot password?
                                    </Button>
                                </div>
                                <div className="relative">
                                    <FormControl>
                                    <Input
                                        type={showSignInPassword ? 'text' : 'password'}
                                        placeholder="••••••••"
                                        {...field}
                                        className="pr-10"
                                    />
                                    </FormControl>
                                    <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-primary"
                                    onClick={() => setShowSignInPassword(!showSignInPassword)}
                                    tabIndex={-1}
                                    >
                                    {showSignInPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    <span className="sr-only">{showSignInPassword ? 'Hide password' : 'Show password'}</span>
                                    </Button>
                                </div>
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
        )}
      </main>

      <Dialog open={isForgotPasswordOpen} onOpenChange={setIsForgotPasswordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-headline">Reset Your Password</DialogTitle>
            <DialogDescription>
              Enter your email address below and we'll send you a link to reset your password.
            </DialogDescription>
          </DialogHeader>
          <Form {...forgotPasswordForm}>
            <form onSubmit={forgotPasswordForm.handleSubmit(handleForgotPasswordRequest)} className="space-y-4">
              <FormField
                control={forgotPasswordForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="you@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {authError && <p className="text-sm text-destructive">{authError}</p>}
              <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={isSendingResetLink}>
                    Cancel
                    </Button>
                </DialogClose>
                <Button type="submit" disabled={isSendingResetLink}>
                  {isSendingResetLink && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send Reset Link
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

