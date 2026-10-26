// The emails the admin sends a buyer by hand: the feedback survey ("Survey" on their booking code) and the 30% code
// they get for answering it, and an apology with a free game ("Apologise"). Same look as the booking email (booking-mail.js); HTML with a plain-text twin. Like it,
// they reach real inboxes only once the domain is set up for sending (HANDOVER §6.4a).

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const day = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

function frame({ site, host, title, preheader, eyebrow, heading, body, button, foot }) {
  return `<!doctype html>
<html lang="en-GB" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${esc(title)}</title>
<style>
  body { margin:0; padding:0; background:#09070A }
  a { color:#E6A58C }
  @media (max-width:620px) { .card { padding:32px 22px !important } .code { font-size:24px !important; letter-spacing:2px !important } .h1 { font-size:30px !important } }
</style>
</head>
<body style="margin:0;padding:0;background:#09070A">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#09070A">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#09070A" style="background:#09070A">
  <tr><td align="center" style="padding:32px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
      <tr><td align="center" style="padding:0 0 22px 0">
        <a href="${site}"><img src="${site}/media/email-crest.png" width="102" height="120" alt="" style="display:block;border:0;width:102px;height:120px"></a>
      </td></tr>
      <tr><td align="center" style="padding:0 0 26px 0">
        <img src="${site}/media/email-wordmark.png" width="320" height="61" alt="The Betrayal" style="display:block;border:0;width:320px;height:auto;font-family:Georgia,serif;font-size:32px;color:#E6A58C">
      </td></tr>
      <tr><td class="card" bgcolor="#140C15" style="background:#140C15;border:1px solid #3d2733;border-radius:6px;padding:40px 40px 34px 40px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#E6A58C;padding:0 0 10px 0">${esc(eyebrow)}</td></tr>
          <tr><td class="h1" style="font-family:Georgia,'Times New Roman',serif;font-size:36px;line-height:42px;color:#F4C9B7;padding:0 0 16px 0">${esc(heading)}</td></tr>
          ${body}
          <tr><td align="center" style="padding:22px 0 10px 0">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td align="center" bgcolor="#E6A58C" style="background:#E6A58C;border-radius:4px">
                <a href="${button[1]}" style="display:inline-block;padding:15px 34px;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;letter-spacing:1px;color:#150B17;text-decoration:none">${esc(button[0])}</a>
              </td>
            </tr></table>
          </td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:26px 20px 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#877E78">
        ${foot}
        <span style="color:#5f5650">The Betrayal · <a href="${site}" style="color:#5f5650">${esc(host)}</a></span>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
const para = (html) => `<tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:25px;color:#D9C2BA;padding:0 0 14px 0">${html}</td></tr>`;
const codeBox = (label, c) => `<tr><td align="center" style="padding:6px 0 10px 0">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
              <td align="center" bgcolor="#1D1220" style="background:#1D1220;border:1px solid #E6A58C;border-radius:6px;padding:22px 12px">
                <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#AFA198;padding:0 0 8px 0">${esc(label)}</div>
                <div class="code" style="font-family:'Courier New',Courier,monospace;font-size:30px;line-height:36px;font-weight:bold;letter-spacing:4px;color:#F4C9B7">${c}</div>
              </td>
            </tr></table>
          </td></tr>`;

// the survey: five questions and a box, for 30% off a Table
export function surveyEmail({ token, host }) {
  const site = "https://" + host, link = `${site}/survey?t=${token}`, stop = `${link}&stop=1`;
  const subject = "How was your game of The Betrayal? 30% off for two minutes";
  const lead = "Thank you for playing The Betrayal. We’re a small, independent game, and every answer helps us make the next night better.";
  const ask = "Five quick questions and a box for anything else: about two minutes. Answer them and we’ll give you <strong style=\"color:#F4C9B7\">30% off your next Table</strong>, or a code to pass to a friend.";
  const html = frame({
    site, host, title: subject, preheader: "Five quick questions about your game, and 30% off your next Table for answering.",
    eyebrow: "Your feedback", heading: "How did it go?", body: para(lead) + para(ask), button: ["Answer five questions", link],
    foot: `You’re getting this because you booked a Table. We only ask now and then.<br>Don’t want emails like this? <a href="${stop}" style="color:#E6A58C">Stop feedback emails</a>. Questions? Reply, or write to <a href="mailto:info@thebetrayal.co.uk" style="color:#E6A58C">info@thebetrayal.co.uk</a>.<br>`,
  });
  const text = `How did it go?

${lead}

Five quick questions and a box for anything else: about two minutes. Answer them and we'll give you 30% off your next Table, or a code to pass to a friend.

Answer five questions: ${link}

You're getting this because you booked a Table. We only ask now and then.
Don't want emails like this? Stop feedback emails: ${stop}
Questions? Reply, or write to info@thebetrayal.co.uk.

The Betrayal · ${host}
`;
  return { subject, html, text };
}

// the thank-you: their code, one use, one Table
export function thanksEmail({ code, until, host }) {
  const site = "https://" + host, book = `${site}/buy?discount=${encodeURIComponent(code)}`, c = esc(code);
  const subject = "Your 30% off code for The Betrayal";
  const box = codeBox("30% off one Table", c);
  const html = frame({
    site, host, title: subject, preheader: `Your code: ${code}. 30% off one Table, until ${day(until)}.`,
    eyebrow: "Thank you", heading: "Your 30% off",
    body: para("Thank you for telling us how it went. Here’s your code: 30% off one Table, for you or for a friend to host their own.") + box
      + para(`Use it once, by ${esc(day(until))}: on the booking page, tap “Have a discount code?” and type it in. The button below fills it in for you.`),
    button: ["Book a Table with it", book],
    foot: `Questions? Reply, or write to <a href="mailto:info@thebetrayal.co.uk" style="color:#E6A58C">info@thebetrayal.co.uk</a>.<br>`,
  });
  const text = `Your 30% off

Thank you for telling us how it went. Here's your code: 30% off one Table, for you or for a friend to host their own.

Your code: ${code}

Use it once, by ${day(until)}: on the booking page, tap "Have a discount code?" and type it in.
Book a Table with it: ${book}

Questions? Reply, or write to info@thebetrayal.co.uk.

The Betrayal · ${host}
`;
  return { subject, html, text };
}

// the apology: a new booking code for one free Table, sent when a game went wrong
export function apologyEmail({ code, host }) {
  const site = "https://" + host, open = `${site}/?code=${encodeURIComponent(code)}#start`, c = esc(code);
  const subject = "We’re sorry: a free game of The Betrayal";
  const lead = "We’re sorry your game of The Betrayal wasn’t the night we meant it to be.";
  const offer = "We’d love you to give it another go, on us. Here’s a booking code for a free game: one Table for a party of 8 to 24 players, open for 48 hours from when you first use it.";
  const how = "Use it whenever you like. On the night, tap the button below on the phone you’ll play on, or go to " + host + " and enter the code. We hope you enjoy it this time.";
  const html = frame({
    site, host, title: subject, preheader: `Your free booking code: ${code}. One Table, whenever you’re ready.`,
    eyebrow: "An apology", heading: "We’re sorry", body: para(lead) + para(offer) + codeBox("One free Table", c) + para(how),
    button: ["Open your Table", open],
    foot: `If anything gets in the way again, reply to this email and we’ll put it right, or write to <a href="mailto:info@thebetrayal.co.uk" style="color:#E6A58C">info@thebetrayal.co.uk</a>.<br>`,
  });
  const text = `We're sorry

We're sorry your game of The Betrayal wasn't the night we meant it to be.

We'd love you to give it another go, on us. Here's a booking code for a free game: one Table for a party of 8 to 24 players, open for 48 hours from when you first use it.

Your code: ${code}

Use it whenever you like. On the night, go to ${host} on the phone you'll play on and enter the code. We hope you enjoy it this time.
Open your Table: ${open}

If anything gets in the way again, reply to this email and we'll put it right, or write to info@thebetrayal.co.uk.

The Betrayal · ${host}
`;
  return { subject, html, text };
}

// All three go through the MAIL send_email binding, from the bookings address; replies come to us. Throws if it refuses.
export async function sendFeedbackMail(env, to, m) {
  if (!env || !env.MAIL) throw new Error("no MAIL binding");
  const host = env.SITE_HOST || "thebetrayal.co.uk";
  return env.MAIL.send({ from: { email: env.BOOKING_FROM || "bookings@" + host, name: "The Betrayal" }, to, replyTo: env.REPLY_TO || "info@" + host, subject: m.subject, html: m.html, text: m.text });
}
