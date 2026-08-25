import React from 'react'

const UPDATED = 'August 25, 2026'

function Section({ id, title, children }) {
  return (
    <section id={id} style={{ marginBottom: 32, scrollMarginTop: 90 }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>{title}</h2>
      <div style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </section>
  )
}

export default function Legal() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 24px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <h1 style={{
          fontSize: 30, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 6,
          background: 'linear-gradient(135deg, var(--brand), var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>Terms &amp; Privacy</h1>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>Last updated {UPDATED}</p>
      </div>

      <div className="card" style={{ padding: '24px 28px' }}>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
          Jump to: <a href="#terms" style={{ color: 'var(--brand2)' }}>Terms of Use</a> · <a href="#privacy" style={{ color: 'var(--brand2)' }}>Privacy Policy</a>
        </p>

        <Section id="terms" title="Terms of Use">
          <p>Poll Position is a fan-run college football ranking site. By creating an account or submitting a ballot, you agree to the following:</p>
          <p><strong>Ballots are yours alone.</strong> Sign in with your own Google account and submit your own rankings. Don't attempt to submit, alter, or delete another voter's ballot, or otherwise manipulate the poll results.</p>
          <p><strong>Be respectful.</strong> Voter names may be visible to other users (e.g. in "who voted for this team"). Don't use the display name from your Google account to impersonate someone else or post anything abusive.</p>
          <p><strong>No guarantees.</strong> The site, rankings, and underlying game data are provided "as is," may contain errors, and may change or go offline at any time without notice. This is a hobby project, not an official or professional ranking service.</p>
          <p><strong>Access can be revoked.</strong> We may suspend or remove accounts that abuse the voting system, attempt to access the API outside normal use, or otherwise interfere with the site.</p>
        </Section>

        <Section id="privacy" title="Privacy Policy">
          <p><strong>What we collect.</strong> When you sign in with Google, we receive your name, email address, and profile picture from Google's sign-in flow. We store this along with the ballots (team rankings) you submit.</p>
          <p><strong>How it's used.</strong> Your name and ballots are used to run the poll — computing consensus rankings, showing "who voted for this team," and tracking a leaderboard. Your email may be used to send you optional voting-deadline reminders and weekly recap emails; you can opt out at any time.</p>
          <p><strong>What we don't do.</strong> We don't sell your data, and we don't share it with third parties beyond what's needed to run the site (e.g. our hosting and database providers).</p>
          <p><strong>Cookies &amp; local storage.</strong> We use browser local storage to keep you signed in (a session token) and to remember an in-progress ballot before you submit it. We don't use third-party ad-tracking cookies.</p>
          <p><strong>Your choices.</strong> You can delete your submitted ballot for the current week at any time before the voting deadline from the My Ballot page. To have your account and history fully removed, contact the site owner.</p>
          <p><strong>Contact.</strong> Questions about this policy or your data? Reach out to <a href="mailto:stevetheproductmanager@gmail.com" style={{ color: 'var(--brand2)' }}>stevetheproductmanager@gmail.com</a>.</p>
        </Section>
      </div>
    </div>
  )
}
