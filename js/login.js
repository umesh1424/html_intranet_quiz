// js/login.js

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const emailField = document.getElementById('email');
    const passwordField = document.getElementById('password');
    if (emailField) emailField.value = '';
    if (passwordField) passwordField.value = '';
  }, 50);
});

document.addEventListener('DOMContentLoaded', async () => {
  // Check if user is already logged in (redirects to dashboard if so)
  const user = await window.checkAuth();
  window.renderHeader(user);

  let isSignUp = false;


  const authTitle = document.getElementById('auth-title');
  const toggleAuthModeBtn = document.getElementById('toggle-auth-mode');
  const fullnameGroup = document.getElementById('fullname-group');
  const authSubmitBtn = document.getElementById('auth-submit-btn');
  const authForm = document.getElementById('auth-form');
  const alertBox = document.getElementById('alert-box');
  const googleLoginBtn = document.getElementById('google-login-btn');

  // Check URL params for error
  const urlParams = new URLSearchParams(window.location.search);
  const errorParam = urlParams.get('error');
  if (errorParam) {
    showAlert('error', decodeURIComponent(errorParam));
  }

  // Toggle Auth Mode
  toggleAuthModeBtn.addEventListener('click', () => {
    isSignUp = !isSignUp;
    clearAlert();
    
    if (isSignUp) {
      authTitle.textContent = 'Create your teacher account';
      toggleAuthModeBtn.textContent = 'sign in to your existing account';
      fullnameGroup.classList.remove('hidden');
      document.getElementById('fullname').required = true;
      authSubmitBtn.textContent = 'Sign up';
    } else {
      authTitle.textContent = 'Sign in as a Teacher';
      toggleAuthModeBtn.textContent = 'register for a new account';
      fullnameGroup.classList.add('hidden');
      document.getElementById('fullname').required = false;
      authSubmitBtn.textContent = 'Sign in';
    }
  });

  // Show Alert box helper
  function showAlert(type, text) {
    alertBox.textContent = text;
    alertBox.className = 'mb-6 p-4 rounded-xl text-sm font-medium block ';
    if (type === 'success') {
      alertBox.className += 'bg-emerald-50 text-emerald-800 border border-emerald-100 animate-pulse';
    } else {
      alertBox.className += 'bg-rose-50 text-rose-800 border border-rose-100';
    }
  }

  function clearAlert() {
    alertBox.className = 'hidden mb-6 p-4 rounded-xl text-sm font-medium';
    alertBox.textContent = '';
  }

  // Handle Form Submission
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const fullName = document.getElementById('fullname').value.trim() || email.split('@')[0];

    if (!email || !password) {
      showAlert('error', 'Email and password are required');
      return;
    }

    authSubmitBtn.disabled = true;
    const originalText = authSubmitBtn.textContent;
    authSubmitBtn.textContent = 'Processing...';

    try {
      if (isSignUp) {
        // Sign Up Flow
        const { data, error } = await window.supabaseClient.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        const user = data.user;
        if (user) {
          // Create user profile in profiles table
          const { error: profileError } = await window.supabaseClient
            .from('profiles')
            .upsert({
              id: user.id,
              email: email,
              full_name: fullName,
            });

          if (profileError) {
            console.error('Failed to create profile:', profileError.message);
          }
        }

        // Attempt to log in directly
        const { data: signInData, error: signInError } = await window.supabaseClient.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          showAlert('success', 'Sign up successful! Please check your email for confirmation.');
          isSignUp = false;
          fullnameGroup.classList.add('hidden');
          document.getElementById('fullname').required = false;
          authSubmitBtn.textContent = 'Sign in';
          authTitle.textContent = 'Sign in as a Teacher';
          toggleAuthModeBtn.textContent = 'register for a new account';
          document.getElementById('password').value = '';
        } else {
          showAlert('success', 'Sign up successful! Redirecting to dashboard...');
          setTimeout(() => {
            window.location.href = 'dashboard.html';
          }, 800);
        }
      } else {
        // Sign In Flow
        const { error } = await window.supabaseClient.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        showAlert('success', 'Logging you in...');
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 800);
      }
    } catch (err) {
      console.error('Auth error:', err);
      showAlert('error', err.message || 'An unexpected error occurred');
      authSubmitBtn.disabled = false;
      authSubmitBtn.textContent = originalText;
    }
  });

  // Handle Google Login
  googleLoginBtn.addEventListener('click', async () => {
    clearAlert();
    googleLoginBtn.disabled = true;
    try {
      const redirectUrl = new URL('dashboard.html', window.location.href).href;
      const { error } = await window.supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
        },
      });
      if (error) throw error;
    } catch (err) {
      console.error('Google OAuth initialization failed:', err);
      showAlert('error', err.message || 'Failed to initialize Google login');
      googleLoginBtn.disabled = false;
    }
  });
});
