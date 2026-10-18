/* AxiomPilotCode · browser auth powered by Supabase Auth (when configured) */
(() => {
  "use strict";

  const dialog = document.getElementById("account-modal");
  if (!dialog) return;

  const get = (id) => document.getElementById(id);
  const login = get("auth-login-form");
  const signup = get("auth-signup-form");
  const reset = get("auth-reset-form");
  const recover = get("auth-recover-form");
  const profile = get("auth-profile");
  const tabs = get("auth-tabs");
  const note = get("auth-message");
  const title = get("auth-title");
  const description = get("auth-description");
  const tabLogin = get("auth-tab-login");
  const tabSignup = get("auth-tab-signup");
  const config = window.AXIOM_SUPABASE || {};
  let client = null;
  let currentUser = null;
  let mode = "login";

  const headings = {
    login: ["Welcome back.", "Sign in to your AxiomPilotCode account."],
    signup: ["Create your account.", "One place for your projects, preferences, and plan."],
    reset: ["Reset your password.", "Enter your email. We'll send a secure reset link."],
    recover: ["Choose a new password.", "Create a new password for your account."],
    profile: ["Your workspace.", "Your AxiomPilotCode account."]
  };

  function message(value = "", kind = "info") {
    note.textContent = value;
    note.dataset.kind = kind;
    note.hidden = !value;
  }

  function setMode(next) {
    mode = next;
    const [heading, subtitle] = headings[next] || headings.login;
    title.textContent = heading;
    description.textContent = subtitle;
    login.hidden = next !== "login";
    signup.hidden = next !== "signup";
    reset.hidden = next !== "reset";
    recover.hidden = next !== "recover";
    profile.hidden = next !== "profile";
    tabs.hidden = next !== "login" && next !== "signup";
    tabLogin.setAttribute("aria-selected", String(next === "login"));
    tabSignup.setAttribute("aria-selected", String(next === "signup"));
    message();
  }

  function openAccount(next = "login") {
    setMode(currentUser ? "profile" : next);
    if (!dialog.open) dialog.showModal();
  }

  for (const id of ["open-account", "preview-profile"]) {
    get(id)?.addEventListener("click", () => openAccount("login"));
  }
  get("open-signup")?.addEventListener("click", () => openAccount("signup"));
  get("close-account").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  tabLogin.addEventListener("click", () => setMode("login"));
  tabSignup.addEventListener("click", () => setMode("signup"));
  get("forgot-password").addEventListener("click", () => setMode("reset"));
  get("back-to-login").addEventListener("click", () => setMode("login"));

  async function submitSafely(form, handler) {
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    message();
    try {
      if (!client) throw new Error("Account access is being connected. Please try again after Supabase is configured.");
      await handler();
    } catch (error) {
      message(error?.message || "Something went wrong. Please try again.", "error");
    } finally {
      button.disabled = false;
    }
  }

  function matchingPasswords(form) {
    const password = form.elements.namedItem("password").value;
    const repeated = form.elements.namedItem("repeatPassword").value;
    if (password !== repeated) throw new Error("Passwords don't match.");
    return password;
  }

  login.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitSafely(login, async () => {
      const email = login.elements.namedItem("email").value.trim();
      const password = login.elements.namedItem("password").value;
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      currentUser = data.user;
      login.reset();
      await showProfile();
    });
  });

  signup.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitSafely(signup, async () => {
      const email = signup.elements.namedItem("email").value.trim();
      const password = matchingPasswords(signup);
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin + window.location.pathname }
      });
      if (error) throw error;
      signup.reset();
      if (data.session && data.user) {
        currentUser = data.user;
        await showProfile();
      } else {
        setMode("login");
        message("Account created. If email confirmation is enabled, check your inbox to finish signing in.", "success");
      }
    });
  });

  reset.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitSafely(reset, async () => {
      const email = reset.elements.namedItem("email").value.trim();
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
      });
      if (error) throw error;
      reset.reset();
      message("If this address has an account, a recovery link will arrive by email.", "success");
    });
  });

  recover.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitSafely(recover, async () => {
      const password = matchingPasswords(recover);
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      recover.reset();
      setMode("profile");
      await showProfile();
      message("Your password has been updated.", "success");
    });
  });

  get("sign-out").addEventListener("click", async () => {
    try {
      if (client) {
        const { error } = await client.auth.signOut();
        if (error) throw error;
      }
      currentUser = null;
      get("open-account").innerHTML = "Sign in";
      setMode("login");
      message("You have signed out.", "success");
    } catch (error) {
      message(error.message || "Could not sign out.", "error");
    }
  });

  async function showProfile() {
    if (!currentUser) return;
    setMode("profile");
    get("profile-email").textContent = currentUser.email || "Account";
    get("profile-avatar").textContent = (currentUser.email || "A")[0].toUpperCase();
    get("profile-plan").textContent = "—";
    get("open-account").textContent = "My account";
    if (!client) return;

    try {
      const { data, error } = await client.from("profiles")
        .select("plan").eq("id", currentUser.id).maybeSingle();
      if (!error && data && (data.plan === "free" || data.plan === "pro")) {
        get("profile-plan").textContent = data.plan === "pro" ? "Pro" : "Free";
      } else {
        get("profile-plan").textContent = "Not available";
      }
    } catch {
      get("profile-plan").textContent = "Not available";
    }
  }

  async function initialize() {
    const url = config.url;
    const key = config.anonKey;
    if (!url || !key || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) return;

    try {
      if (!window.supabase?.createClient) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
          script.onload = resolve;
          script.onerror = () => reject(new Error("Could not load the authentication library."));
          document.head.appendChild(script);
        });
      }
      client = window.supabase.createClient(url, key, {
        auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
      });
      client.auth.onAuthStateChange((event, session) => {
        currentUser = session?.user || null;
        if (event === "PASSWORD_RECOVERY") {
          window.setTimeout(() => openAccount("recover"), 0);
        } else if (event === "SIGNED_OUT") {
          get("open-account").textContent = "Sign in";
          if (dialog.open) setMode("login");
        } else if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
          if (currentUser) window.setTimeout(() => void showProfile(), 0);
        }
      });
      const { data: { user }, error } = await client.auth.getUser();
      if (!error && user) {
        currentUser = user;
        await showProfile();
      }
    } catch (error) {
      client = null;
      console.warn("AxiomPilotCode authentication is unavailable:", error.message);
    }
  }

  setMode("login");
  void initialize();
})();
