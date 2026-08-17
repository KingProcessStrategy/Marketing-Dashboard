import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type Role = "admin" | "member";
type Section = "today" | "leads" | "prospects" | "followups" | "team";

type Prospect = {
  id: string; company: string; trade: string; contact_name: string; email: string;
  counties: string; keywords: string; status: string;
};
type Lead = {
  id: string; project: string; stage: string; source: string; location: string;
  trades: string; score: number; record_date: string; insight: string; saved: boolean;
};
type Draft = {
  id: string; prospect_id: string; lead_ids: string[]; subject: string; body: string;
  status: "ready" | "approved" | "passed"; updated_at: string;
};
type FollowUp = { id: string; prospect_id: string; due_date: string; note: string; status: string };
type Activity = { id: string; actor: string; action: string; detail: string; created_at: string };
type Member = { user_id: string; display_name: string; email: string; role: Role };
type Invitation = { id: string; email: string; role: Role; expires_at: string; token?: string };
type Workspace = {
  currentMember: Member | null; prospects: Prospect[]; leads: Lead[]; drafts: Draft[];
  followUps: FollowUp[]; activity: Activity[]; members: Member[]; invitations: Invitation[];
};

const emptyWorkspace: Workspace = {
  currentMember: null, prospects: [], leads: [], drafts: [], followUps: [], activity: [], members: [], invitations: [],
};

function readableError(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function displayName(user: User) {
  const value = user.user_metadata?.full_name;
  return typeof value === "string" && value.trim() ? value.trim() : user.email?.split("@")[0] ?? "Teammate";
}

export function WorkspaceApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [section, setSection] = useState<Section>("today");
  const [selectedDraftId, setSelectedDraftId] = useState("");
  const [showProspectForm, setShowProspectForm] = useState(false);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [inviteLink, setInviteLink] = useState("");

  const user = session?.user ?? null;

  const loadWorkspace = useCallback(async (activeUser: User) => {
    const email = activeUser.email?.toLowerCase();
    if (email === "chrisking0990@gmail.com") {
      const { error } = await supabase.rpc("bootstrap_owner", { p_display_name: displayName(activeUser) });
      if (error) throw error;
    }

    const invite = new URLSearchParams(window.location.search).get("invite");
    if (invite) {
      const { error } = await supabase.rpc("accept_invitation", { p_token: invite, p_display_name: displayName(activeUser) });
      if (error) throw error;
      window.history.replaceState({}, "", window.location.pathname);
      setMessage("Welcome to King Lead Lab. Your teammate access is active.");
    }

    const { data: member, error: memberError } = await supabase
      .from("workspace_members")
      .select("user_id, display_name, email, role")
      .eq("user_id", activeUser.id)
      .maybeSingle();
    if (memberError) throw memberError;
    if (!member) {
      setWorkspace(emptyWorkspace);
      return;
    }

    const [prospects, leads, drafts, followUps, activity, members, invitations] = await Promise.all([
      supabase.from("prospects").select("id, company, trade, contact_name, email, counties, keywords, status").order("company"),
      supabase.from("leads").select("id, project, stage, source, location, trades, score, record_date, insight, saved").order("score", { ascending: false }).order("record_date", { ascending: false }),
      supabase.from("drafts").select("id, prospect_id, lead_ids, subject, body, status, updated_at").order("updated_at", { ascending: false }),
      supabase.from("follow_ups").select("id, prospect_id, due_date, note, status").eq("status", "due").order("due_date"),
      supabase.from("workspace_activity").select("id, actor, action, detail, created_at").order("created_at", { ascending: false }).limit(12),
      supabase.from("workspace_members").select("user_id, display_name, email, role").order("role", { ascending: false }).order("display_name"),
      member.role === "admin"
        ? supabase.from("invitations").select("id, email, role, expires_at").is("accepted_at", null).order("expires_at")
        : Promise.resolve({ data: [] as Invitation[], error: null }),
    ]);
    const failures = [prospects, leads, drafts, followUps, activity, members, invitations].find((result) => result.error)?.error;
    if (failures) throw failures;
    setWorkspace({
      currentMember: member as Member,
      prospects: (prospects.data ?? []) as Prospect[],
      leads: (leads.data ?? []) as Lead[],
      drafts: (drafts.data ?? []) as Draft[],
      followUps: (followUps.data ?? []) as FollowUp[],
      activity: (activity.data ?? []) as Activity[],
      members: (members.data ?? []) as Member[],
      invitations: (invitations.data ?? []) as Invitation[],
    });
  }, []);

  const refresh = useCallback(async (activeUser = user) => {
    if (!activeUser) { setLoading(false); return; }
    try { await loadWorkspace(activeUser); }
    catch (error) { setMessage(readableError(error)); }
    finally { setLoading(false); }
  }, [loadWorkspace, user]);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session);
    }).finally(() => { if (mounted) setLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) setWorkspace(emptyWorkspace);
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => { if (user) void refresh(user); }, [user, refresh]);

  const record = useCallback(async (action: string, detail: string) => {
    if (!workspace.currentMember) return;
    const { error } = await supabase.from("workspace_activity").insert({ actor: workspace.currentMember.display_name, action, detail });
    if (error) throw error;
  }, [workspace.currentMember]);

  async function run(action: () => Promise<string | void>) {
    setWorking(true);
    try {
      const result = await action();
      if (result) setMessage(result);
      await refresh();
      return true;
    } catch (error) {
      setMessage(readableError(error));
      return false;
    } finally { setWorking(false); }
  }

  async function saveLead(lead: Lead) {
    await run(async () => {
      const { error } = await supabase.from("leads").update({ saved: !lead.saved }).eq("id", lead.id);
      if (error) throw error;
      await record(lead.saved ? "removed a saved lead" : "saved a lead", lead.project);
      return lead.saved ? "Lead removed from saved." : "Lead saved for the team.";
    });
  }

  async function setDraftStatus(draft: Draft, status: "approved" | "passed") {
    await run(async () => {
      const { error } = await supabase.from("drafts").update({ status, updated_at: new Date().toISOString() }).eq("id", draft.id);
      if (error) throw error;
      await record(status === "approved" ? "approved a draft for queueing" : "passed a draft", draft.subject);
      return status === "approved" ? "Draft moved to the approved queue." : "Draft marked as passed.";
    });
  }

  async function createProspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const prospect = {
        company: String(form.get("company") ?? "").trim(), trade: String(form.get("trade") ?? "").trim(),
        contact_name: String(form.get("contactName") ?? "").trim(), email: String(form.get("email") ?? "").trim(),
        counties: String(form.get("counties") ?? "").trim() || "Houston metro", keywords: String(form.get("keywords") ?? "").trim() || String(form.get("trade") ?? "").trim(),
      };
      if (!prospect.company || !prospect.trade || !prospect.contact_name || !prospect.email.includes("@")) throw new Error("Company, trade, contact, and a valid email are required.");
      const { error } = await supabase.from("prospects").insert(prospect);
      if (error) throw error;
      await record("added a prospect", prospect.company);
      setShowProspectForm(false);
      return `${prospect.company} is ready for matching.`;
    });
  }

  async function createLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const lead = {
        project: String(form.get("project") ?? "").trim(), stage: String(form.get("stage") ?? "").trim(),
        source: String(form.get("source") ?? "").trim(), location: String(form.get("location") ?? "").trim(),
        trades: String(form.get("trades") ?? "").trim(), insight: String(form.get("insight") ?? "").trim(),
        score: Math.max(1, Math.min(100, Number(form.get("score")) || 75)),
        record_date: String(form.get("recordDate") ?? "").trim() || new Date().toISOString().slice(0, 10),
      };
      if (!lead.project || !lead.stage || !lead.source || !lead.location || !lead.trades || !lead.insight) throw new Error("Project, stage, source, location, trades, and an outreach insight are required.");
      const { error } = await supabase.from("leads").insert(lead);
      if (error) throw error;
      await record("added a lead", lead.project);
      setShowLeadForm(false);
      return `${lead.project} is now available for matching.`;
    });
  }

  async function generateDraft(prospect: Prospect) {
    await run(async () => {
      if (workspace.drafts.some((draft) => draft.prospect_id === prospect.id && draft.status === "ready")) throw new Error(`${prospect.company} already has a draft waiting for review.`);
      const terms = `${prospect.trade},${prospect.keywords}`.toLowerCase().split(/[,/ ]+/).map((term) => term.trim()).filter((term) => term.length > 3);
      const matches = workspace.leads.map((lead) => {
        const haystack = `${lead.project} ${lead.trades} ${lead.location} ${lead.insight}`.toLowerCase();
        return { lead, relevance: lead.score + terms.reduce((score, term) => score + (haystack.includes(term) ? 15 : 0), 0) };
      }).sort((a, b) => b.relevance - a.relevance).slice(0, 3);
      if (!matches.length) throw new Error("Add a lead before generating outreach.");
      const names = matches.map(({ lead }) => lead.project);
      const leadList = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
      const { error } = await supabase.from("drafts").insert({
        prospect_id: prospect.id, lead_ids: matches.map(({ lead }) => lead.id),
        subject: names.length === 1
          ? `A Houston ${prospect.trade.toLowerCase()} opportunity for ${prospect.company}`
          : `${names.length} Houston ${prospect.trade.toLowerCase()} opportunities for ${prospect.company}`,
        body: `${prospect.contact_name} — I pulled ${names.length} current Houston-area ${names.length === 1 ? "opportunity" : "opportunities"} that look relevant to ${prospect.company}, including ${leadList}.\n\nThe signals came from local planning, county, ISD, and procurement activity—not just the usual permit feed.\n\nWant the project details and the source links?`,
        status: "ready", created_by: user?.id,
      });
      if (error) throw error;
      await record("generated a draft", prospect.company);
      return `A fresh ${prospect.company} draft is ready for review.`;
    });
  }

  async function completeFollowUp(followUp: FollowUp) {
    await run(async () => {
      const { error } = await supabase.from("follow_ups").update({ status: "complete" }).eq("id", followUp.id);
      if (error) throw error;
      await record("completed a follow-up", followUp.note);
      return "Follow-up completed.";
    });
  }

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    await run(async () => {
      const { data, error } = await supabase.rpc("create_invitation", { p_email: email });
      if (error) throw error;
      const invitation = Array.isArray(data) ? data[0] : data;
      if (!invitation?.token) throw new Error("The invite link could not be created.");
      setInviteLink(`${window.location.origin}?invite=${invitation.token}`);
      await record("created a teammate invitation", email);
      return `Invite link created for ${email}.`;
    });
  }

  async function copyDraft(draft: Draft) {
    try {
      await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
      setMessage("Draft copied. Paste it into your email inbox to send.");
    } catch { setMessage("Copy is unavailable in this browser. Select the draft text manually."); }
  }

  if (loading && !user) return <LoadingScreen />;
  if (!user) return <AuthGate onSession={setSession} />;
  if (!workspace.currentMember) return <AccessRequired email={user.email ?? "your account"} message={message} onSignOut={() => void supabase.auth.signOut()} />;

  const readyDrafts = workspace.drafts.filter((draft) => draft.status === "ready");
  const selectedDraft = workspace.drafts.find((draft) => draft.id === selectedDraftId) ?? workspace.drafts.find((draft) => draft.status !== "passed") ?? workspace.drafts[0];
  const prospectById = new Map(workspace.prospects.map((prospect) => [prospect.id, prospect]));
  const selectedProspect = selectedDraft ? prospectById.get(selectedDraft.prospect_id) : undefined;

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">K</span><span>King Lead Lab</span></div>
      <nav aria-label="Workspace navigation">
        <NavItem active={section === "today"} onClick={() => setSection("today")} label="Today’s queue" />
        <NavItem active={section === "leads"} onClick={() => setSection("leads")} label="Lead intake" count={workspace.leads.length} />
        <NavItem active={section === "prospects"} onClick={() => setSection("prospects")} label="Prospects" />
        <NavItem active={section === "followups"} onClick={() => setSection("followups")} label="Follow-ups" count={workspace.followUps.length} />
        <NavItem active={section === "team"} onClick={() => setSection("team")} label="Team access" />
      </nav>
      <div className="sidebar-note"><span><i className="live-dot" /> Shared workspace online</span><strong>Houston metro · daily feed</strong><span className="user-chip">{workspace.currentMember.display_name}</span><button className="text-button" onClick={() => void supabase.auth.signOut()}>Sign out</button></div>
    </aside>
    <section className="workspace">
      {message && <div className="status-message" role="status"><span>{message}</span><button onClick={() => setMessage("")} aria-label="Dismiss message">×</button></div>}
      {section === "today" && <TodayDesk workspace={workspace} selectedDraft={selectedDraft} selectedProspect={selectedProspect} readyDrafts={readyDrafts} selectDraft={setSelectedDraftId} onApprove={() => selectedDraft && void setDraftStatus(selectedDraft, "approved")} onPass={() => selectedDraft && void setDraftStatus(selectedDraft, "passed")} onSaveLead={saveLead} onCopy={copyDraft} working={working} />}
      {section === "leads" && <LeadDesk leads={workspace.leads} showForm={showLeadForm} setShowForm={setShowLeadForm} onSubmit={createLead} onSave={saveLead} />}
      {section === "prospects" && <ProspectDesk prospects={workspace.prospects} showForm={showProspectForm} setShowForm={setShowProspectForm} onSubmit={createProspect} onGenerate={generateDraft} working={working} />}
      {section === "followups" && <FollowUpDesk followUps={workspace.followUps} prospects={prospectById} onComplete={completeFollowUp} working={working} />}
      {section === "team" && <TeamDesk workspace={workspace} onSubmit={createInvitation} inviteLink={inviteLink} setInviteLink={setInviteLink} working={working} />}
    </section>
  </main>;
}

function AuthGate({ onSession }: { onSession: (session: Session | null) => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      if (mode === "signup") {
        if (!name.trim()) throw new Error("Add your name so your team can recognize your activity.");
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name.trim() } } });
        if (error) throw error;
        if (data.session) onSession(data.session);
        else setNotice("Check your inbox to confirm this email, then return here and sign in.");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onSession(data.session);
      }
    } catch (error) { setNotice(readableError(error)); }
    finally { setBusy(false); }
  }

  return <main className="access-shell"><section className="access-card">
    <span className="brand-mark">K</span><p className="eyebrow">King Lead Lab workspace</p>
    <h1>{mode === "signin" ? "Welcome back." : "Join the desk."}</h1>
    <p>{mode === "signin" ? "Sign in to the shared Houston opportunity workspace." : "Create the account that matches your King Lead Lab invite email."}</p>
    <form className="form-grid" onSubmit={submit}>
      {mode === "signup" && <label className="full">Your name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required placeholder="Chris King" /></label>}
      <label className="full">Email<input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" type="email" required placeholder="you@company.com" /></label>
      <label className="full">Password<input value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} type="password" required minLength={8} placeholder="At least 8 characters" /></label>
      <div className="form-actions full"><button type="button" className="secondary-button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setNotice(""); }}>{mode === "signin" ? "Create account" : "I have an account"}</button><button className="primary-button" disabled={busy} type="submit">{busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}</button></div>
    </form>
    {notice && <p className="access-message">{notice}</p>}
  </section></main>;
}

function AccessRequired({ email, message, onSignOut }: { email: string; message: string; onSignOut: () => void }) {
  return <main className="access-shell"><section className="access-card"><span className="brand-mark">K</span><p className="eyebrow">King Lead Lab workspace</p><h1>You need a teammate invite.</h1><p><strong>{email}</strong> is signed in, but it has not been added to this workspace. Ask an administrator to send an email-matched invite link, then open that link while signed in.</p>{message && <p className="access-message">{message}</p>}<button className="secondary-button" onClick={onSignOut}>Sign out</button></section></main>;
}

function LoadingScreen() { return <main className="access-shell"><section className="access-card"><span className="brand-mark">K</span><p className="eyebrow">King Lead Lab workspace</p><h1>Opening your desk…</h1></section></main>; }

function NavItem({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }) {
  return <button className={`nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} onClick={onClick}>{label}{count ? <span className="nav-count">{count}</span> : null}</button>;
}

function TodayDesk({ workspace, selectedDraft, selectedProspect, readyDrafts, selectDraft, onApprove, onPass, onSaveLead, onCopy, working }: { workspace: Workspace; selectedDraft?: Draft; selectedProspect?: Prospect; readyDrafts: Draft[]; selectDraft: (id: string) => void; onApprove: () => void; onPass: () => void; onSaveLead: (lead: Lead) => void; onCopy: (draft: Draft) => void; working: boolean }) {
  return <><header className="topbar"><div><p className="eyebrow">Outreach workspace</p><h1>Turn today&apos;s signals into tomorrow&apos;s calls.</h1><p className="subhead">Review the best-fit projects, then approve outreach one message at a time.</p></div><button className="primary-button" onClick={() => document.getElementById("draft-review")?.scrollIntoView({ behavior: "smooth" })}>Review {readyDrafts.length} drafts</button></header>
    <section className="metrics" aria-label="Today’s metrics"><Metric label="New matched leads" value={String(workspace.leads.length)} detail="Across active companies" /><Metric label="Drafts ready" value={String(readyDrafts.length)} detail="Personalized to review" /><Metric label="Follow-ups due" value={String(workspace.followUps.length)} detail="Reply-safe queue" /><Metric label="Approved queue" value={String(workspace.drafts.filter((draft) => draft.status === "approved").length)} detail="Copy into your inbox" /></section>
    <section className="desk-grid"><article className="panel lead-panel"><div className="panel-heading"><div><p className="eyebrow">Matched opportunities</p><h2>Best fits to act on today</h2></div><span className="panel-total">{workspace.leads.length} live</span></div><div className="lead-list">{workspace.leads.map((lead) => <LeadRow lead={lead} key={lead.id} onSave={() => onSaveLead(lead)} />)}</div></article>
      <article className="panel draft-panel" id="draft-review"><div className="panel-heading"><div><p className="eyebrow">Review before queueing</p><h2>{selectedProspect?.company ?? "No drafts ready"}</h2></div></div>{selectedDraft ? <><div className="draft-selector">{workspace.drafts.filter((draft) => draft.status !== "passed").map((draft) => <button key={draft.id} onClick={() => selectDraft(draft.id)} className={draft.id === selectedDraft.id ? "selected" : ""}>{workspace.prospects.find((prospect) => prospect.id === draft.prospect_id)?.company ?? "Prospect"}</button>)}</div><p className="recipient">To: {selectedProspect?.contact_name} · {selectedProspect?.email}</p><p className={`draft-state ${selectedDraft.status}`}>{selectedDraft.status === "ready" ? "Ready for review" : selectedDraft.status === "approved" ? "Approved queue" : "Passed"}</p><div className="email-draft"><p><strong>Subject:</strong> {selectedDraft.subject}</p>{selectedDraft.body.split("\n\n").map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div><p className="send-note">Approval preserves this message in the shared queue. Mailbox delivery stays off until you connect a sending inbox.</p><div className="draft-actions"><button className="secondary-button" onClick={() => onCopy(selectedDraft)}>Copy email</button><button className="secondary-button" disabled={working || selectedDraft.status !== "ready"} onClick={onPass}>Pass</button><button className="primary-button" disabled={working || selectedDraft.status !== "ready"} onClick={onApprove}>{selectedDraft.status === "ready" ? "Approve & queue" : "Queued"}</button></div></> : <EmptyCopy title="No drafts are waiting" body="Add prospects and keep the daily lead feed flowing to build the next review queue." />}</article></section></>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <article><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }

function LeadRow({ lead, onSave }: { lead: Lead; onSave: () => void }) { return <div className="lead-row"><div className="lead-score">{lead.score}</div><div><strong>{lead.project}</strong><span>{lead.location} · {lead.stage}</span><small>{lead.source} · Record date {formatDate(lead.record_date)}</small></div><p>{lead.insight}</p><button className={`save-button ${lead.saved ? "saved" : ""}`} onClick={onSave}>{lead.saved ? "Saved" : "Save"}</button></div>; }

function ProspectDesk({ prospects, showForm, setShowForm, onSubmit, onGenerate, working }: { prospects: Prospect[]; showForm: boolean; setShowForm: (value: boolean) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onGenerate: (prospect: Prospect) => void; working: boolean }) {
  return <><header className="topbar compact"><div><p className="eyebrow">Target accounts</p><h1>Build a smaller, better list.</h1><p className="subhead">Each company gets matched by trade, counties, and niche keywords—not generic volume.</p></div><button className="primary-button" onClick={() => setShowForm(true)}>Add prospect</button></header><section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">Active matching profiles</p><h2>{prospects.length} companies in rotation</h2></div></div><div className="prospect-table" role="table"><div className="table-head prospect-head" role="row"><span>Company & contact</span><span>Trade</span><span>Coverage</span><span>Focus</span><span>Next step</span></div>{prospects.map((prospect) => <div className="table-row prospect-row" role="row" key={prospect.id}><div><strong>{prospect.company}</strong><span>{prospect.contact_name} · {prospect.email}</span></div><span className="trade-pill">{prospect.trade}</span><span>{prospect.counties}</span><span>{prospect.keywords}</span><button className="generate-button" disabled={working} onClick={() => onGenerate(prospect)}>Generate draft</button></div>)}</div></section>{showForm && <ProspectForm onClose={() => setShowForm(false)} onSubmit={onSubmit} />}</>;
}

function ProspectForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-prospect-title"><button className="close-button" onClick={onClose} aria-label="Close form">×</button><p className="eyebrow">New target</p><h2 id="new-prospect-title">Add a prospect</h2><p className="modal-copy">Set the rules that decide which King Lead Lab records make this company’s review queue.</p><form className="form-grid" onSubmit={onSubmit}><label>Company<input name="company" required placeholder="ABC Electrical" /></label><label>Trade<input name="trade" required placeholder="Electrical" /></label><label>Contact name<input name="contactName" required placeholder="Jordan Ramirez" /></label><label>Email<input name="email" required type="email" placeholder="jordan@company.com" /></label><label className="full">Counties<input name="counties" placeholder="Harris, Fort Bend, Waller" /></label><label className="full">Niche keywords<input name="keywords" placeholder="K-12, healthcare, multifamily" /></label><div className="form-actions full"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button">Save matching profile</button></div></form></section></div>; }

function LeadDesk({ leads, showForm, setShowForm, onSubmit, onSave }: { leads: Lead[]; showForm: boolean; setShowForm: (value: boolean) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onSave: (lead: Lead) => void }) { return <><header className="topbar compact"><div><p className="eyebrow">Daily lead intake</p><h1>Keep the signal clean.</h1><p className="subhead">Add high-value records from your daily feed, then let the app rank them for every active prospect.</p></div><button className="primary-button" onClick={() => setShowForm(true)}>Add lead</button></header><section className="panel lead-library"><div className="panel-heading"><div><p className="eyebrow">Live opportunity library</p><h2>{leads.length} records available for matching</h2></div></div><div className="lead-list">{leads.map((lead) => <LeadRow lead={lead} key={lead.id} onSave={() => onSave(lead)} />)}</div></section>{showForm && <LeadForm onClose={() => setShowForm(false)} onSubmit={onSubmit} />}</>; }

function LeadForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <div className="modal-backdrop" role="presentation"><section className="modal lead-modal" role="dialog" aria-modal="true" aria-labelledby="new-lead-title"><button className="close-button" onClick={onClose} aria-label="Close form">×</button><p className="eyebrow">New lead</p><h2 id="new-lead-title">Add a project record</h2><p className="modal-copy">Capture the actual record date and the specific reason it matters—this becomes the basis for outreach.</p><form className="form-grid" onSubmit={onSubmit}><label className="full">Project name<input name="project" required placeholder="Project or agency name" /></label><label>Stage<input name="stage" required placeholder="Planning, procurement, permit…" /></label><label>Record date<input name="recordDate" type="date" /></label><label>Source<input name="source" required placeholder="County agenda, bid board…" /></label><label>Match score<input name="score" type="number" min="1" max="100" defaultValue="75" /></label><label className="full">Location<input name="location" required placeholder="City, county" /></label><label className="full">Relevant trades<input name="trades" required placeholder="Electrical, HVAC, concrete…" /></label><label className="full">Why it matters<input name="insight" required placeholder="The concrete reason a contractor should act on this now." /></label><div className="form-actions full"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button">Add lead</button></div></form></section></div>; }

function FollowUpDesk({ followUps, prospects, onComplete, working }: { followUps: FollowUp[]; prospects: Map<string, Prospect>; onComplete: (followUp: FollowUp) => void; working: boolean }) { return <><header className="topbar compact"><div><p className="eyebrow">Follow-up discipline</p><h1>Never let a useful thread go cold.</h1><p className="subhead">The queue only includes contacts without a reply, so your team doesn’t double-touch people.</p></div></header><section className="followup-grid">{followUps.map((followUp) => { const prospect = prospects.get(followUp.prospect_id); return <article className="panel followup-card" key={followUp.id}><p className="eyebrow">Due {formatDate(followUp.due_date)}</p><h2>{prospect?.company ?? "Prospect"}</h2><p className="recipient">{prospect?.contact_name}</p><p>{followUp.note}</p><button className="secondary-button" disabled={working} onClick={() => onComplete(followUp)}>Mark complete</button></article>; })}{followUps.length === 0 && <EmptyCopy title="You’re caught up" body="New follow-ups will appear here when an approved message has not received a reply." />}</section></>; }

function TeamDesk({ workspace, onSubmit, inviteLink, setInviteLink, working }: { workspace: Workspace; onSubmit: (event: FormEvent<HTMLFormElement>) => void; inviteLink: string; setInviteLink: (value: string) => void; working: boolean }) {
  const canInvite = workspace.currentMember?.role === "admin";
  async function copyInvite() { if (!inviteLink) return; try { await navigator.clipboard.writeText(inviteLink); } catch { setInviteLink(inviteLink); } }
  return <><header className="topbar compact"><div><p className="eyebrow">Shared workspace</p><h1>Give your team one source of truth.</h1><p className="subhead">Each person signs in separately. Activity and approvals remain attributable to the teammate who made them.</p></div></header><section className="team-grid"><article className="panel"><p className="eyebrow">People with access</p><h2>{workspace.members.length} active teammate{workspace.members.length === 1 ? "" : "s"}</h2><div className="member-list">{workspace.members.map((member) => <div className="member-row" key={member.user_id}><span className="avatar">{member.display_name.slice(0, 1).toUpperCase()}</span><div><strong>{member.display_name}</strong><span>{member.email}</span></div><em>{member.role}</em></div>)}</div></article><article className="panel invite-panel"><p className="eyebrow">Invite teammates</p><h2>Add at least three people</h2><p className="modal-copy">Create an email-matched invite link, then send it yourself. Links expire after 14 days.</p>{canInvite ? <form className="invite-form" onSubmit={onSubmit}><label>Teammate email<input name="email" type="email" required placeholder="teammate@company.com" /></label><button className="primary-button" disabled={working} type="submit">Create invite link</button></form> : <p className="muted-copy">Only a workspace admin can create invitations.</p>}{inviteLink && <div className="invite-link"><label>Share this link<input readOnly value={inviteLink} aria-label="Invitation link" /></label><button className="secondary-button" onClick={copyInvite}>Copy link</button></div>}<div className="pending-list">{workspace.invitations.map((invite) => <p key={invite.id}><span className="pending-dot" /> {invite.email} · expires {formatDate(invite.expires_at)}</p>)}</div></article></section><section className="panel activity-panel"><div className="panel-heading"><div><p className="eyebrow">Recent activity</p><h2>Team actions</h2></div></div>{workspace.activity.map((activity) => <div className="activity-row" key={activity.id}><span className="activity-mark" /><p><strong>{activity.actor}</strong> {activity.action}<small>{activity.detail} · {formatDate(activity.created_at)}</small></p></div>)}</section></>;
}

function EmptyCopy({ title, body }: { title: string; body: string }) { return <section className="empty-copy"><h2>{title}</h2><p>{body}</p></section>; }
