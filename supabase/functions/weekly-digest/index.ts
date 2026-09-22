// Supabase Edge Function: weekly-digest
//
// Doel: bouwt de wekelijkse herinneringsmail per gebruiker op basis van
// de view `weekly_digest_v` en verstuurt via Resend. Idempotency komt later.
//
// Abonnement: een gebruiker krijgt alleen mail als `user_settings` een rij
// heeft met `digest_enabled = true` én `digest_dag` gelijk aan vandaag.
// Geen rij = niet geabonneerd. De cron vuurt daarom dagelijks in plaats van
// alleen op maandag; zie `03_cron.sql`.
//
// Query-params:
//   ?dryRun=true            → response = HTML van de mail (text/html).
//                             Geen verzending. VEREIST ook een userId.
//                             Slaat het abonnement-filter over, zodat je
//                             de mail kunt bekijken op een willekeurige dag.
//   ?ignoreSchedule=true    → live verzendtest op een willekeurige dag:
//                             negeert `digest_dag` maar respecteert
//                             `digest_enabled`. Zonder deze vlag faalt een
//                             test met alleen ?forceTo= stil met
//                             'andere dag' op 6 van de 7 dagen.
//   ?userId=<uuid>          → filter op één gebruiker. Verplicht bij dryRun,
//                             sterk aanbevolen bij eerste live-tests.
//   ?forceTo=<email>        → overschrijft de ontvanger (test-modus).
//                             Handig zolang je alleen naar jezelf wilt sturen.
//
// Zonder params: production-run — iteratie over alle users, echte mails.
//
// Env-secrets (via `supabase secrets set ...`):
//   RESEND_API_KEY          → verplicht in production-run. Zonder key
//                             faalt de request met 500.
//   RESEND_FROM             → optioneel; default 'onboarding@resend.dev'
//                             (Resend's testadres, werkt alleen naar
//                             het geverifieerde account-mailadres).
//
// Deployen:
//   supabase functions deploy weekly-digest --no-verify-jwt
// (--no-verify-jwt want cron roept aan zonder user-JWT.)
//
// Aanroepen (dryRun):
//   curl 'https://<project>.supabase.co/functions/v1/weekly-digest?dryRun=true&userId=<uuid>' \
//     -H 'Authorization: Bearer <anon-key>'
//
// Aanroepen (één testmail naar jezelf):
//   curl 'https://<project>.supabase.co/functions/v1/weekly-digest?userId=<uuid>&forceTo=jij@mail.nl' \
//     -H 'Authorization: Bearer <anon-key>'

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const APP_URL = 'https://quaiongen.github.io/contactbeheer';
const MAIL_MAX_CONTACTS = 5;
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Contactbeheer <onboarding@resend.dev>';

// Bucket-namen exact zoals in js/lib.js en de view.
const BUCKET_TE_LAAT = 'nu_afspraak_maken';
const BUCKET_BINNEN = 'binnen_twee_weken';
const BUCKET_AFSPRAAK = 'afspraak_staat_al';
const BUCKET_OP_SCHEMA = 'op_schema';

const ATTEMPT_VERBS: Record<string, string> = {
    bellen: 'Gebeld',
    whatsapp: 'Geappt',
    mail: 'Gemaild'
};

interface DigestRow {
    user_id: string;
    id: string;
    naam: string;
    frequency_effective: number;
    bucket: string;
    dagen_te_laat: number | null;
    laatste_poging_kanaal: string | null;
    laatste_poging_dagen: number | null;
}

interface DigestOutput {
    subject: string;
    html: string;
    text: string;
    counts: { teLaat: number; afspraak: number; opSchema: number; binnen: number; geprobeerd: number };
}

function dagWoord(n: number): string {
    return n === 1 ? 'dag' : 'dagen';
}

function urgencyText(dtl: number): string {
    if (dtl === 0) return 'vandaag';
    if (dtl > 0) return `${dtl} ${dagWoord(dtl)} te laat`;
    return `over ${-dtl} ${dagWoord(-dtl)}`;
}

function attemptText(kanaal: string | null, dagen: number | null): string | null {
    if (!kanaal || dagen === null) return null;
    const verb = ATTEMPT_VERBS[kanaal] || kanaal;
    if (dagen <= 0) return `${verb}, vandaag`;
    return `${verb}, ${dagen} ${dagWoord(dagen)} geleden`;
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (m) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]!));
}

function buildDigest(contacts: DigestRow[]): DigestOutput | null {
    const teLaat = contacts
        .filter(c => c.bucket === BUCKET_TE_LAAT)
        .sort((a, b) => (b.dagen_te_laat ?? 0) - (a.dagen_te_laat ?? 0));

    // Geen te_laat contacten → geen mail (bewuste keuze uit de brief).
    if (teLaat.length === 0) return null;

    const afspraak = contacts.filter(c => c.bucket === BUCKET_AFSPRAAK).length;
    const opSchema = contacts.filter(c => c.bucket === BUCKET_OP_SCHEMA).length;
    const binnen = contacts.filter(c => c.bucket === BUCKET_BINNEN).length;
    // Geprobeerd = subverzameling van te_laat + binnen_twee_weken met
    // een poging binnen 14 dagen (analog aan de Overzicht-tab).
    const geprobeerd = contacts.filter(c =>
        (c.bucket === BUCKET_TE_LAAT || c.bucket === BUCKET_BINNEN)
        && c.laatste_poging_kanaal !== null
    ).length;

    const top = teLaat.slice(0, MAIL_MAX_CONTACTS);

    // Subject en H1 gebruiken dezelfde tone-of-voice als het Vandaag-scherm.
    const subject = teLaat.length === 1
        ? 'Tijd voor een catch-up met 1 contact'
        : `Tijd voor een catch-up met ${teLaat.length} contacten`;

    return {
        subject,
        html: renderHtml(top, teLaat.length, { afspraak, opSchema, binnen, geprobeerd }),
        text: renderText(top, teLaat.length, { afspraak, opSchema, binnen, geprobeerd }),
        counts: { teLaat: teLaat.length, afspraak, opSchema, binnen, geprobeerd }
    };
}

function renderFooter(counts: { afspraak: number; opSchema: number; binnen: number; geprobeerd: number }): string {
    const parts: string[] = [];
    if (counts.afspraak > 0) {
        parts.push(`${counts.afspraak} ${counts.afspraak === 1 ? 'afspraak staat' : 'afspraken staan'} al in je agenda`);
    }
    if (counts.opSchema + counts.binnen > 0) {
        const n = counts.opSchema + counts.binnen;
        parts.push(`${n} ${n === 1 ? 'contact op schema' : 'contacten op schema'}`);
    }
    if (counts.geprobeerd > 0) {
        parts.push(`${counts.geprobeerd} ${counts.geprobeerd === 1 ? 'wacht' : 'wachten'} op een reactie`);
    }
    return parts.join(' · ');
}

// HTML met inline styles en tabellen. Geen flexbox/grid.
// Onder 102 KB — huidige template is < 5 KB voor 5 contacten.
function renderHtml(
    top: DigestRow[],
    teLaatTotal: number,
    counts: { afspraak: number; opSchema: number; binnen: number; geprobeerd: number }
): string {
    const rows = top.map(c => {
        const dtl = c.dagen_te_laat ?? 0;
        const attempt = attemptText(c.laatste_poging_kanaal, c.laatste_poging_dagen);
        const link = `${APP_URL}/#contact=${encodeURIComponent(c.id)}`;
        return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #EDF0F3;">
            <a href="${link}" style="color:#151A21;text-decoration:none;font-weight:600;font-size:15px;">${escapeHtml(c.naam)}</a>
            ${attempt ? `<div style="font-size:12px;color:#5B6470;margin-top:2px;">${escapeHtml(attempt)}</div>` : ''}
          </td>
          <td style="padding:12px 0;border-bottom:1px solid #EDF0F3;text-align:right;color:#B23B32;font-weight:600;font-size:13px;white-space:nowrap;">
            ${escapeHtml(urgencyText(dtl))}
          </td>
        </tr>`;
    }).join('');

    const rest = teLaatTotal - top.length;
    const restLine = rest > 0
        ? `<p style="font-size:12px;color:#5B6470;margin:8px 0 0;">Nog ${rest} ${rest === 1 ? 'contact staat' : 'contacten staan'} te lang open.</p>`
        : '';

    const footer = renderFooter(counts);

    return `<!doctype html>
<html lang="nl">
<head><meta charset="utf-8"><title>Contactbeheer — weekmail</title></head>
<body style="margin:0;padding:0;background:#F4F6F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F8;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:24px;max-width:480px;">
          <tr>
            <td>
              <h1 style="font-size:18px;font-weight:650;color:#151A21;margin:0 0 4px;">Tijd voor een catch-up met:</h1>
              <p style="font-size:12.5px;color:#5B6470;margin:0 0 16px;">Langst geleden geen contact mee gehad bovenaan · Contactbeheer</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${rows}
              </table>
              ${restLine}

              <p style="margin:20px 0 4px;">
                <a href="${APP_URL}/#vandaag" style="display:inline-block;background:#151A21;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13.5px;font-weight:600;">Openen</a>
              </p>

              ${footer ? `<p style="font-size:12px;color:#5B6470;margin:20px 0 0;">${escapeHtml(footer)}</p>` : ''}
            </td>
          </tr>
        </table>
        <p style="font-size:11px;color:#8A93A0;margin:12px 0 0;">Je krijgt deze mail omdat je de weekmail hebt aangezet. <a href="${APP_URL}/#instellingen" style="color:#8A93A0;text-decoration:underline;">Uitschrijven of een andere dag kiezen</a>.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderText(
    top: DigestRow[],
    teLaatTotal: number,
    counts: { afspraak: number; opSchema: number; binnen: number; geprobeerd: number }
): string {
    const rows = top.map(c => {
        const dtl = c.dagen_te_laat ?? 0;
        const attempt = attemptText(c.laatste_poging_kanaal, c.laatste_poging_dagen);
        const link = `${APP_URL}/#contact=${encodeURIComponent(c.id)}`;
        const lines = [
            `- ${c.naam} — ${urgencyText(dtl)}`
        ];
        if (attempt) lines.push(`  ${attempt}`);
        lines.push(`  ${link}`);
        return lines.join('\n');
    }).join('\n\n');

    const rest = teLaatTotal - top.length;
    const restLine = rest > 0
        ? `\n\nNog ${rest} ${rest === 1 ? 'contact staat' : 'contacten staan'} te lang open.`
        : '';

    const footer = renderFooter(counts);
    const footerLine = footer ? `\n\n${footer}` : '';

    return `Tijd voor een catch-up met:
Langst geleden geen contact mee gehad bovenaan · Contactbeheer

${rows}${restLine}

Openen: ${APP_URL}/#vandaag${footerLine}

--
Je krijgt deze mail omdat je de weekmail hebt aangezet.
Uitschrijven of een andere dag kiezen: ${APP_URL}/#instellingen
`;
}

async function sendViaResend(
    apiKey: string,
    from: string,
    to: string,
    subject: string,
    html: string,
    text: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
    try {
        const res = await fetch(RESEND_ENDPOINT, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ from, to, subject, html, text })
        });
        const body = await res.json();
        if (!res.ok) {
            return { ok: false, error: `Resend ${res.status}: ${body?.message ?? JSON.stringify(body)}` };
        }
        return { ok: true, id: body.id ?? '(geen id)' };
    } catch (err) {
        return { ok: false, error: `Resend fetch faalde: ${String(err)}` };
    }
}

interface UserSettingsRow {
    user_id: string;
    digest_enabled: boolean;
    digest_dag: number;
}

// Haalt alle abonnement-rijen op in één query. Service_role bypasst RLS,
// dus dit levert elke gebruiker — ook die zonder rij ontbreken hier, en
// dat is precies de bedoeling: geen rij = niet geabonneerd.
async function loadUserSettings(
    supabase: ReturnType<typeof createClient>,
    userIdFilter: string | null
): Promise<Map<string, UserSettingsRow>> {
    let query = supabase.from('user_settings').select('user_id, digest_enabled, digest_dag');
    if (userIdFilter) query = query.eq('user_id', userIdFilter);
    const { data, error } = await query;
    if (error) throw new Error(`user_settings lezen faalde: ${error.message}`);
    const map = new Map<string, UserSettingsRow>();
    for (const row of ((data ?? []) as UserSettingsRow[])) {
        map.set(row.user_id, row);
    }
    return map;
}

// Zelfde regel als `moetDigestVandaag` in js/lib.js — bewuste duplicatie,
// net als de bucket-logica in 01_view.sql. Deze function is een eigen
// deploy-eenheid en kan lib.js niet importeren. Wijzig je hier iets, wijzig
// het daar ook (test/digest-settings.test.js dekt de JS-kant).
function parseDagNummer(v: unknown): number | null {
    if (typeof v === 'number') return Number.isInteger(v) ? v : null;
    if (typeof v === 'string') {
        const t = v.trim();
        return /^\d+$/.test(t) ? parseInt(t, 10) : null;
    }
    return null;
}

function moetDigestVandaag(settings: UserSettingsRow | undefined, vandaagDow: number): boolean {
    if (!settings || settings.digest_enabled !== true) return false;
    const vandaag = parseDagNummer(vandaagDow);
    if (vandaag === null || vandaag < 0 || vandaag > 6) return false;
    const dag = settings.digest_dag === undefined || settings.digest_dag === null
        ? 1
        : parseDagNummer(settings.digest_dag);
    if (dag === null || dag < 0 || dag > 6) return false;
    return dag === vandaag;
}

async function getUserEmail(
    supabase: ReturnType<typeof createClient>,
    userId: string
): Promise<string | null> {
    const { data, error } = await (supabase as any).auth.admin.getUserById(userId);
    if (error || !data?.user?.email) return null;
    return data.user.email as string;
}

Deno.serve(async (req) => {
    try {
        const url = new URL(req.url);
        const dryRun = url.searchParams.get('dryRun')?.trim() === 'true';
        const userIdFilter = url.searchParams.get('userId')?.trim() || null;
        const forceTo = url.searchParams.get('forceTo')?.trim() || null;
        // Live verzendtest op een willekeurige dag. Zonder deze vlag faalt
        // een test met alleen ?forceTo= stil met 'andere dag' op zes van de
        // zeven dagen. `digest_enabled` blijft wél gerespecteerd — een
        // uitgeschreven gebruiker mag ook een test niet ontvangen.
        const ignoreSchedule = url.searchParams.get('ignoreSchedule')?.trim() === 'true';

        if (dryRun && !userIdFilter) {
            return new Response(
                JSON.stringify({ error: 'dryRun vereist ook &userId=<uuid>' }),
                { status: 400, headers: { 'content-type': 'application/json' } }
            );
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        let query = supabase.from('weekly_digest_v').select('*');
        if (userIdFilter) query = query.eq('user_id', userIdFilter);
        const { data: rows, error } = await query;

        if (error) {
            return new Response(
                JSON.stringify({ error: error.message }),
                { status: 500, headers: { 'content-type': 'application/json' } }
            );
        }

        // Group per user_id.
        const byUser = new Map<string, DigestRow[]>();
        for (const row of (rows as DigestRow[])) {
            if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
            byUser.get(row.user_id)!.push(row);
        }

        // --- dryRun: HTML terug, geen verzending -----------------------
        if (dryRun) {
            const userRows = byUser.get(userIdFilter!);
            if (!userRows) {
                return new Response('Geen contacten voor deze gebruiker.', { status: 404 });
            }
            const digest = buildDigest(userRows);
            if (!digest) {
                return new Response(
                    'Geen contacten in bucket nu_afspraak_maken — geen mail zou worden verstuurd.',
                    { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } }
                );
            }
            return new Response(digest.html, {
                status: 200,
                headers: { 'content-type': 'text/html; charset=utf-8' }
            });
        }

        // --- Production-run: mails via Resend --------------------------
        const apiKey = Deno.env.get('RESEND_API_KEY');
        if (!apiKey) {
            return new Response(
                JSON.stringify({ error: 'RESEND_API_KEY ontbreekt. Zet via: supabase secrets set RESEND_API_KEY=...' }),
                { status: 500, headers: { 'content-type': 'application/json' } }
            );
        }
        const from = Deno.env.get('RESEND_FROM') || DEFAULT_FROM;

        const results: Array<{
            user_id: string;
            skipped?: string;
            sent_to?: string;
            resend_id?: string;
            error?: string;
        }> = [];

        // Abonnement-filter. De cron vuurt dagelijks; per gebruiker bepaalt
        // `digest_dag` of vandaag zijn dag is.
        //
        // Dag in UTC. De cron staat op 08:00 UTC, wat in Nederland 09:00 of
        // 10:00 lokaal is — dezelfde kalenderdag. Zolang de cron ruim binnen
        // de dag valt is UTC dus veilig en hoeven we geen tijdzone-conversie
        // te doen. Verschuif je de cron naar de late avond, heroverweeg dit.
        const settingsMap = await loadUserSettings(supabase, userIdFilter);
        const vandaagDow = new Date().getUTCDay();

        for (const [uid, contacts] of byUser.entries()) {
            const s = settingsMap.get(uid);
            const geabonneerd = !!s && s.digest_enabled === true;
            const magVandaag = ignoreSchedule
                ? geabonneerd
                : moetDigestVandaag(s, vandaagDow);
            if (!magVandaag) {
                results.push({
                    user_id: uid,
                    skipped: !s
                        ? 'geen user_settings-rij (niet geabonneerd)'
                        : s.digest_enabled !== true
                            ? 'digest_enabled = false'
                            : `andere dag (digest_dag=${s.digest_dag}, vandaag=${vandaagDow})`
                });
                continue;
            }
            const digest = buildDigest(contacts);
            if (!digest) {
                results.push({ user_id: uid, skipped: 'geen contacten in nu_afspraak_maken' });
                continue;
            }
            const email = forceTo ?? (await getUserEmail(supabase, uid));
            if (!email) {
                results.push({ user_id: uid, error: 'geen e-mailadres voor gebruiker' });
                continue;
            }
            const sendResult = await sendViaResend(
                apiKey, from, email, digest.subject, digest.html, digest.text
            );
            if (sendResult.ok) {
                results.push({ user_id: uid, sent_to: email, resend_id: sendResult.id });
            } else {
                results.push({ user_id: uid, error: sendResult.error });
            }
        }

        return new Response(
            JSON.stringify({ users: results.length, results }, null, 2),
            { status: 200, headers: { 'content-type': 'application/json' } }
        );

    } catch (err) {
        return new Response(
            JSON.stringify({ error: String(err) }),
            { status: 500, headers: { 'content-type': 'application/json' } }
        );
    }
});
