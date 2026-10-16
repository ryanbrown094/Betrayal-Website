// The email a buyer gets when their payment clears: their booking code, how to open their Table, and where to get help.
// HTML for mail clients (tables and inline styles, which is what they all render alike) with a plain-text twin. The
// Registry sends it once per booking (Registry.mailCode); see HANDOVER §6.4 for what the domain needs before it can
// reach any inbox.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function bookingEmail({ code, sub, host }) {
  const site = "https://" + host, open = `${site}/?code=${encodeURIComponent(code)}#start`, c = esc(code);
  const subject = sub ? "You’re a Regular: your booking code for The Betrayal" : "Your Table is booked: your code for The Betrayal";
  const lead = sub
    ? "Thank you for becoming a Regular. Here is your booking code. It opens a new Table whenever you like, one game at a time, for as long as you’re subscribed."
    : "Thank you for booking a Table. Here is your booking code: it’s all you need on the night, so keep this email somewhere you’ll find it.";
  const steps = [
    ["On the night", `Open <a href="${site}" style="color:#E6A58C">${esc(host)}</a> on the phone you’ll play on and enter your code. Your Table opens for 48 hours from that moment${sub ? ", and each new game gets its own 48 hours" : ", so you can set up in the afternoon and play in the evening"}.`],
    ["Your guests join", `They scan the QR code on the TV, or go to <a href="${site}/join" style="color:#E6A58C">${esc(host)}/join</a> and type the Table code. Everyone plays on their own phone, with nothing to install.`],
    ["Have a prize ready", "Chocolate coins unless you choose your own: every 100 points in the Purse is one coin. The game does the rest."],
  ];
  const stepRows = steps.map(([h, t], i) => `
            <tr>
              <td valign="top" width="44" style="padding:0 0 18px 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:30px;color:#E6A58C">${i + 1}</td>
              <td valign="top" style="padding:0 0 18px 0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#D9C2BA"><strong style="color:#F4C9B7">${h}.</strong> ${t}</td>
            </tr>`).join("");
  const preheader = `Your booking code: ${c}. ${sub ? "It opens a new Table whenever you like." : "Open your Table whenever you’re ready."}`;

  const html = `<!doctype html>
<html lang="en-GB" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${esc(subject)}</title>
<style>
  body { margin:0; padding:0; background:#09070A }
  a { color:#E6A58C }
  @media (max-width:620px) { .card { padding:32px 22px !important } .code { font-size:24px !important; letter-spacing:2px !important } .h1 { font-size:30px !important } }
</style>
</head>
<body style="margin:0;padding:0;background:#09070A">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#09070A">${preheader}</div>
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
          <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#E6A58C;padding:0 0 10px 0">${sub ? "Welcome, Regular" : "Booking confirmed"}</td></tr>
          <tr><td class="h1" style="font-family:Georgia,'Times New Roman',serif;font-size:36px;line-height:42px;color:#F4C9B7;padding:0 0 16px 0">${sub ? "You’re a Regular" : "Your Table is booked"}</td></tr>
          <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:25px;color:#D9C2BA;padding:0 0 26px 0">${lead}</td></tr>
          <tr><td align="center" style="padding:0 0 10px 0">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
              <td align="center" bgcolor="#1D1220" style="background:#1D1220;border:1px solid #E6A58C;border-radius:6px;padding:22px 12px">
                <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#AFA198;padding:0 0 8px 0">Your booking code</div>
                <div class="code" style="font-family:'Courier New',Courier,monospace;font-size:30px;line-height:36px;font-weight:bold;letter-spacing:4px;color:#F4C9B7">${c}</div>
              </td>
            </tr></table>
          </td></tr>
          <tr><td align="center" style="padding:22px 0 32px 0">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td align="center" bgcolor="#E6A58C" style="background:#E6A58C;border-radius:4px">
                <a href="${open}" style="display:inline-block;padding:15px 34px;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;letter-spacing:1px;color:#150B17;text-decoration:none">Open your Table</a>
              </td>
            </tr></table>
            <div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#877E78;padding:10px 0 0 0">The button fills in your code. Open it on the night, from the phone you’ll play on.</div>
          </td></tr>
          <tr><td style="border-top:1px solid #3d2733;padding:28px 0 6px 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#F4C9B7">How the night works</td></tr>
          <tr><td style="padding:12px 0 0 0">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${stepRows}
            </table>
          </td></tr>
          <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:23px;color:#AFA198;padding:4px 0 0 0">
            New to it? Read <a href="${site}/rules" style="color:#E6A58C">how to play</a> or <a href="${site}/tour" style="color:#E6A58C">see a game, screen by screen</a>.${sub ? ` To change your card or cancel, enter your code under “Manage subscription” on <a href="${site}/#start" style="color:#E6A58C">${esc(host)}</a>.` : ""}
          </td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:26px 20px 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#877E78">
        Questions, or something not working? Reply to this email or write to <a href="mailto:info@thebetrayal.co.uk" style="color:#E6A58C">info@thebetrayal.co.uk</a>.<br>
        ${sub ? "" : `If you haven’t opened your Table yet, you can cancel within 14 days for a full refund: see <a href="${site}/refunds" style="color:#E6A58C">refunds</a>.<br>`}
        <span style="color:#5f5650">The Betrayal · <a href="${site}" style="color:#5f5650">${esc(host)}</a></span>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = `${sub ? "You’re a Regular" : "Your Table is booked"}

${lead.replace(/<[^>]+>/g, "")}

Your booking code: ${code}

Open your Table: ${open}

How the night works
1. On the night: open ${site} on the phone you’ll play on and enter your code. Your Table opens for 48 hours from that moment.
2. Your guests join: they scan the QR code on the TV, or go to ${site}/join and type the Table code. Everyone plays on their own phone.
3. Have a prize ready: chocolate coins unless you choose your own. Every 100 points in the Purse is one coin.

How to play: ${site}/rules
See a game: ${site}/tour
${sub ? `To change your card or cancel, enter your code under "Manage subscription" on ${site}\n` : `If you haven’t opened your Table yet, you can cancel within 14 days for a full refund: ${site}/refunds\n`}
Questions? Reply to this email or write to info@thebetrayal.co.uk.

The Betrayal · ${host}
`;
  return { subject, html, text };
}

// Sends it through the MAIL send_email binding. Throws if the binding refuses (the caller logs it and tries again
// on the next claim).
export async function sendBooking(env, to, code, sub) {
  if (!env || !env.MAIL) throw new Error("no MAIL binding");
  const host = env.SITE_HOST || "thebetrayal.co.uk", m = bookingEmail({ code, sub, host });
  return env.MAIL.send({
    from: { email: env.BOOKING_FROM || "bookings@" + host, name: "The Betrayal" },
    to, replyTo: env.REPLY_TO || "info@" + host,
    subject: m.subject, html: m.html, text: m.text,
  });
}
