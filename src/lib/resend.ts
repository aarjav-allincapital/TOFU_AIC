import "server-only";
import { Resend } from "resend";
import { shouldBlockOutboundFounderEmail } from "@/lib/outbound-email-guard";
import { parseStoredLinkedInPreview } from "@/lib/linkedin/preview";

const FROM =
  process.env.RESEND_FROM_EMAIL ||
  process.env.RESEND_FROM_TEAM ||
  "All In Capital <team@allincapital.vc>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://tofu-aic.vercel.app";

/**
 * Call-invite From — must be a verified @allincapital.vc mailbox.
 * team@ is already verified in Resend (used elsewhere). Copy still signs
 * off as Kushal; replies go to response@ (or KUSHAL_REPLY_TO if set).
 */
const CALL_FROM =
  process.env.RESEND_FROM_CALL ||
  process.env.RESEND_FROM_TEAM ||
  "All In Capital <team@allincapital.vc>";

const CALL_REPLY_TO =
  process.env.KUSHAL_REPLY_TO ||
  process.env.RESEND_REPLY_TO ||
  "response@allincapital.vc";

let client: Resend | null = null;

function getClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");
  if (!client) client = new Resend(apiKey);
  return client;
}

/** Resend returns { data, error } instead of throwing — surface failures. */
async function sendEmail(
  payload: Parameters<ReturnType<typeof getClient>["emails"]["send"]>[0],
) {
  const result = await getClient().emails.send(payload);
  if (result.error) {
    throw new Error(result.error.message || "Resend rejected the email.");
  }
  return result;
}

function shell(bodyHtml: string) {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 0 32px;">
                <div style="font-size:15px;font-weight:800;letter-spacing:-0.01em;color:#111827;">All In Capital</div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 32px 32px;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
          <p style="margin:20px 0 0 0;font-size:12px;color:#9ca3af;">All In Capital · TOFU Sign-in Portal</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendOtpEmail(email: string, code: string) {
  const html = shell(`
    <p style="margin:0 0 4px 0;font-size:18px;font-weight:700;color:#111827;">Your TOFU sign-in code</p>
    <p style="margin:0 0 20px 0;font-size:14px;color:#6b7280;">Use this code to sign in to the TOFU portal. It expires in 10 minutes.</p>
    <div style="background:#f3f4f6;border-radius:10px;padding:18px 0;text-align:center;margin-bottom:20px;">
      <span style="font-size:32px;font-weight:800;letter-spacing:0.3em;color:#111827;">${code}</span>
    </div>
    <p style="margin:0;font-size:12px;color:#9ca3af;">If you didn't request this, you can safely ignore this email.</p>
  `);

  return sendEmail({
    from: FROM,
    to: email,
    subject: `${code} is your TOFU sign-in code`,
    html,
  });
}

export async function sendInviteEmail(email: string, invitedBy?: string) {
  const loginUrl = `${APP_URL}/login?email=${encodeURIComponent(email)}`;
  const inviterRaw = invitedBy?.trim() || "";
  const inviter = inviterRaw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const who = inviter || "Someone on the All In Capital team";
  const whoText = inviterRaw || "Someone on the All In Capital team";

  const text = `${whoText} invited you to TOFU

TOFU is All In Capital's deal-flow portal — inbound founder emails, ratings, and pipeline in one place.

Sign in here (no password — we'll email you a one-time code):
${loginUrl}

—
All In Capital · TOFU`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>You're invited to TOFU</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:48px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
          <!-- Brand bar -->
          <tr>
            <td style="background:#0a0a0a;padding:22px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:15px;font-weight:700;letter-spacing:-0.02em;color:#ffffff;">
                    All In Capital
                  </td>
                  <td align="right" style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#a3a3a3;">
                    TOFU
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 28px 32px;">
              <p style="margin:0 0 8px 0;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#737373;">
                Team invitation
              </p>
              <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.03em;color:#0a0a0a;">
                You're invited to TOFU
              </h1>
              <p style="margin:0 0 8px 0;font-size:15px;line-height:1.6;color:#404040;">
                <strong style="color:#0a0a0a;font-weight:600;">${who}</strong> invited you to All In Capital's deal-flow portal.
              </p>
              <p style="margin:0 0 28px 0;font-size:15px;line-height:1.6;color:#525252;">
                Review inbound founder emails, ratings, and pipeline — all in one place.
              </p>

              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
                <tr>
                  <td style="border-radius:10px;background:#0a0a0a;">
                    <a href="${loginUrl}"
                       style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:-0.01em;">
                      Open TOFU →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- How it works -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #ececec;border-radius:12px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <p style="margin:0 0 12px 0;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#737373;">
                      How to sign in
                    </p>
                    <p style="margin:0 0 8px 0;font-size:13.5px;line-height:1.5;color:#404040;">
                      <span style="display:inline-block;width:18px;font-weight:700;color:#0a0a0a;">1.</span>
                      Click the button above (or use the link below)
                    </p>
                    <p style="margin:0 0 8px 0;font-size:13.5px;line-height:1.5;color:#404040;">
                      <span style="display:inline-block;width:18px;font-weight:700;color:#0a0a0a;">2.</span>
                      Enter your <strong style="font-weight:600;">@allincapital.vc</strong> email
                    </p>
                    <p style="margin:0;font-size:13.5px;line-height:1.5;color:#404040;">
                      <span style="display:inline-block;width:18px;font-weight:700;color:#0a0a0a;">3.</span>
                      We'll email you a one-time code — no password
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer inside card -->
          <tr>
            <td style="padding:0 32px 28px 32px;">
              <p style="margin:0 0 6px 0;font-size:12px;line-height:1.5;color:#a3a3a3;word-break:break-all;">
                Or paste this link:<br/>
                <a href="${loginUrl}" style="color:#737373;text-decoration:underline;">${loginUrl}</a>
              </p>
            </td>
          </tr>
        </table>

        <p style="margin:24px 0 0 0;font-size:12px;line-height:1.5;color:#a3a3a3;">
          All In Capital · TOFU Sign-in Portal<br/>
          If you weren't expecting this, you can ignore this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return sendEmail({
    from: FROM,
    to: email,
    subject: inviterRaw
      ? `${inviterRaw} invited you to TOFU — All In Capital`
      : "You're invited to TOFU — All In Capital",
    html,
    text,
  });
}

/**
 * Founder call-invite — only when a human picks Call with X in the portal.
 * Never used by auto-pass / bulk jobs.
 * From: team@ · Reply-To: response@ · CC: the teammate · Signed: Team All In Capital
 */
export async function sendCallInviteEmail(params: {
  founderEmail: string;
  founderName: string;
  teamMemberName: string;
  calendlyUrl: string;
  /** Teammate mailbox, e.g. kb@allincapital.vc — always CC'd. */
  ccEmail?: string;
  /** Optional LinkedIn for the teammate taking the call. */
  linkedinUrl?: string;
  /** Aditya (1) signs off as himself; everyone else as Team All In Capital. */
  signoff?: "team" | "aditya";
}) {
  if (shouldBlockOutboundFounderEmail(params.founderEmail)) {
    throw new Error(
      "Outbound founder email blocked for this address (portfolio / exclusion).",
    );
  }
  const {
    founderEmail,
    founderName,
    teamMemberName,
    calendlyUrl,
    ccEmail,
    linkedinUrl,
    signoff = "team",
  } = params;
  const greetName = founderName?.trim() || "there";
  const cc = (ccEmail || "").trim().toLowerCase();
  const linkedin = (linkedinUrl || "").trim();

  const linkedinText = linkedin
    ? `\nHere's a bit more about ${teamMemberName}, who'll be engaging with you on the call: ${linkedin}\n`
    : "";
  const linkedinHtml = linkedin
    ? `<p>Here's a bit more about ${escapeHtml(teamMemberName)}, who'll be engaging with you on the call — <a href="${escapeHtml(linkedin)}" style="color:#111827;font-weight:600;text-decoration:underline;">view their LinkedIn</a>.</p>`
    : "";

  const signoffText =
    signoff === "aditya" ? "Regards,\nAditya" : "Thanks\nTeam All In Capital";
  const signoffHtml =
    signoff === "aditya"
      ? `<p>Regards,<br/><strong>Aditya</strong></p>`
      : `<p style="margin-bottom:4px;">Thanks<br/><strong>Team All In Capital</strong></p>`;

  const text = `Hi ${greetName},

Thanks for writing to us at All In Capital! We enjoyed reading about
you and your startup and want to have a short call to learn more.

${teamMemberName}, who looks at this space, would love to chat. Book a time here:
${calendlyUrl}
${linkedinText}
Looking forward to speaking soon!

${signoffText}

—
All In Capital · response@allincapital.vc`;

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111827;">
<p>Hi ${escapeHtml(greetName)},</p>
<p>Thanks for writing to us at All In Capital! We enjoyed reading about you and your startup and want to have a short call to learn more.</p>
<p>${escapeHtml(teamMemberName)}, who looks at this space, would love to chat. <a href="${escapeHtml(calendlyUrl)}" style="color:#111827;font-weight:600;text-decoration:underline;">Book a time here</a>.</p>
${linkedinHtml}
<p>Looking forward to speaking soon!</p>
${signoffHtml}
<p style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
  All In Capital · <a href="mailto:response@allincapital.vc" style="color:#6b7280;text-decoration:underline;">response@allincapital.vc</a>
</p>
</div>`;

  return sendEmail({
    from: CALL_FROM,
    to: founderEmail,
    ...(cc.includes("@") ? { cc: [cc] } : {}),
    replyTo: CALL_REPLY_TO,
    subject: `Let's find time to chat — All In Capital`,
    html,
    text,
  });
}

/**
 * Private call brief for the teammate whose bucket was picked.
 * Never sent to the founder — no To, Cc, or Bcc includes them.
 */
export async function sendCallBriefEmail(params: {
  toEmail: string;
  teamMemberName: string;
  founderName: string;
  founderEmail: string;
  company: string;
  sector: string;
  website: string;
  linkedin: string;
  eliteSchool: string;
  blurb: string;
  summary: string;
  aiSummary: string;
  aiStars: number | null;
  deckSummary: string;
  deckLink: string;
  infoReplyNote: string;
  linkedinWorkHistory: string | null;
  linkedinCollege: string | null;
  deckAttachment?: { filename: string; content: Buffer };
}) {
  const to = params.toEmail.trim().toLowerCase();
  const founder = params.founderEmail.trim().toLowerCase();
  if (!to.endsWith("@allincapital.vc")) {
    throw new Error("Call brief can only be sent to an All In mailbox.");
  }
  if (founder && to === founder) {
    throw new Error("Call brief must not be sent to the founder.");
  }

  const company = params.company.trim() || "Untitled";
  const founderName = params.founderName.trim() || "Unknown founder";
  const preview = parseStoredLinkedInPreview(
    params.linkedinWorkHistory,
    params.linkedinCollege,
    params.linkedin,
  );
  const reply = parseReplyNote(params.infoReplyNote);
  const deckSummary = cleanDeckSummary(params.deckSummary);
  const stars =
    params.aiStars == null ? "" : `${params.aiStars}★`;

  const experience = (preview?.experience || [])
    .map((item) =>
      [item.title, item.company, item.duration].filter(Boolean).join(" · "),
    )
    .filter(Boolean);
  const education = (preview?.education || [])
    .map((item) => [item.school, item.degree].filter(Boolean).join(" · "))
    .filter(Boolean);
  const school =
    params.eliteSchool.trim() ||
    education[0] ||
    (params.linkedinCollege || "").split("\n")[0]?.trim() ||
    "";

  const lines: string[] = [
    `${params.teamMemberName}, a call was just booked with ${founderName}${company !== "Untitled" ? ` (${company})` : ""}.`,
    "",
    "This note is only for you. The founder does not receive it.",
    "",
    "Founder",
    `Name: ${founderName}`,
    params.founderEmail.trim() ? `Email: ${params.founderEmail.trim()}` : "",
    `Company: ${company}`,
    params.sector.trim() ? `Sector: ${params.sector.trim()}` : "",
    params.website.trim() ? `Website: ${params.website.trim()}` : "",
    params.linkedin.trim() ? `LinkedIn: ${params.linkedin.trim()}` : "",
    preview?.headline ? `Headline: ${preview.headline}` : "",
    school ? `School: ${school}` : "",
    experience.length ? `Work:\n${experience.map((l) => `- ${l}`).join("\n")}` : "",
    education.length > 1
      ? `Education:\n${education.map((l) => `- ${l}`).join("\n")}`
      : "",
    "",
    "Summary",
    params.blurb.trim() ? params.blurb.trim() : "",
    params.summary.trim() ? params.summary.trim() : "",
    params.aiSummary.trim()
      ? `${stars ? `${stars} ` : ""}${params.aiSummary.trim()}`
      : "",
    deckSummary ? deckSummary : "",
    !params.blurb.trim() &&
    !params.summary.trim() &&
    !params.aiSummary.trim() &&
    !deckSummary
      ? "No written summary on file."
      : "",
  ];

  if (reply.subject || reply.body) {
    lines.push(
      "",
      "What they sent back",
      reply.subject ? `Subject: ${reply.subject}` : "",
      reply.body || "",
    );
  }

  lines.push(
    "",
    "Deck",
    params.deckLink.trim()
      ? params.deckLink.trim()
      : "No deck link on file.",
    params.deckAttachment ? "The deck PDF is attached." : "",
  );

  const text = lines
    .filter((line, index) => line !== "" || lines[index - 1] !== "")
    .join("\n")
    .trim();
  const html = briefHtml({
    teamMemberName: params.teamMemberName,
    founderName,
    founderEmail: params.founderEmail.trim(),
    company,
    sector: params.sector.trim(),
    website: params.website.trim(),
    linkedin: params.linkedin.trim(),
    headline: preview?.headline || "",
    school,
    experience,
    education,
    blurb: params.blurb.trim(),
    summary: params.summary.trim(),
    aiSummary: params.aiSummary.trim(),
    stars,
    deckSummary,
    deckLink: params.deckLink.trim(),
    attached: Boolean(params.deckAttachment),
    replySubject: reply.subject,
    replyBody: reply.body,
  });

  return sendEmail({
    from: CALL_FROM,
    to,
    replyTo: CALL_REPLY_TO,
    subject: `Call brief: ${company} — ${founderName}`,
    html,
    text,
    ...(params.deckAttachment
      ? { attachments: [params.deckAttachment] }
      : {}),
  });
}

/**
 * Pass / reject note — only when a deal is newly marked Pass.
 * No CC. Never used by bulk Attio jobs.
 */
export async function sendPassRejectEmail(params: {
  founderEmail: string;
  founderName: string;
}) {
  if (shouldBlockOutboundFounderEmail(params.founderEmail)) {
    throw new Error(
      "Outbound founder email blocked for this address (portfolio / exclusion).",
    );
  }
  const founderEmail = params.founderEmail.trim();
  const name = params.founderName.trim() || "there";

  const text = `Hey ${name},

Thanks for reaching out to us.  We wanted to let you know that at this point, we're not able to move forward with your startup for an investment.

Given the volume of inbounds we get , it's not possible for us to give personalised feedback on why we are passing. However in most cases the reasons come down to relevance to our current themes of interest or overall clarity in the pitch or the execution that the founder has demonstrated.

If you'd like to be reconsidered, the best path is through a referral from someone in our portfolio or founder network.

You are welcome to reach out again at https://superdm.com/kushal in a few weeks or months if you feel you have changed direction or have much more traction.

Thanks again for applying, and we wish you all the best on your journey.`;

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111827;">
<p>Hey ${escapeHtml(name)},</p>
<p>Thanks for reaching out to us.&nbsp;&nbsp;We wanted to let you know that at this point, we're not able to move forward with your startup for an investment.</p>
<p>Given the volume of inbounds we get , it's not possible for us to give personalised feedback on why we are passing. However in most cases the reasons come down to relevance to our current themes of interest or overall clarity in the pitch or the execution that the founder has demonstrated.</p>
<p>If you'd like to be reconsidered, the best path is through a referral from someone in our portfolio or founder network.</p>
<p>You are welcome to reach out again at <a href="https://superdm.com/kushal" style="color:#111827;font-weight:600;">https://superdm.com/kushal</a> in a few weeks or months if you feel you have changed direction or have much more traction.</p>
<p>Thanks again for applying, and we wish you all the best on your journey.</p>
</div>`;

  return sendEmail({
    from: CALL_FROM,
    to: founderEmail,
    replyTo: CALL_REPLY_TO,
    subject: `Update on your application — All In Capital`,
    html,
    text,
  });
}

/**
 * Pass / reject note sent from Aditya's mailbox.
 * Same template as the standard pass, minus the SuperDM line, sign-off "Regards, Aditya".
 */
export async function sendPassRejectEmailFromAditya(params: {
  founderEmail: string;
  founderName: string;
}) {
  if (shouldBlockOutboundFounderEmail(params.founderEmail)) {
    throw new Error(
      "Outbound founder email blocked for this address (portfolio / exclusion).",
    );
  }
  const founderEmail = params.founderEmail.trim();
  const name = params.founderName.trim() || "there";

  const text = `Hey ${name},

Thanks for reaching out to us.  We wanted to let you know that at this point, we're not able to move forward with your startup for an investment.

Given the volume of inbounds we get , it's not possible for us to give personalised feedback on why we are passing. However in most cases the reasons come down to relevance to our current themes of interest or overall clarity in the pitch or the execution that the founder has demonstrated.

If you'd like to be reconsidered, the best path is through a referral from someone in our portfolio or founder network.

Thanks again for applying, and we wish you all the best on your journey.

Regards,
Aditya`;

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111827;">
<p>Hey ${escapeHtml(name)},</p>
<p>Thanks for reaching out to us.&nbsp;&nbsp;We wanted to let you know that at this point, we're not able to move forward with your startup for an investment.</p>
<p>Given the volume of inbounds we get , it's not possible for us to give personalised feedback on why we are passing. However in most cases the reasons come down to relevance to our current themes of interest or overall clarity in the pitch or the execution that the founder has demonstrated.</p>
<p>If you'd like to be reconsidered, the best path is through a referral from someone in our portfolio or founder network.</p>
<p>Thanks again for applying, and we wish you all the best on your journey.</p>
<p>Regards,<br/><strong>Aditya</strong></p>
</div>`;

  const ADITYA_FROM =
    process.env.RESEND_FROM_ADITYA ||
    "Aditya Singh <adityasingh@allincapital.vc>";
  const ADITYA_REPLY_TO =
    process.env.ADITYA_REPLY_TO || "adityasingh@allincapital.vc";

  return sendEmail({
    from: ADITYA_FROM,
    to: founderEmail,
    replyTo: ADITYA_REPLY_TO,
    subject: `Update on your application — All In Capital`,
    html,
    text,
  });
}

/**
 * "Request Info" nudge — for vague 1-star inbounds where the team might hold
 * signal. Asks the founder for a deck, team background, and stage/traction.
 * Sent from Aditya's mailbox.
 */
export async function sendRequestInfoEmail(params: {
  founderEmail: string;
  founderName: string;
}) {
  if (shouldBlockOutboundFounderEmail(params.founderEmail)) {
    throw new Error(
      "Outbound founder email blocked for this address (portfolio / exclusion).",
    );
  }
  const founderEmail = params.founderEmail.trim();
  const name = params.founderName.trim() || "there";

  const text = `Hi ${name},

Thanks for reaching out to All In Capital.

We'd love to learn a bit more before we can evaluate properly. Could you share:

1. A pitch deck or one-pager on what you're building
2. A brief note on the founding team's background
3. Where you are today (stage, traction, fundraise details)

Happy to take a closer look once we have more context.

Best,
Aditya`;

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111827;">
<p>Hi ${escapeHtml(name)},</p>
<p>Thanks for reaching out to All In Capital.</p>
<p>We'd love to learn a bit more before we can evaluate properly. Could you share:</p>
<ol style="margin:0 0 16px 0;padding-left:20px;">
  <li>A pitch deck or one-pager on what you're building</li>
  <li>A brief note on the founding team's background</li>
  <li>Where you are today (stage, traction, fundraise details)</li>
</ol>
<p>Happy to take a closer look once we have more context.</p>
<p>Best,<br/><strong>Aditya</strong></p>
</div>`;

  const ADITYA_FROM =
    process.env.RESEND_FROM_ADITYA ||
    "Aditya Singh <adityasingh@allincapital.vc>";
  const ADITYA_REPLY_TO =
    process.env.ADITYA_REPLY_TO || "adityasingh@allincapital.vc";

  return sendEmail({
    from: ADITYA_FROM,
    to: founderEmail,
    replyTo: ADITYA_REPLY_TO,
    subject: `Re: Your pitch — All In Capital`,
    html,
    text,
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseReplyNote(note: string): { subject: string; body: string } {
  const raw = note.trim();
  if (!raw) return { subject: "", body: "" };
  const match = raw.match(/^Subject:\s*(.*)\n?([\s\S]*)$/i);
  if (match) return { subject: match[1].trim(), body: (match[2] || "").trim() };
  return { subject: "", body: raw };
}

function cleanDeckSummary(raw: string): string {
  const text = raw.trim();
  if (!text) return "";
  if (text.startsWith("{")) return "";
  if (/"experience"\s*:\s*\[/.test(text)) return "";
  if (/^\s*Work experience\b/i.test(text)) return "";
  return text;
}

function briefBlock(label: string, body: string) {
  if (!body.trim()) return "";
  return `<p style="margin:16px 0 4px 0;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#6b7280;">${escapeHtml(label)}</p>
<p style="margin:0;white-space:pre-wrap;">${escapeHtml(body.trim())}</p>`;
}

function briefHtml(params: {
  teamMemberName: string;
  founderName: string;
  founderEmail: string;
  company: string;
  sector: string;
  website: string;
  linkedin: string;
  headline: string;
  school: string;
  experience: string[];
  education: string[];
  blurb: string;
  summary: string;
  aiSummary: string;
  stars: string;
  deckSummary: string;
  deckLink: string;
  attached: boolean;
  replySubject: string;
  replyBody: string;
}) {
  const facts = [
    params.founderEmail ? `Email: ${params.founderEmail}` : "",
    `Company: ${params.company}`,
    params.sector ? `Sector: ${params.sector}` : "",
    params.website ? `Website: ${params.website}` : "",
    params.linkedin ? `LinkedIn: ${params.linkedin}` : "",
    params.headline ? `Headline: ${params.headline}` : "",
    params.school ? `School: ${params.school}` : "",
    params.experience.length
      ? `Work:\n${params.experience.map((line) => `- ${line}`).join("\n")}`
      : "",
    params.education.length
      ? `Education:\n${params.education.map((line) => `- ${line}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const summary = [
    params.blurb,
    params.summary,
    params.aiSummary
      ? `${params.stars ? `${params.stars} ` : ""}${params.aiSummary}`
      : "",
    params.deckSummary,
  ]
    .filter(Boolean)
    .join("\n\n");

  const reply = [params.replySubject ? `Subject: ${params.replySubject}` : "", params.replyBody]
    .filter(Boolean)
    .join("\n");

  const deck = [
    params.deckLink || "No deck link on file.",
    params.attached ? "The deck PDF is attached." : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111827;">
<p style="margin:0 0 8px 0;">${escapeHtml(params.teamMemberName)}, a call was just booked with <strong>${escapeHtml(params.founderName)}</strong>${params.company !== "Untitled" ? ` (${escapeHtml(params.company)})` : ""}.</p>
<p style="margin:0 0 16px 0;font-size:12px;color:#6b7280;">This note is only for you. The founder does not receive it.</p>
${briefBlock("Founder", facts)}
${briefBlock("Summary", summary || "No written summary on file.")}
${reply ? briefBlock("What they sent back", reply) : ""}
${briefBlock("Deck", deck)}
</div>`;
}
